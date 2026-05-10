/**
 * AI Service — Lumen (Pipeline v4)
 *
 * Core principle: NEVER invent. Only extract what's explicitly stated or clearly inferable.
 *
 * v4 fixes vs v3:
 *   - SYNTHESIS prompt now explicitly maps ALL extracted fields to output fields (branches,
 *     payment_methods, integrations, admin_requirements, languages, excluded items, numbers).
 *   - EXTRACTION prompt has an explicit "OPERATIONAL DETAILS — DO NOT SKIP" section.
 *   - Voice cleanup: no longer forces Arabic — preserves original language.
 *   - extractFacts & synthesizeBrief now use max_tokens: 4000 (was 3000).
 *   - Hallucination blocklist extended with Arabic metric phrases.
 *   - deduplicateStrings: intersection threshold 2→3 to avoid over-deduplication.
 *   - Limits raised: goals 6→8, ambiguities 6→8, mvp_scope 10→12, etc.
 */

const Groq                   = require('groq-sdk')
const { GoogleGenerativeAI } = require('@google/generative-ai')

const groq  = new Groq({ apiKey: process.env.GROQ_API_KEY })
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY)

const MODEL_FAST   = 'llama-3.1-8b-instant'
const MODEL_STRONG = 'llama-3.3-70b-versatile'

// ─── Utility ──────────────────────────────────────────────────────────────────

function cleanJson(raw) {
  return raw.trim()
    .replace(/^```(?:json)?\s*/m, '')
    .replace(/\s*```$/m, '')
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '')
    .trim()
}

function safeJsonParse(raw) {
  try   { return JSON.parse(cleanJson(raw)) }
  catch { return null }
}

async function groqCall(model, system, user, maxTokens = 2500) {
  const res = await groq.chat.completions.create({
    model,
    temperature: 0.0,
    max_tokens:  maxTokens,
    messages: [
      { role: 'system', content: system },
      { role: 'user',   content: user   },
    ],
  })
  return res.choices[0].message.content
}

// ─── Step 0: Voice Cleanup ────────────────────────────────────────────────────
// FIX: preserves original language (Arabic/English/mixed) — no forced translation.

const VOICE_CLEANUP_SYSTEM = `You are a transcription editor. Your ONLY job is to make this voice transcript readable.

STRICT RULES:
- Remove ONLY filler words: um, uh, آه, يعني (as filler), like, so, you know, أيوه (as pause filler)
- Fix punctuation and sentence breaks
- PRESERVE the original language exactly — do NOT translate Arabic to English or vice versa
- PRESERVE every number, date, name, price, feature count, branch count, and proper noun exactly as spoken
- PRESERVE mixed Arabic/English phrases exactly as spoken
- Do NOT rephrase, summarize, reorder, or interpret anything
- Do NOT add information that was not spoken
- Return only the cleaned transcript text — no labels, no explanations`

async function cleanVoiceTranscript(t) {
  if (!t || t.length < 40) return t
  try   { return await groqCall(MODEL_FAST, VOICE_CLEANUP_SYSTEM, t, 1500) }
  catch { return t }
}

// ─── Step 1: Strict Fact Extraction ──────────────────────────────────────────
// FIX: "OPERATIONAL DETAILS — DO NOT SKIP" section forces the model to surface
// every field it was previously ignoring.

const EXTRACTION_SYSTEM = `You are a fact extraction engine for a project intake system.
Your job is to extract ONLY what the client explicitly said or clearly implied.

ABSOLUTE RULES:
1. NEVER invent numbers, percentages, KPIs, metrics, growth targets, or performance benchmarks
2. NEVER invent deadlines, pricing, or timelines unless the client stated them
3. NEVER invent technical choices (framework, hosting, database) unless client specified
4. If a value is not in the input, use null
5. Every extracted item must have a confidence score and extraction_type
6. The input may be in Arabic, English, or a mix — process ALL languages equally, do NOT skip Arabic text
7. WhatsApp messages, voice note transcripts, emails, meeting notes, and uploaded documents all contain real facts — extract from all of them equally
8. Scattered or messy input is still valid — extract every detail regardless of how it was communicated

extraction_type values:
- "explicit"  — client used these exact words
- "inferred"  — strongly implied by context, not directly stated
- "assumed"   — you are guessing — use sparingly, flag clearly

OPERATIONAL DETAILS — DO NOT SKIP ANY OF THESE:
- branches_count: ANY mention of branches / locations / offices / cities (e.g. "3 branches: Cairo, Alex, Sahel" = value "3 (Cairo, Alexandria, Sahel)")
- budget: ANY mention of cost, price range, budget, "flexible", "not crazy", specific amounts with currency
- deadline: ANY relative or absolute time reference that implies a launch deadline (e.g. "before summer campaign" IS a deadline)
- payment_methods: visa, mastercard, cash on delivery, fawry, vodafone cash, instapay, or any payment mention
- admin_requirements: ANY mention of dashboard, CMS, staff portal, "without calling developers", content management, update menus
- integrations: Instagram feed, Meta ads, Google Analytics, CRM, Shopify, WhatsApp, any third-party service or platform
- user_roles: staff, admin, customer, owner, manager — any human role mentioned
- languages_required: Arabic, English, bilingual, RTL — any language or localization requirement
- platforms: web, mobile app, iOS, Android — any platform preference mentioned
- explicitly_excluded: things the client explicitly said they do NOT want (e.g. "hates orange color", "not corporate", "not cringe")
- verbatim_numbers: CAPTURE EVERY NUMBER — branch counts, years in business, budget figures, feature counts, team sizes, etc.
- verbatim_dates: CAPTURE EVERY TIME REFERENCE — "before summer", "phase 1", "2 years ago", "ASAP", campaign timing

Return ONLY this JSON — no explanation, no markdown:
{
  "project_type": { "value": "website / web app / mobile app / e-commerce / dashboard / other", "confidence": 0.0-1.0, "extraction_type": "explicit/inferred/assumed" },
  "project_name": { "value": "brand or project name, or null", "confidence": 0.0-1.0, "extraction_type": "explicit/inferred/assumed" },
  "core_problem": { "value": "the problem in client own words, or null", "confidence": 0.0-1.0, "extraction_type": "explicit/inferred/assumed" },
  "target_users": { "value": "description or null", "confidence": 0.0-1.0, "extraction_type": "explicit/inferred/assumed" },
  "budget": { "value": "exact amount with currency, or descriptive (e.g. flexible / not large), or null", "confidence": 0.0-1.0, "extraction_type": "explicit/inferred/assumed" },
  "deadline": { "value": "exact date or relative time (e.g. before summer campaign), or null", "confidence": 0.0-1.0, "extraction_type": "explicit/inferred/assumed" },
  "features": [
    {
      "name": "feature name",
      "description": "what the client said about it in their words",
      "confidence": 0.0-1.0,
      "extraction_type": "explicit/inferred/assumed",
      "phase": "mvp / future / unclear"
    }
  ],
  "integrations": [
    { "name": "integration name", "confidence": 0.0-1.0, "extraction_type": "explicit/inferred/assumed" }
  ],
  "payment_methods": [
    { "name": "method name", "confidence": 0.0-1.0, "extraction_type": "explicit/inferred/assumed" }
  ],
  "branches_count": { "value": "number or description, or null", "confidence": 0.0-1.0, "extraction_type": "explicit/inferred/assumed" },
  "user_roles": [
    { "name": "role", "confidence": 0.0-1.0, "extraction_type": "explicit/inferred/assumed" }
  ],
  "admin_requirements": [
    { "description": "what admin or staff can do", "confidence": 0.0-1.0, "extraction_type": "explicit/inferred/assumed" }
  ],
  "technical_constraints": [
    { "description": "constraint or preference", "confidence": 0.0-1.0, "extraction_type": "explicit/inferred/assumed" }
  ],
  "platforms": [
    { "name": "web / iOS / Android / etc.", "confidence": 0.0-1.0, "extraction_type": "explicit/inferred/assumed" }
  ],
  "languages_required": [
    { "name": "Arabic / English / etc.", "confidence": 0.0-1.0, "extraction_type": "explicit/inferred/assumed" }
  ],
  "explicitly_excluded": ["things client explicitly said they do NOT want"],
  "verbatim_numbers": ["every number/quantity mentioned verbatim by client"],
  "verbatim_dates": ["every date/time reference mentioned verbatim by client"],
  "input_sources": ["whatsapp / voice / email / meeting_notes / document — list all sources detected"],
  "language": "Arabic / English / Mixed",
  "input_quality": "clear / messy / very_short"
}`

async function extractFacts(input) {
  // FIX: max_tokens raised to 4000 for long messy multi-channel inputs
  const raw = await groqCall(
    MODEL_STRONG,
    EXTRACTION_SYSTEM,
    `Extract ALL facts from this client input. The input may come from multiple channels (WhatsApp, email, voice note, meeting notes, uploaded document). Process every section thoroughly:\n\n${input}`,
    4000
  )
  return safeJsonParse(raw)
}

// ─── Step 2: In-process Dedup + Validation ────────────────────────────────────

function getValue(field) {
  if (!field) return null
  if (typeof field === 'string') return field
  return field.value ?? null
}

function getConfidence(field) {
  if (!field) return 0
  return field.confidence ?? 0
}

function getType(field) {
  if (!field) return 'assumed'
  return field.extraction_type ?? 'assumed'
}

// FIX: intersection threshold raised 2→3 to avoid over-deduplicating distinct items
function deduplicateStrings(arr) {
  if (!Array.isArray(arr) || arr.length === 0) return []
  const seen = []
  for (const item of arr) {
    const s = item.toLowerCase().trim()
    const isDuplicate = seen.some(existing => {
      const words1 = new Set(s.split(/\s+/).filter(w => w.length > 3))
      const words2 = new Set(existing.split(/\s+/).filter(w => w.length > 3))
      const intersection = [...words1].filter(w => words2.has(w))
      return intersection.length >= Math.min(3, Math.min(words1.size, words2.size))
    })
    if (!isDuplicate) seen.push(s)
  }
  return arr.filter(item => seen.includes(item.toLowerCase().trim()))
}

const CONFIDENCE_THRESHOLD = 0.5

function filterByConfidence(items = [], threshold = CONFIDENCE_THRESHOLD) {
  return items.filter(item => (item.confidence ?? 1) >= threshold)
}

// FIX: hallucination patterns extended with Arabic metric phrases
const HALLUCINATION_PATTERNS = [
  /\d+%/,
  /increase.*by/i,
  /reduce.*by/i,
  /improve.*by/i,
  /grow.*by/i,
  /top \d/i,
  /rank.*#?\d/i,
  /conversion rate/i,
  /bounce rate/i,
  /loading speed/i,
  /response time/i,
  /زيادة.*بنسبة/,
  /تحسين.*بنسبة/,
  /تقليل.*بنسبة/,
  /أفضل.*بنسبة/,
]

function containsHallucination(text) {
  if (!text) return false
  return HALLUCINATION_PATTERNS.some(p => p.test(text))
}

function sanitizeGoals(goals = []) {
  return goals.filter(g => !containsHallucination(g))
}

function validateExtraction(facts) {
  if (!facts) return null

  if (Array.isArray(facts.features))           facts.features           = filterByConfidence(facts.features)
  if (Array.isArray(facts.integrations))       facts.integrations       = filterByConfidence(facts.integrations)
  if (Array.isArray(facts.user_roles))         facts.user_roles         = filterByConfidence(facts.user_roles)
  if (Array.isArray(facts.admin_requirements)) facts.admin_requirements = filterByConfidence(facts.admin_requirements)
  if (Array.isArray(facts.payment_methods))    facts.payment_methods    = filterByConfidence(facts.payment_methods)
  if (Array.isArray(facts.platforms))          facts.platforms          = filterByConfidence(facts.platforms)
  if (Array.isArray(facts.languages_required)) facts.languages_required = filterByConfidence(facts.languages_required)

  // Drop assumed budget/deadline — too risky to present as fact
  if (getType(facts.budget)   === 'assumed') facts.budget   = null
  if (getType(facts.deadline) === 'assumed') facts.deadline = null

  return facts
}

// ─── Step 3: Brief Synthesis ──────────────────────────────────────────────────
// FIX: FIELD MAPPING section explicitly lists every extracted field and where it must
// appear in the output — prevents the model from silently dropping operational details.

const SYNTHESIS_SYSTEM = `You are a senior project manager writing a professional project brief from verified extracted data.

ABSOLUTE RULES:
1. Only use information present in the input data — NEVER invent
2. NEVER write percentages, KPIs, growth targets, or performance metrics unless they appear in verbatim_numbers
3. NEVER invent deadlines, budgets, or technical choices
4. Goals must reflect client intent — no generic business advice, no invented metrics
5. If a field is null in the input, do not mention it at all
6. Keep ambiguities non-repetitive — one clear statement per issue, no rewordings of the same thing
7. Mark inferred items with "(inferred)" and assumed items with "(assumed — needs confirmation)"

REQUIRED FIELD MAPPING — include these if they exist in the extracted data:
- branches_count → business_details.branches (e.g. "3 branches: Cairo, Alexandria, Sahel")
- payment_methods → technical_details.payment_methods (list every one)
- integrations → technical_details.integrations (list every one)
- languages_required → technical_details.constraints (e.g. "Arabic and English language support required")
- admin_requirements → mvp_scope or explicit_facts (e.g. "Staff CMS to update menu items without developer help")
- platforms → technical_details.platforms
- explicitly_excluded → technical_details.constraints (e.g. "Client excluded: orange color, corporate feel")
- verbatim_numbers → explicit_facts (e.g. "3 branches confirmed: Cairo, Alexandria, Sahel")
- verbatim_dates → explicit_facts or business_details.deadline
- budget (if not null) → business_details.budget AND summary
- deadline (if not null) → business_details.deadline AND summary

GOALS RULES — examples:
  GOOD: "Establish professional online presence to satisfy investor expectations"
  GOOD: "Enable customers to browse products and place future online orders"
  GOOD: "Support Arabic and English speaking customers across 3 branches"
  BAD: "Increase conversions by 37%" — NEVER write this
  BAD: "Reduce bounce rate by 50%" — NEVER write this
  BAD: "Improve loading speed by 30%" — NEVER write this

AMBIGUITIES RULES:
- One ambiguity per topic — no duplicates, no rewordings of the same issue
- Only flag what is genuinely unclear and has real business impact

Return ONLY this JSON — no explanation, no markdown:
{
  "project_title": "concise title based on project_type and project_name",
  "summary": "2-4 sentences: what client wants, for whom, key confirmed constraints. No invented details.",
  "goals": [
    "Goal derived directly from client intent"
  ],
  "explicit_facts": [
    "Confirmed fact (e.g. 3 branches: Cairo, Alex, Sahel | Deadline: before summer campaign | Budget: flexible)"
  ],
  "inferred_needs": [
    "Need inferred from context (inferred)"
  ],
  "mvp_scope": ["Feature confirmed or strongly implied for first launch"],
  "future_scope": ["Feature client mentioned as optional or later phase"],
  "technical_details": {
    "integrations": ["every integration mentioned"],
    "payment_methods": ["every payment method mentioned"],
    "platforms": ["web / iOS / Android / etc."],
    "constraints": ["language support, excluded items, tech preferences, hosting notes, SEO requirements"]
  },
  "business_details": {
    "budget": "value or null",
    "deadline": "value or null",
    "branches": "value or null",
    "user_roles": ["roles mentioned"]
  },
  "ambiguities": [
    "Single clear statement of one unresolved issue"
  ],
  "follow_up_questions": [
    "One direct question per ambiguity?"
  ],
  "estimated_complexity": "low / medium / high",
  "suggested_timeline": "range only if inferable from scope, else null",
  "risks": ["Risk based on actual scope gaps"]
}`

async function synthesizeBrief(facts) {
  // FIX: max_tokens raised to 4000 to prevent truncated output
  const raw = await groqCall(
    MODEL_STRONG,
    SYNTHESIS_SYSTEM,
    `Generate a professional project brief from this verified extracted data.\nIMPORTANT: Make sure ALL of these appear in your output if they exist: branches_count, payment_methods, integrations, admin_requirements, languages_required, explicitly_excluded, verbatim_numbers, verbatim_dates.\n\n${JSON.stringify(facts, null, 2)}`,
    4000
  )
  return safeJsonParse(raw)
}

// ─── Output Normalizer ────────────────────────────────────────────────────────

function normalizeBriefOutput(synthesized, fallbackTitle = '') {
  if (!synthesized) {
    return {
      project_title:        fallbackTitle,
      summary:              'The input was too vague to generate a structured brief. Please provide more detail.',
      goals:                [],
      ambiguities:          ['Insufficient information to extract project requirements'],
      follow_up_questions:  ['Could you describe what you need in more detail?'],
      estimated_complexity: 'medium',
      suggested_timeline:   null,
      mvp_scope:            [],
      future_scope:         [],
      explicit_facts:       [],
      inferred_needs:       [],
      technical_details:    { integrations: [], payment_methods: [], platforms: [], constraints: [] },
      business_details:     { budget: null, deadline: null, branches: null, user_roles: [] },
      risks:                [],
    }
  }

  const cleanGoals       = sanitizeGoals(synthesized.goals || [])
  const cleanAmbiguities = deduplicateStrings(synthesized.ambiguities || [])
  const cleanQuestions   = deduplicateStrings(synthesized.follow_up_questions || [])

  return {
    project_title:        synthesized.project_title     || fallbackTitle,
    summary:              synthesized.summary           || '',
    goals:                cleanGoals.slice(0, 8),
    ambiguities:          cleanAmbiguities.slice(0, 8),
    follow_up_questions:  cleanQuestions.slice(0, 8),
    estimated_complexity: ['low','medium','high'].includes(synthesized.estimated_complexity)
                            ? synthesized.estimated_complexity : 'medium',
    suggested_timeline:   synthesized.suggested_timeline || null,
    mvp_scope:            (synthesized.mvp_scope         || []).slice(0, 12),
    future_scope:         (synthesized.future_scope      || []).slice(0, 10),
    explicit_facts:       (synthesized.explicit_facts    || []).slice(0, 10),
    inferred_needs:       (synthesized.inferred_needs    || []).slice(0, 6),
    technical_details:    synthesized.technical_details  || { integrations: [], payment_methods: [], platforms: [], constraints: [] },
    business_details:     synthesized.business_details  || { budget: null, deadline: null, branches: null, user_roles: [] },
    risks:                (synthesized.risks             || []).slice(0, 5),
  }
}

// ─── Public: generateBrief ────────────────────────────────────────────────────

async function generateBrief({ rawText = '', transcriptions = [], interpretations = [] }) {
  const cleanedTranscriptions = await Promise.all(transcriptions.map(cleanVoiceTranscript))

  const parts = []
  if (rawText)                      parts.push(`CLIENT TEXT INPUT:\n${rawText}`)
  if (cleanedTranscriptions.length) parts.push(`VOICE NOTE TRANSCRIPTIONS:\n${cleanedTranscriptions.join('\n---\n')}`)
  if (interpretations.length)       parts.push(`UPLOADED ATTACHMENTS (images/documents):\n${interpretations.join('\n---\n')}`)

  const combinedInput = parts.join('\n\n===\n\n') || 'No input provided.'

  let facts = null
  try        { facts = await extractFacts(combinedInput) }
  catch (err){ console.error('Extraction failed:', err.message) }

  facts = validateExtraction(facts)

  let synthesized = null
  if (facts) {
    try        { synthesized = await synthesizeBrief(facts) }
    catch (err){ console.error('Synthesis failed:', err.message) }
  }

  return normalizeBriefOutput(synthesized)
}

// ─── Public: regenerateBrief ──────────────────────────────────────────────────

const REGEN_SYSTEM = `You are a senior project manager updating a project brief based on client feedback.
Return ONLY valid JSON with the exact same shape as the input brief — no markdown, no backticks.

RULES:
- Incorporate every correction the client made
- Remove ambiguities the client has now answered
- Add new facts the client provided — mark them as explicit
- NEVER invent numbers, metrics, or timelines not stated in the feedback
- Do NOT remove goals the client did not object to
- If client provided budget or deadline, update business_details and mention in summary
- Preserve technical_details fields (integrations, payment_methods, platforms, constraints)
Return ONLY the JSON`

async function regenerateBrief(currentVersion, feedback) {
  const original = JSON.stringify({
    summary:           currentVersion.summary,
    goals:             currentVersion.goals,
    ambiguities:       currentVersion.ambiguities,
    follow_up_questions: currentVersion.follow_up_questions,
    mvp_scope:         currentVersion.mvp_scope,
    future_scope:      currentVersion.future_scope,
    business_details:  currentVersion.business_details,
    technical_details: currentVersion.technical_details,
    explicit_facts:    currentVersion.explicit_facts,
    inferred_needs:    currentVersion.inferred_needs,
  }, null, 2)

  const feedbackText = [
    feedback.summary && `On the summary: ${feedback.summary}`,
    feedback.goals   && `On the goals: ${feedback.goals}`,
    feedback.missing && `Answers to open questions: ${feedback.missing}`,
    feedback.extra   && `Additional context: ${feedback.extra}`,
  ].filter(Boolean).join('\n\n')

  const raw = await groqCall(
    MODEL_STRONG,
    REGEN_SYSTEM,
    `CURRENT BRIEF:\n${original}\n\nCLIENT FEEDBACK:\n${feedbackText}\n\nGenerate updated brief.`,
    4000
  )

  const parsed = safeJsonParse(raw)
  if (!parsed) return normalizeBriefOutput(null, currentVersion.project_title)

  const cleanGoals       = sanitizeGoals(parsed.goals || currentVersion.goals || [])
  const cleanAmbiguities = deduplicateStrings(parsed.ambiguities || [])
  const cleanQuestions   = deduplicateStrings(parsed.follow_up_questions || [])

  return {
    project_title:        parsed.project_title        || currentVersion.project_title || '',
    summary:              parsed.summary              || currentVersion.summary || '',
    goals:                cleanGoals.slice(0, 8),
    ambiguities:          cleanAmbiguities.slice(0, 8),
    follow_up_questions:  cleanQuestions.slice(0, 8),
    estimated_complexity: ['low','medium','high'].includes(parsed.estimated_complexity)
                            ? parsed.estimated_complexity : currentVersion.estimated_complexity || 'medium',
    suggested_timeline:   parsed.suggested_timeline   || currentVersion.suggested_timeline || null,
    mvp_scope:            parsed.mvp_scope            || currentVersion.mvp_scope     || [],
    future_scope:         parsed.future_scope         || currentVersion.future_scope  || [],
    explicit_facts:       parsed.explicit_facts       || currentVersion.explicit_facts || [],
    inferred_needs:       parsed.inferred_needs       || currentVersion.inferred_needs || [],
    technical_details:    parsed.technical_details    || currentVersion.technical_details || {},
    business_details:     parsed.business_details     || currentVersion.business_details || {},
    risks:                parsed.risks                || currentVersion.risks         || [],
  }
}

// ─── Public: interpretImage ───────────────────────────────────────────────────

async function interpretImage(imageBuffer, mimeType) {
  const model = genAI.getGenerativeModel({ model: process.env.GEMINI_MODEL || 'gemini-2.5-flash' })
  const result = await model.generateContent([
    `You are a design analyst. A client uploaded this image as part of a project brief.
Describe exactly what you see: text, UI elements, annotations, arrows, labels, numbers, prices, colors, layout structure.
If there are handwritten notes or arrows, describe what they point to and what they say.
Do NOT invent purpose or meaning — only describe what is visually present.
Plain paragraphs only, no bullet points, no JSON.`,
    { inlineData: { data: imageBuffer.toString('base64'), mimeType } },
  ])
  return result.response.text()
}

module.exports = { generateBrief, regenerateBrief, interpretImage }
