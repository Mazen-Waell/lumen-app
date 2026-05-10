/**
 * AI Service — Lumen (Pipeline v3)
 *
 * Core principle: NEVER invent. Only extract what's explicitly stated or clearly inferable.
 *
 * Pipeline:
 *   Step 0 — Voice cleanup          (llama-3.1-8b-instant)
 *   Step 1 — Strict fact extraction (llama-3.3-70b)
 *   Step 2 — Dedup + validation     (in-process, no LLM)
 *   Step 3 — Brief synthesis        (llama-3.3-70b)
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
    temperature: 0.0,   // zero temp = maximum factual consistency
    max_tokens:  maxTokens,
    messages: [
      { role: 'system', content: system },
      { role: 'user',   content: user   },
    ],
  })
  return res.choices[0].message.content
}

// ─── Step 0: Voice Cleanup ────────────────────────────────────────────────────

const VOICE_CLEANUP_SYSTEM = `You are a transcription editor. Your only job is to make this voice transcript readable.

STRICT RULES:
- Remove ONLY filler words: um, uh, آه, يعني (when used as filler), like, so, you know
- Fix punctuation and sentence breaks
- PRESERVE every number, date, name, price, feature, and proper noun exactly as spoken
- Do NOT rephrase, summarize, or interpret anything
- Do NOT add information that was not spoken
- Return only the cleaned transcript text`

async function cleanVoiceTranscript(t) {
  if (!t || t.length < 40) return t
  try   { return await groqCall(MODEL_FAST, VOICE_CLEANUP_SYSTEM, t, 1500) }
  catch { return t }
}

// ─── Step 1: Strict Fact Extraction ──────────────────────────────────────────

const EXTRACTION_SYSTEM = `You are a fact extraction engine. Your job is to extract ONLY what the client explicitly said or clearly implied.

ABSOLUTE RULES — violation = broken system:
1. NEVER invent numbers, percentages, KPIs, metrics, growth targets, or performance benchmarks
2. NEVER invent deadlines, pricing, or timelines unless the client stated them
3. NEVER invent technical choices (framework, hosting, database) unless client specified
4. If a value is not in the input → use null
5. Every extracted item must have a confidence score and extraction_type

extraction_type values:
- "explicit"  → client used these exact words
- "inferred"  → strongly implied by context, not directly stated
- "assumed"   → you are guessing — use sparingly, flag clearly

Return ONLY this JSON — no explanation, no markdown:
{
  "project_type": { "value": "web app / mobile / e-commerce / dashboard / other", "confidence": 0.0-1.0, "extraction_type": "explicit/inferred/assumed" },
  "project_name": { "value": "name or null", "confidence": 0.0-1.0, "extraction_type": "explicit/inferred/assumed" },
  "core_problem": { "value": "the problem in client's own words, or null", "confidence": 0.0-1.0, "extraction_type": "explicit/inferred/assumed" },
  "target_users": { "value": "description or null", "confidence": 0.0-1.0, "extraction_type": "explicit/inferred/assumed" },
  "budget": { "value": "exact amount with currency, or null", "confidence": 0.0-1.0, "extraction_type": "explicit/inferred/assumed" },
  "deadline": { "value": "exact date or relative time, or null", "confidence": 0.0-1.0, "extraction_type": "explicit/inferred/assumed" },
  "features": [
    {
      "name": "feature name",
      "description": "what the client said about it — their words, not your interpretation",
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
    { "description": "what admin can do", "confidence": 0.0-1.0, "extraction_type": "explicit/inferred/assumed" }
  ],
  "technical_constraints": [
    { "description": "constraint", "confidence": 0.0-1.0, "extraction_type": "explicit/inferred/assumed" }
  ],
  "explicitly_excluded": ["things client said they do NOT want"],
  "verbatim_numbers": ["every number/quantity mentioned verbatim by client"],
  "verbatim_dates": ["every date/time reference mentioned verbatim by client"],
  "language": "Arabic / English / Mixed",
  "input_quality": "clear / messy / very_short"
}`

async function extractFacts(input) {
  const raw = await groqCall(
    MODEL_STRONG,
    EXTRACTION_SYSTEM,
    `Extract facts from this client input:\n\n${input}`,
    3000
  )
  return safeJsonParse(raw)
}

// ─── Step 2: In-process Dedup + Validation ────────────────────────────────────
// No LLM call. Pure logic.

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

// Remove semantically duplicate strings from an array
function deduplicateStrings(arr) {
  if (!Array.isArray(arr) || arr.length === 0) return []
  const seen = []
  for (const item of arr) {
    const s = item.toLowerCase().trim()
    // check if any existing item covers the same topic (simple overlap check)
    const isDuplicate = seen.some(existing => {
      const words1 = new Set(s.split(/\s+/).filter(w => w.length > 3))
      const words2 = new Set(existing.split(/\s+/).filter(w => w.length > 3))
      const intersection = [...words1].filter(w => words2.has(w))
      return intersection.length >= Math.min(2, Math.min(words1.size, words2.size))
    })
    if (!isDuplicate) seen.push(s)
  }
  // return originals that passed dedup (preserving casing)
  return arr.filter((item, idx) => {
    const s = item.toLowerCase().trim()
    return seen.includes(s)
  })
}

// Filter extracted items by confidence threshold
const CONFIDENCE_THRESHOLD = 0.5

function filterByConfidence(items = [], threshold = CONFIDENCE_THRESHOLD) {
  return items.filter(item => (item.confidence ?? 1) >= threshold)
}

// Validate that no hallucinated metrics slipped through
const HALLUCINATION_PATTERNS = [
  /\d+%/,                          // any percentage
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

  // Filter low-confidence features
  if (Array.isArray(facts.features)) {
    facts.features = filterByConfidence(facts.features)
  }
  if (Array.isArray(facts.integrations)) {
    facts.integrations = filterByConfidence(facts.integrations)
  }
  if (Array.isArray(facts.user_roles)) {
    facts.user_roles = filterByConfidence(facts.user_roles)
  }

  // Drop assumed budget/deadline (too risky to present as fact)
  if (getType(facts.budget) === 'assumed')   facts.budget   = null
  if (getType(facts.deadline) === 'assumed') facts.deadline = null

  return facts
}

// ─── Step 3: Brief Synthesis ──────────────────────────────────────────────────

const SYNTHESIS_SYSTEM = `You are a senior project manager writing a project brief from verified extracted data.

ABSOLUTE RULES:
1. Only use information present in the input data — NEVER invent
2. NEVER write percentages, KPIs, growth targets, or performance metrics unless they appear in verbatim_numbers
3. NEVER invent deadlines, budgets, or technical choices
4. Goals must reflect client intent — not generic business advice
5. If a field is null in the input → do not mention it or mark it as "Not specified"
6. Keep ambiguities non-repetitive — one clear statement per issue
7. Mark inferred items with "(inferred)" — mark assumed items with "(assumed — needs confirmation)"

Return ONLY this JSON:
{
  "project_title": "concise title based on project_type and project_name",
  "summary": "2-3 sentences: what client wants, for whom, and any confirmed constraints. No invented details.",
  "goals": [
    "Goal derived from client intent — no invented metrics"
  ],
  "explicit_facts": [
    "Confirmed fact 1 (budget, deadline, feature count, etc.)"
  ],
  "inferred_needs": [
    "Need inferred from context (inferred)"
  ],
  "mvp_scope": ["Feature confirmed for first launch"],
  "future_scope": ["Feature mentioned for later"],
  "technical_details": {
    "integrations": [],
    "payment_methods": [],
    "platforms": [],
    "constraints": []
  },
  "business_details": {
    "budget": "value or null",
    "deadline": "value or null",
    "branches": "value or null",
    "user_roles": []
  },
  "ambiguities": [
    "Single clear statement of what is missing — no duplicates"
  ],
  "follow_up_questions": [
    "One direct question per ambiguity?"
  ],
  "estimated_complexity": "low / medium / high",
  "suggested_timeline": "range only if inferable from scope — else null",
  "risks": ["Risk based on actual scope gaps"]
}`

async function synthesizeBrief(facts) {
  const raw = await groqCall(
    MODEL_STRONG,
    SYNTHESIS_SYSTEM,
    `Generate a project brief from this verified extracted data:\n\n${JSON.stringify(facts, null, 2)}`,
    3000
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

  // Sanitize goals — remove any hallucinated metrics
  const cleanGoals = sanitizeGoals(synthesized.goals || [])

  // Deduplicate ambiguities and questions
  const cleanAmbiguities = deduplicateStrings(synthesized.ambiguities || [])
  const cleanQuestions   = deduplicateStrings(synthesized.follow_up_questions || [])

  // Enforce max limits to prevent bloat
  return {
    project_title:        synthesized.project_title     || fallbackTitle,
    summary:              synthesized.summary           || '',
    goals:                cleanGoals.slice(0, 6),
    ambiguities:          cleanAmbiguities.slice(0, 6),
    follow_up_questions:  cleanQuestions.slice(0, 6),
    estimated_complexity: ['low','medium','high'].includes(synthesized.estimated_complexity)
                            ? synthesized.estimated_complexity : 'medium',
    suggested_timeline:   synthesized.suggested_timeline || null,
    mvp_scope:            (synthesized.mvp_scope         || []).slice(0, 10),
    future_scope:         (synthesized.future_scope      || []).slice(0, 8),
    explicit_facts:       (synthesized.explicit_facts    || []).slice(0, 8),
    inferred_needs:       (synthesized.inferred_needs    || []).slice(0, 5),
    technical_details:    synthesized.technical_details  || { integrations: [], payment_methods: [], platforms: [], constraints: [] },
    business_details:     synthesized.business_details  || { budget: null, deadline: null, branches: null, user_roles: [] },
    risks:                (synthesized.risks             || []).slice(0, 4),
  }
}

// ─── Public: generateBrief ────────────────────────────────────────────────────

async function generateBrief({ rawText = '', transcriptions = [], interpretations = [] }) {
  // Step 0: clean voice transcripts
  const cleanedTranscriptions = await Promise.all(transcriptions.map(cleanVoiceTranscript))

  const parts = []
  if (rawText)                      parts.push(`CLIENT TEXT:\n${rawText}`)
  if (cleanedTranscriptions.length) parts.push(`VOICE TRANSCRIPTIONS:\n${cleanedTranscriptions.join('\n---\n')}`)
  if (interpretations.length)       parts.push(`ATTACHMENTS:\n${interpretations.join('\n---\n')}`)

  const combinedInput = parts.join('\n\n===\n\n') || 'No input provided.'

  // Step 1: extract facts
  let facts = null
  try        { facts = await extractFacts(combinedInput) }
  catch (err){ console.error('Extraction failed:', err.message) }

  // Step 2: validate + dedup (in-process)
  facts = validateExtraction(facts)

  // Step 3: synthesize
  let synthesized = null
  if (facts) {
    try        { synthesized = await synthesizeBrief(facts) }
    catch (err){ console.error('Synthesis failed:', err.message) }
  }

  return normalizeBriefOutput(synthesized)
}

// ─── Public: regenerateBrief ──────────────────────────────────────────────────

const REGEN_SYSTEM = `You are a senior project manager updating a project brief based on client feedback.
Return ONLY valid JSON with the exact same shape — no markdown, no backticks.

RULES:
- Incorporate every correction the client made
- Remove ambiguities the client has now answered
- Add new facts the client provided — mark them as explicit
- NEVER invent numbers, metrics, or timelines not stated in the feedback
- Do NOT remove goals the client did not object to
- If client provided budget or deadline → update business_details and mention in summary
Return ONLY the JSON`

async function regenerateBrief(currentVersion, feedback) {
  const original = JSON.stringify({
    summary:          currentVersion.summary,
    goals:            currentVersion.goals,
    ambiguities:      currentVersion.ambiguities,
    follow_up_questions: currentVersion.follow_up_questions,
    mvp_scope:        currentVersion.mvp_scope,
    future_scope:     currentVersion.future_scope,
    business_details: currentVersion.business_details,
    technical_details:currentVersion.technical_details,
    explicit_facts:   currentVersion.explicit_facts,
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
    3000
  )

  const parsed = safeJsonParse(raw)
  if (!parsed) return normalizeBriefOutput(null, currentVersion.project_title)

  const cleanGoals       = sanitizeGoals(parsed.goals || currentVersion.goals || [])
  const cleanAmbiguities = deduplicateStrings(parsed.ambiguities || [])
  const cleanQuestions   = deduplicateStrings(parsed.follow_up_questions || [])

  return {
    project_title:        parsed.project_title        || currentVersion.project_title || '',
    summary:              parsed.summary              || currentVersion.summary || '',
    goals:                cleanGoals.slice(0, 6),
    ambiguities:          cleanAmbiguities.slice(0, 6),
    follow_up_questions:  cleanQuestions.slice(0, 6),
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
Describe exactly what you see: text, UI elements, annotations, arrows, labels, numbers, prices.
Do NOT invent purpose or meaning — only describe what is visually present.
Plain paragraphs only, no bullet points, no JSON.`,
    { inlineData: { data: imageBuffer.toString('base64'), mimeType } },
  ])
  return result.response.text()
}

module.exports = { generateBrief, regenerateBrief, interpretImage }
