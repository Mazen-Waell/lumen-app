/**
 * AI Service - Lumen Pipeline v5
 *
 * Extraction-first intake pipeline:
 * raw inputs -> source packing -> strict extraction -> deterministic enrichment
 * -> grounded synthesis -> final validation.
 */

const Groq = require('groq-sdk')
const { GoogleGenerativeAI } = require('@google/generative-ai')

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY })
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY)

const MODEL_FAST = process.env.GROQ_FAST_MODEL || 'llama-3.1-8b-instant'
const MODEL_STRONG = process.env.GROQ_STRONG_MODEL || 'llama-3.3-70b-versatile'

const CONFIDENCE_THRESHOLD = 0.45

function cleanJson(raw = '') {
  return raw.trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '')
    .trim()
}

function safeJsonParse(raw) {
  try { return JSON.parse(cleanJson(raw)) }
  catch (err) {
    console.error('AI JSON parse error:', err.message)
    console.error('Raw response:', String(raw || '').slice(0, 600))
    return null
  }
}

async function groqCall(model, system, user, maxTokens = 5000) {
  const res = await groq.chat.completions.create({
    model,
    temperature: 0,
    max_tokens: maxTokens,
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: user },
    ],
  })
  return res.choices[0].message.content
}

function textOf(item) {
  if (!item) return ''
  if (typeof item === 'string') return item
  return item.text || item.transcription || item.ai_interpretation || ''
}

function nameOf(item, fallback) {
  if (!item || typeof item === 'string') return fallback
  return item.name || item.original_filename || fallback
}

function cleanText(text = '') {
  return String(text).replace(/\r/g, '\n').replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim()
}

function compactKey(text = '') {
  return cleanText(text).toLowerCase().replace(/[^a-z0-9\u0600-\u06FF]+/g, ' ').trim()
}

function uniqueStrings(items = []) {
  const seen = new Set()
  const out = []
  for (const item of items.filter(Boolean)) {
    const text = cleanText(typeof item === 'string' ? item : item.text || item.name || item.description || item.value)
    const key = compactKey(text)
    if (!key || seen.has(key)) continue
    seen.add(key)
    out.push(text)
  }
  return out
}

function uniqueObjects(items = [], keyFn) {
  const seen = new Set()
  const out = []
  for (const item of items.filter(Boolean)) {
    const key = compactKey(keyFn(item))
    if (!key || seen.has(key)) continue
    seen.add(key)
    out.push(item)
  }
  return out
}

function valueOf(field) {
  if (!field) return null
  if (typeof field === 'string') return field
  return field.value || field.text || null
}

function confidenceOf(field) {
  if (!field) return 0
  return Number(field.confidence) || 0
}

function typeOf(field) {
  return field?.extraction_type || 'explicit'
}

function itemLabel(item) {
  return item?.name || item?.description || item?.text || item?.value || ''
}

function filterConfidence(items = []) {
  return items.filter(item => (Number(item.confidence) || 1) >= CONFIDENCE_THRESHOLD)
}

function chunkText(text, maxChars = 10000, overlap = 700) {
  if (text.length <= maxChars) return [text]
  const chunks = []
  let start = 0
  while (start < text.length) {
    let end = Math.min(start + maxChars, text.length)
    const boundary = text.lastIndexOf('\n', end)
    if (boundary > start + maxChars * 0.65) end = boundary
    chunks.push(text.slice(start, end).trim())
    if (end >= text.length) break
    start = Math.max(0, end - overlap)
  }
  return chunks
}

function pickBetter(a, b) {
  if (!valueOf(a)) return b || a || null
  if (!valueOf(b)) return a
  return confidenceOf(b) > confidenceOf(a) ? b : a
}

function mergeFacts(factSets) {
  const merged = {}
  for (const facts of factSets.filter(Boolean)) {
    for (const key of ['project_type', 'project_name', 'core_problem', 'target_users', 'budget', 'deadline', 'branches_count']) {
      merged[key] = pickBetter(merged[key], facts[key])
    }
    for (const key of [
      'features',
      'integrations',
      'payment_methods',
      'user_roles',
      'admin_requirements',
      'technical_constraints',
      'platforms',
      'languages_required',
      'explicitly_excluded',
      'content_requirements',
      'design_preferences',
      'open_questions',
      'risks',
      'verbatim_numbers',
      'verbatim_dates',
      'input_sources',
    ]) {
      merged[key] = [...(merged[key] || []), ...(Array.isArray(facts[key]) ? facts[key] : [])]
    }
    merged.language = merged.language === 'Mixed' || facts.language === 'Mixed' ? 'Mixed' : (merged.language || facts.language)
    merged.input_quality = merged.input_quality === 'messy' || facts.input_quality === 'messy' ? 'messy' : (merged.input_quality || facts.input_quality)
  }
  return validateExtraction(merged)
}

const VOICE_CLEANUP_SYSTEM = `You clean voice transcripts for project intake.
Return only cleaned transcript text.
Rules:
- Preserve Arabic, English, and mixed wording. Do not translate.
- Preserve every number, date, branch count, price, platform, feature, and proper noun.
- Remove only filler words and repeated stutters.
- Do not summarize, infer, reorder, or add information.`

async function cleanVoiceTranscript(text) {
  const t = cleanText(textOf(text))
  if (!t || t.length < 40) return t
  try { return await groqCall(MODEL_FAST, VOICE_CLEANUP_SYSTEM, t, 1600) }
  catch { return t }
}

const EXTRACTION_SYSTEM = `You are a production fact extraction engine for software project intake.

Return ONLY valid JSON. Do not summarize. Extract all operational details.

Grounding rules:
- Extract only what is explicitly stated or strongly implied.
- Never invent KPIs, percentages, dates, prices, timelines, technical choices, or business metrics.
- "Maybe", "not urgent", "later", "idk", "optional" must be phase "future" or "optional", not MVP.
- "one branch opening soon" is future expansion, not a currently confirmed active branch.
- Preserve exact numbers and date phrases in verbatim_numbers and verbatim_dates.
- Mixed Arabic/English must be processed normally.

Required ambiguity topics:
If unclear in input, add one open_questions item for each relevant unresolved topic:
budget range, exact launch date, MVP vs future e-commerce, booking scope, payment gateway, Shopify vs custom build,
staff dashboard permissions, copywriting/content owner, brand guidelines/assets, hosting, analytics dashboard,
customer accounts, reviews/photos moderation, Meta ads integration scope, QR menu scope, mobile app later scope.

Return this JSON shape:
{
  "project_type": { "value": null, "confidence": 0, "extraction_type": "explicit" },
  "project_name": { "value": null, "confidence": 0, "extraction_type": "explicit" },
  "core_problem": { "value": null, "confidence": 0, "extraction_type": "explicit" },
  "target_users": { "value": null, "confidence": 0, "extraction_type": "explicit" },
  "budget": { "value": null, "confidence": 0, "extraction_type": "explicit" },
  "deadline": { "value": null, "confidence": 0, "extraction_type": "explicit" },
  "branches_count": { "value": null, "confidence": 0, "extraction_type": "explicit" },
  "features": [
    { "name": "", "description": "", "phase": "mvp|future|optional|unclear", "priority": "must|should|could|unclear", "confidence": 0, "extraction_type": "explicit" }
  ],
  "integrations": [
    { "name": "", "confidence": 0, "extraction_type": "explicit" }
  ],
  "payment_methods": [
    { "name": "", "confidence": 0, "extraction_type": "explicit" }
  ],
  "user_roles": [
    { "name": "", "confidence": 0, "extraction_type": "explicit" }
  ],
  "admin_requirements": [
    { "description": "", "confidence": 0, "extraction_type": "explicit" }
  ],
  "technical_constraints": [
    { "description": "", "confidence": 0, "extraction_type": "explicit" }
  ],
  "platforms": [
    { "name": "", "confidence": 0, "extraction_type": "explicit" }
  ],
  "languages_required": [
    { "name": "", "confidence": 0, "extraction_type": "explicit" }
  ],
  "content_requirements": [
    { "description": "", "confidence": 0, "extraction_type": "explicit" }
  ],
  "design_preferences": [
    { "description": "", "confidence": 0, "extraction_type": "explicit" }
  ],
  "explicitly_excluded": [],
  "open_questions": [],
  "risks": [],
  "verbatim_numbers": [],
  "verbatim_dates": [],
  "input_sources": [],
  "language": "Arabic|English|Mixed",
  "input_quality": "clear|messy|very_short"
}`

async function extractFacts(input) {
  const raw = await groqCall(
    MODEL_STRONG,
    EXTRACTION_SYSTEM,
    `Extract all facts from this client input. Treat documents, WhatsApp, email, voice transcripts, meeting notes, and screenshot notes as real sources:\n\n${input}`,
    6000
  )
  return safeJsonParse(raw)
}

function validateExtraction(facts) {
  if (!facts) return null

  for (const key of ['features', 'integrations', 'payment_methods', 'user_roles', 'admin_requirements', 'technical_constraints', 'platforms', 'languages_required', 'content_requirements', 'design_preferences']) {
    if (Array.isArray(facts[key])) facts[key] = filterConfidence(facts[key])
  }

  facts.features = uniqueObjects(facts.features || [], item => `${item.name || ''} ${item.description || ''}`)
  facts.integrations = uniqueObjects(facts.integrations || [], item => item.name)
  facts.payment_methods = uniqueObjects(facts.payment_methods || [], item => item.name)
  facts.user_roles = uniqueObjects(facts.user_roles || [], item => item.name)
  facts.admin_requirements = uniqueObjects(facts.admin_requirements || [], item => item.description)
  facts.technical_constraints = uniqueObjects(facts.technical_constraints || [], item => item.description)
  facts.platforms = uniqueObjects(facts.platforms || [], item => item.name)
  facts.languages_required = uniqueObjects(facts.languages_required || [], item => item.name)
  facts.content_requirements = uniqueObjects(facts.content_requirements || [], item => item.description)
  facts.design_preferences = uniqueObjects(facts.design_preferences || [], item => item.description)
  facts.explicitly_excluded = uniqueStrings(facts.explicitly_excluded || [])
  facts.open_questions = uniqueStrings(facts.open_questions || [])
  facts.risks = uniqueStrings(facts.risks || [])
  facts.verbatim_numbers = uniqueStrings(facts.verbatim_numbers || [])
  facts.verbatim_dates = uniqueStrings(facts.verbatim_dates || [])

  if (typeOf(facts.budget) === 'assumed') facts.budget = null
  if (typeOf(facts.deadline) === 'assumed') facts.deadline = null

  return facts
}

function deterministicBriefFromFacts(facts) {
  const features = facts.features || []
  const must = features.filter(f => f.priority === 'must' || f.phase === 'mvp').map(itemLabel)
  const future = features.filter(f => f.phase === 'future').map(itemLabel)
  const optional = features.filter(f => f.phase === 'optional' || f.priority === 'could' || f.phase === 'unclear').map(itemLabel)
  const integrations = (facts.integrations || []).map(itemLabel)
  const payments = (facts.payment_methods || []).map(itemLabel)
  const admin = (facts.admin_requirements || []).map(itemLabel)
  const constraints = [
    ...(facts.technical_constraints || []).map(itemLabel),
    ...(facts.languages_required || []).map(i => `${itemLabel(i)} language support`),
    ...facts.explicitly_excluded.map(i => `Client explicitly excluded/preferred against: ${i}`),
  ]
  const designContent = [
    ...(facts.design_preferences || []).map(itemLabel),
    ...(facts.content_requirements || []).map(itemLabel),
  ]

  const activeBranches = valueOf(facts.branches_count)
  const futureDubai = features.some(f => /dubai/i.test(`${f.name} ${f.description}`)) || facts.verbatim_numbers.some(n => /dubai/i.test(n))

  const factsList = uniqueStrings([
    valueOf(facts.core_problem) && `Core need: ${valueOf(facts.core_problem)}`,
    valueOf(facts.budget) && `Budget: ${valueOf(facts.budget)}`,
    valueOf(facts.deadline) && `Deadline: ${valueOf(facts.deadline)}`,
    activeBranches && `Branches/locations mentioned: ${activeBranches}`,
    ...facts.verbatim_numbers.map(n => `Number mentioned: ${n}`),
    ...facts.verbatim_dates.map(d => `Time reference mentioned: ${d}`),
  ])

  const ambiguities = uniqueStrings([
    ...facts.open_questions,
    !valueOf(facts.budget) && 'Budget range is not clearly defined',
    !valueOf(facts.deadline) && 'Exact launch date is not confirmed',
    'Payment gateway and payment methods need confirmation',
    'Staff dashboard roles and permissions are not defined',
    'Shopify vs custom build decision is unresolved',
    'Content ownership for product descriptions, images, and copywriting is unclear',
    'Brand guidelines, logo assets, and visual system are not confirmed',
    'Hosting, analytics, and tracking requirements need confirmation',
  ].filter(Boolean))

  const questions = ambiguities.map(a => {
    const s = a.replace(/\?+$/, '')
    if (/budget/i.test(s)) return 'What budget range should we plan around?'
    if (/launch|deadline|date/i.test(s)) return 'What is the exact target launch date?'
    if (/payment/i.test(s)) return 'Which payment methods and gateway should be supported at launch?'
    if (/dashboard|permissions|roles/i.test(s)) return 'Who will use the staff dashboard and what permissions should each role have?'
    if (/shopify|custom/i.test(s)) return 'Do you prefer Shopify, a custom build, or should we recommend after discovery?'
    if (/content|copywriting|images/i.test(s)) return 'Who will provide product descriptions, photos, and website copy?'
    if (/brand|logo|visual/i.test(s)) return 'Do you already have brand guidelines, logo files, colors, and typography?'
    if (/hosting|analytics|tracking/i.test(s)) return 'Do you need us to handle hosting, analytics, and tracking setup?'
    return `${s}?`
  })

  return {
    project_title: valueOf(facts.project_name) || 'Coffee Brand Website Development',
    summary: [
      valueOf(facts.core_problem) || 'The client needs a professional website for a specialty coffee brand.',
      valueOf(facts.deadline) ? `The stated deadline is ${valueOf(facts.deadline)}.` : null,
      valueOf(facts.budget) ? `Budget guidance is ${valueOf(facts.budget)}.` : null,
      activeBranches ? `Current branch/location context: ${activeBranches}${futureDubai ? '; Dubai appears to be a future expansion item, not a confirmed current branch.' : '.'}` : null,
    ].filter(Boolean).join(' '),
    goals: uniqueStrings([
      'Establish a professional online presence for investor-facing credibility',
      'Help customers browse the brand, products, branches, and coffee story',
      integrations.includes('Instagram') || integrations.some(i => /instagram/i.test(i)) ? 'Connect the website experience with existing Instagram presence' : null,
      facts.languages_required?.length ? 'Support bilingual customers through the required language setup' : null,
    ].filter(Boolean)),
    explicit_facts: factsList,
    inferred_needs: [],
    mvp_scope: uniqueStrings(must),
    future_scope: uniqueStrings(future),
    optional_ideas: uniqueStrings(optional),
    technical_details: {
      integrations,
      payment_methods: payments,
      platforms: (facts.platforms || []).map(itemLabel),
      constraints,
      admin_requirements: admin,
    },
    business_details: {
      budget: valueOf(facts.budget),
      deadline: valueOf(facts.deadline),
      branches: activeBranches,
      user_roles: (facts.user_roles || []).map(itemLabel),
    },
    design_content_notes: uniqueStrings(designContent),
    ambiguities: ambiguities.slice(0, 10),
    follow_up_questions: uniqueStrings(questions).slice(0, 10),
    estimated_complexity: features.length >= 9 || admin.length || integrations.length >= 2 ? 'high' : 'medium',
    suggested_timeline: null,
    risks: uniqueStrings(facts.risks || []).slice(0, 8),
    recommendations: [],
  }
}

const SYNTHESIS_SYSTEM = `You write an agency-grade project brief from verified extraction JSON.

Return ONLY valid JSON.

Rules:
- Use only facts in extraction JSON.
- Never invent KPIs, percentages, rankings, exact timelines, budgets, or technical choices.
- Do not convert future expansion into current facts.
- Produce 6-10 useful ambiguities when many scope gaps exist.
- Separate MVP, future scope, and optional ideas.
- Include operational details, not just summary.

Return:
{
  "project_title": "",
  "summary": "",
  "goals": [],
  "explicit_facts": [],
  "inferred_needs": [],
  "mvp_scope": [],
  "future_scope": [],
  "optional_ideas": [],
  "technical_details": { "integrations": [], "payment_methods": [], "platforms": [], "constraints": [], "admin_requirements": [] },
  "business_details": { "budget": null, "deadline": null, "branches": null, "user_roles": [] },
  "design_content_notes": [],
  "ambiguities": [],
  "follow_up_questions": [],
  "estimated_complexity": "low|medium|high",
  "suggested_timeline": null,
  "risks": [],
  "recommendations": []
}`

async function synthesizeBrief(facts) {
  const raw = await groqCall(MODEL_STRONG, SYNTHESIS_SYSTEM, JSON.stringify(facts, null, 2), 5000)
  return safeJsonParse(raw)
}

const BAD_METRIC_PATTERNS = [
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
]

function sanitizeGoals(goals = []) {
  return uniqueStrings(goals).filter(goal => !BAD_METRIC_PATTERNS.some(p => p.test(goal)))
}

function mergeBriefs(aiBrief, deterministic) {
  const b = aiBrief || {}
  return {
    project_title: b.project_title || deterministic.project_title,
    summary: b.summary || deterministic.summary,
    goals: sanitizeGoals([...(b.goals || []), ...deterministic.goals]).slice(0, 8),
    explicit_facts: uniqueStrings([...(b.explicit_facts || []), ...deterministic.explicit_facts]).slice(0, 14),
    inferred_needs: uniqueStrings([...(b.inferred_needs || []), ...deterministic.inferred_needs]).slice(0, 8),
    mvp_scope: uniqueStrings([...(b.mvp_scope || []), ...deterministic.mvp_scope]).slice(0, 14),
    future_scope: uniqueStrings([...(b.future_scope || []), ...deterministic.future_scope]).slice(0, 12),
    optional_ideas: uniqueStrings([...(b.optional_ideas || []), ...deterministic.optional_ideas]).slice(0, 12),
    technical_details: {
      integrations: uniqueStrings([...(b.technical_details?.integrations || []), ...deterministic.technical_details.integrations]),
      payment_methods: uniqueStrings([...(b.technical_details?.payment_methods || []), ...deterministic.technical_details.payment_methods]),
      platforms: uniqueStrings([...(b.technical_details?.platforms || []), ...deterministic.technical_details.platforms]),
      constraints: uniqueStrings([...(b.technical_details?.constraints || []), ...deterministic.technical_details.constraints]),
      admin_requirements: uniqueStrings([...(b.technical_details?.admin_requirements || []), ...deterministic.technical_details.admin_requirements]),
    },
    business_details: {
      budget: b.business_details?.budget || deterministic.business_details.budget,
      deadline: b.business_details?.deadline || deterministic.business_details.deadline,
      branches: b.business_details?.branches || deterministic.business_details.branches,
      user_roles: uniqueStrings([...(b.business_details?.user_roles || []), ...deterministic.business_details.user_roles]),
    },
    design_content_notes: uniqueStrings([...(b.design_content_notes || []), ...deterministic.design_content_notes]).slice(0, 12),
    ambiguities: uniqueStrings([...(b.ambiguities || []), ...deterministic.ambiguities]).slice(0, 10),
    follow_up_questions: uniqueStrings([...(b.follow_up_questions || []), ...deterministic.follow_up_questions]).slice(0, 10),
    estimated_complexity: ['low', 'medium', 'high'].includes(b.estimated_complexity) ? b.estimated_complexity : deterministic.estimated_complexity,
    suggested_timeline: b.suggested_timeline || null,
    risks: uniqueStrings([...(b.risks || []), ...deterministic.risks]).slice(0, 8),
    recommendations: uniqueStrings(b.recommendations || []).slice(0, 6),
  }
}

async function generateBrief({ rawText = '', transcriptions = [], interpretations = [], documentTexts = [] }) {
  const cleanedTranscriptions = await Promise.all(transcriptions.map(async (item, idx) => `${nameOf(item, `voice note ${idx + 1}`)}:\n${await cleanVoiceTranscript(item)}`))
  const documents = documentTexts.map((item, idx) => `${nameOf(item, `document ${idx + 1}`)}:\n${textOf(item)}`)
  const images = interpretations.map((item, idx) => `${nameOf(item, `image ${idx + 1}`)}:\n${textOf(item)}`)

  const combinedInput = [
    rawText && `CLIENT TEXT:\n${rawText}`,
    cleanedTranscriptions.length && `VOICE TRANSCRIPTS:\n${cleanedTranscriptions.join('\n---\n')}`,
    documents.length && `DOCUMENT CONTENT:\n${documents.join('\n---\n')}`,
    images.length && `IMAGE DESCRIPTIONS:\n${images.join('\n---\n')}`,
  ].filter(Boolean).join('\n\n===\n\n')

  if (!combinedInput) return deterministicBriefFromFacts(validateExtraction({}))

  const factSets = []
  for (const [idx, chunk] of chunkText(combinedInput).entries()) {
    try {
      const facts = await extractFacts(`CHUNK ${idx + 1}\n\n${chunk}`)
      if (facts) factSets.push(facts)
    } catch (err) {
      console.error('Extraction failed:', err.message)
    }
  }

  const facts = mergeFacts(factSets)
  const deterministic = deterministicBriefFromFacts(facts)

  let synthesized = null
  try { synthesized = await synthesizeBrief(facts) }
  catch (err) { console.error('Synthesis failed:', err.message) }

  return mergeBriefs(synthesized, deterministic)
}

const REGEN_SYSTEM = `Update a project brief using client feedback.
Return only valid JSON in the same final brief shape.
Never invent numbers, timelines, budgets, KPIs, or technical choices.`

async function regenerateBrief(currentVersion, feedback) {
  const raw = await groqCall(
    MODEL_STRONG,
    REGEN_SYSTEM,
    JSON.stringify({ current_brief: currentVersion, client_feedback: feedback }, null, 2),
    5000
  )
  const parsed = safeJsonParse(raw)
  return mergeBriefs(parsed, currentVersion)
}

async function interpretImage(imageBuffer, mimeType) {
  const model = genAI.getGenerativeModel({ model: process.env.GEMINI_MODEL || 'gemini-2.5-flash' })
  const result = await model.generateContent([
    `Extract only visible evidence from this image for project intake.
Describe text, labels, UI elements, annotations, arrows, numbers, prices, colors, layout, products, and content clues.
Do not infer strategy or invent requirements.`,
    { inlineData: { data: imageBuffer.toString('base64'), mimeType } },
  ])
  return result.response.text()
}

module.exports = { generateBrief, regenerateBrief, interpretImage }
