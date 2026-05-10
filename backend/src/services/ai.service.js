/**
 * AI Service — Lumen (Pipeline v2)
 *
 * Architecture: 3-step pipeline
 *   Step 1 — Entity Extraction   (llama-3.3-70b)  → structured JSON of raw facts
 *   Step 2 — Classification      (llama-3.3-70b)  → MVP vs future, confirmed vs optional
 *   Step 3 — Brief Synthesis     (llama-3.3-70b)  → final professional output
 *
 * Step 0 — Voice Transcript Cleanup  (llama-3.1-8b-instant, fast)
 * Gemini 2.5 Flash → image interpretation (unchanged)
 */

const Groq                   = require('groq-sdk')
const { GoogleGenerativeAI } = require('@google/generative-ai')

const groq  = new Groq({ apiKey: process.env.GROQ_API_KEY })
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY)

const MODEL_FAST   = 'llama-3.1-8b-instant'
const MODEL_STRONG = 'llama-3.3-70b-versatile'

// ─── Utility ─────────────────────────────────────────────────────────────────

function cleanJson(raw) {
  return raw.trim()
    .replace(/^```(?:json)?\s*/m, '')
    .replace(/\s*```$/m, '')
    .replace(/[\x00-\x1F\x7F]/g, c => c === '\n' || c === '\t' ? c : '')
    .trim()
}

function safeJsonParse(raw) {
  try   { return JSON.parse(cleanJson(raw)) }
  catch { return null }
}

async function groqCall(model, systemPrompt, userPrompt, maxTokens = 2000) {
  const res = await groq.chat.completions.create({
    model,
    temperature: 0.1,
    max_tokens:  maxTokens,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user',   content: userPrompt   },
    ],
  })
  return res.choices[0].message.content
}

// ─── Step 0: Voice Cleanup ────────────────────────────────────────────────────

const VOICE_CLEANUP_SYSTEM = `You are a transcription editor. Clean up this voice note transcript.
Rules:
- Remove filler words (um, uh, آه, يعني when filler, like, so)
- Fix run-on sentences with punctuation
- Preserve ALL numbers, dates, names, prices, feature names exactly
- Preserve mixed Arabic/English — do not translate
- Do NOT summarize — keep all information, just make it readable
- Return only the cleaned text, nothing else`

async function cleanVoiceTranscript(transcript) {
  if (!transcript || transcript.length < 50) return transcript
  try {
    return await groqCall(MODEL_FAST, VOICE_CLEANUP_SYSTEM, transcript, 1500)
  } catch {
    return transcript
  }
}

// ─── Step 1: Entity Extraction ────────────────────────────────────────────────

const EXTRACTION_SYSTEM = `You are a business analyst AI. Extract every concrete fact from raw client input.
The client may write in Arabic, English, or both mixed. Handle all languages naturally.

Return ONLY this exact JSON shape:
{
  "project_type": "web app / mobile app / e-commerce / dashboard / other",
  "project_name": "if mentioned, else null",
  "core_problem": "what problem the client wants to solve",
  "target_users": "who will use this system",
  "budgets": {
    "total": "exact amount if mentioned, else null",
    "currency": "EGP / USD / EUR / etc",
    "notes": "any budget comments"
  },
  "timeline": {
    "deadline": "exact date or relative time if mentioned, else null",
    "launch_date": "if different from deadline, else null",
    "phases": [],
    "urgency": "urgent / normal / flexible"
  },
  "features": [
    { "name": "feature name", "description": "what it does", "confirmed": true, "priority": "must-have / nice-to-have / future" }
  ],
  "integrations": [],
  "payment_methods": [],
  "branches_or_locations": "number or description if mentioned, else null",
  "admin_requirements": [],
  "user_roles": [],
  "technical_constraints": [],
  "design_references": [],
  "numbers_mentioned": [],
  "dates_mentioned": [],
  "explicitly_excluded": [],
  "client_language_notes": "Arabic / English / Mixed",
  "confidence": "high / medium / low"
}

CRITICAL:
- NEVER invent information not in the input
- NEVER skip numbers, dates, prices, or counts — put them in numbers_mentioned
- null or [] for missing fields
- Arabic input: extract meaning in English, keep Arabic brand names/proper nouns as-is
- Return ONLY the JSON`

async function extractEntities(combinedInput) {
  const raw = await groqCall(
    MODEL_STRONG,
    EXTRACTION_SYSTEM,
    `Extract all entities from this client input:\n\n${combinedInput}`,
    2500
  )
  return safeJsonParse(raw)
}

// ─── Step 2: Classification + Ambiguity Detection ─────────────────────────────

const CLASSIFICATION_SYSTEM = `You are a senior product manager. Given extracted project entities, classify requirements and detect ambiguities.

Return ONLY this JSON shape:
{
  "mvp_features": [{ "name": "feature", "rationale": "why MVP" }],
  "future_features": [{ "name": "feature", "rationale": "why future" }],
  "confirmed_requirements": [],
  "optional_requirements": [],
  "ambiguities": [
    { "field": "budget / timeline / feature / etc", "issue": "what is unclear", "question": "exact question to ask client" }
  ],
  "risks": [
    { "type": "scope / timeline / technical / budget", "description": "the risk", "severity": "high / medium / low" }
  ],
  "missing_critical": [],
  "estimated_complexity": "low / medium / high",
  "complexity_reason": "brief explanation"
}

MVP rules: core user journey = MVP. Nice-to-have = future. "المرحلة الأولى" / "first phase" = MVP.
Ambiguity rules: missing budget → always flag. Missing deadline → always flag. Vague feature → flag. Unknown integration details → flag.
Return ONLY the JSON`

async function classifyRequirements(entities) {
  const raw = await groqCall(
    MODEL_STRONG,
    CLASSIFICATION_SYSTEM,
    `Classify these extracted project entities:\n\n${JSON.stringify(entities, null, 2)}`,
    2000
  )
  return safeJsonParse(raw)
}

// ─── Step 3: Final Synthesis ──────────────────────────────────────────────────

const SYNTHESIS_SYSTEM = `You are a senior project manager writing a professional project brief for a software studio.
You are given structured extracted + classified data. Synthesize into a professional brief.

Return ONLY this JSON shape:
{
  "project_title": "concise professional title",
  "summary": "3-4 sentences: what the client wants, for whom, key constraints (budget/deadline if known)",
  "goals": ["Specific measurable goal — include numbers where available"],
  "mvp_scope": ["Feature included in first launch"],
  "future_scope": ["Feature for later phases"],
  "technical_details": {
    "integrations": [],
    "payment_methods": [],
    "platforms": [],
    "constraints": []
  },
  "business_details": {
    "budget": "exact or range if known, else null",
    "deadline": "exact or relative if known, else null",
    "branches": "count if known, else null",
    "user_roles": []
  },
  "ambiguities": ["Clear statement of what is missing or unclear"],
  "follow_up_questions": ["Direct question to resolve ambiguity?"],
  "estimated_complexity": "low / medium / high",
  "suggested_timeline": "X weeks / months",
  "risks": ["Key risk to flag to studio"]
}

Rules:
- summary MUST mention budget and deadline if provided
- goals must be specific — never write "improve UX"
- Never drop numbers, dates, branch counts, prices
- Keep Arabic brand names/proper nouns as-is
- If budget/deadline unknown → add to ambiguities
- Return ONLY the JSON`

async function synthesizeBrief(entities, classification) {
  const raw = await groqCall(
    MODEL_STRONG,
    SYNTHESIS_SYSTEM,
    `Generate a professional project brief from this data:\n\n${JSON.stringify({ extracted: entities, classification }, null, 2)}`,
    2500
  )
  return safeJsonParse(raw)
}

// ─── Output Normalizer ────────────────────────────────────────────────────────

function normalizeBriefOutput(synthesized, entities, classification, fallbackTitle = '') {
  if (!synthesized) {
    return {
      project_title:        fallbackTitle,
      summary:              'AI pipeline failed to generate a structured brief. Please add more detail and try again.',
      goals:                [],
      ambiguities:          ['Input was too vague or the pipeline encountered an error'],
      follow_up_questions:  ['Could you describe what you need in more detail?'],
      estimated_complexity: 'medium',
      suggested_timeline:   'TBD',
      mvp_scope:            [],
      future_scope:         [],
      technical_details:    {},
      business_details:     {},
      risks:                [],
    }
  }

  const classAmbiguities = (classification?.ambiguities || []).map(a => a.issue).filter(Boolean)
  const allAmbiguities   = [...new Set([...(synthesized.ambiguities || []), ...classAmbiguities])]
  const classQuestions   = (classification?.ambiguities || []).map(a => a.question).filter(Boolean)
  const allQuestions     = [...new Set([...(synthesized.follow_up_questions || []), ...classQuestions])]

  return {
    project_title:        synthesized.project_title        || fallbackTitle,
    summary:              synthesized.summary              || '',
    goals:                Array.isArray(synthesized.goals)           ? synthesized.goals          : [],
    ambiguities:          allAmbiguities,
    follow_up_questions:  allQuestions,
    estimated_complexity: ['low','medium','high'].includes(synthesized.estimated_complexity)
                            ? synthesized.estimated_complexity : 'medium',
    suggested_timeline:   synthesized.suggested_timeline   || 'TBD',
    mvp_scope:            synthesized.mvp_scope            || [],
    future_scope:         synthesized.future_scope         || [],
    technical_details:    synthesized.technical_details    || {},
    business_details:     synthesized.business_details     || {},
    risks:                synthesized.risks                || [],
  }
}

// ─── Public: generateBrief ────────────────────────────────────────────────────

async function generateBrief({ rawText = '', transcriptions = [], interpretations = [] }) {
  const cleanedTranscriptions = await Promise.all(transcriptions.map(cleanVoiceTranscript))

  const parts = []
  if (rawText)                      parts.push(`CLIENT TEXT:\n${rawText}`)
  if (cleanedTranscriptions.length) parts.push(`VOICE NOTE TRANSCRIPTIONS:\n${cleanedTranscriptions.join('\n---\n')}`)
  if (interpretations.length)       parts.push(`IMAGE / DOCUMENT CONTENT:\n${interpretations.join('\n---\n')}`)

  const combinedInput = parts.join('\n\n===\n\n') || 'No input provided.'

  let entities = null
  try        { entities = await extractEntities(combinedInput) }
  catch (err){ console.error('Extraction failed:', err.message) }

  let classification = null
  if (entities) {
    try        { classification = await classifyRequirements(entities) }
    catch (err){ console.error('Classification failed:', err.message) }
  }

  let synthesized = null
  if (entities) {
    try        { synthesized = await synthesizeBrief(entities, classification) }
    catch (err){ console.error('Synthesis failed:', err.message) }
  }

  return normalizeBriefOutput(synthesized, entities, classification)
}

// ─── Public: regenerateBrief ──────────────────────────────────────────────────

const REGEN_SYSTEM = `You are a senior project manager refining a project brief based on client feedback.
Return ONLY valid JSON with the exact same shape — no markdown, no backticks.
- Incorporate ALL client corrections
- Remove ambiguities the client has now answered
- Add new information the client provided (budget, deadline, features)
- Do NOT remove goals the client did not object to
- If client provided budget/deadline that was missing — add to business_details and mention in summary
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
    `ORIGINAL BRIEF:\n${original}\n\nCLIENT FEEDBACK:\n${feedbackText}\n\nGenerate an improved brief addressing all feedback.`,
    2500
  )

  const parsed = safeJsonParse(raw)
  if (!parsed) return normalizeBriefOutput(null, null, null, currentVersion.project_title)

  return {
    project_title:        parsed.project_title        || currentVersion.project_title || '',
    summary:              parsed.summary              || currentVersion.summary || '',
    goals:                Array.isArray(parsed.goals)               ? parsed.goals               : currentVersion.goals || [],
    ambiguities:          Array.isArray(parsed.ambiguities)         ? parsed.ambiguities         : [],
    follow_up_questions:  Array.isArray(parsed.follow_up_questions) ? parsed.follow_up_questions : [],
    estimated_complexity: ['low','medium','high'].includes(parsed.estimated_complexity)
                            ? parsed.estimated_complexity : currentVersion.estimated_complexity || 'medium',
    suggested_timeline:   parsed.suggested_timeline   || currentVersion.suggested_timeline || 'TBD',
    mvp_scope:            parsed.mvp_scope            || currentVersion.mvp_scope     || [],
    future_scope:         parsed.future_scope         || currentVersion.future_scope  || [],
    technical_details:    parsed.technical_details    || currentVersion.technical_details || {},
    business_details:     parsed.business_details     || currentVersion.business_details || {},
    risks:                parsed.risks                || currentVersion.risks         || [],
  }
}

// ─── Public: interpretImage ───────────────────────────────────────────────────

async function interpretImage(imageBuffer, mimeType) {
  const model = genAI.getGenerativeModel({ model: process.env.GEMINI_MODEL || 'gemini-2.5-flash' })
  const result = await model.generateContent([
    `You are a design analyst at a software studio. A client uploaded this image as part of their project brief.
Describe everything useful: visible text, UI layout, annotations, arrows, highlighted areas, what the client wants built.
Include any numbers, labels, or prices visible. Be specific and actionable. Plain paragraphs only.`,
    { inlineData: { data: imageBuffer.toString('base64'), mimeType } },
  ])
  return result.response.text()
}

module.exports = { generateBrief, regenerateBrief, interpretImage }
