/**
 * AI Service — Lumen
 * Groq  → brief generation  (llama-3.1-8b-instant / llama-3.3-70b-versatile)
 * Gemini → image interpretation (gemini-2.5-flash)
 */

const Groq = require('groq-sdk')
const { GoogleGenerativeAI } = require('@google/generative-ai')

const groq  = new Groq({ apiKey: process.env.GROQ_API_KEY })
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY)

const BRIEF_SYSTEM = `You are a senior project manager at a software studio.
Extract a structured project brief from messy client input.
Return ONLY valid JSON — no markdown, no backticks, no explanation outside the JSON.

Return exactly this shape:
{
  "project_title": "short descriptive title",
  "summary": "2-3 sentences describing what the client actually wants",
  "goals": ["specific goal 1", "specific goal 2"],
  "ambiguities": ["missing or unclear item 1", "missing or unclear item 2"],
  "follow_up_questions": ["Question to clarify ambiguity 1?"],
  "estimated_complexity": "medium",
  "suggested_timeline": "2-3 weeks"
}

Rules:
- estimated_complexity must be exactly: low, medium, or high
- summary: plain language, no jargon
- goals: specific and measurable where possible
- ambiguities: only flag genuinely missing info (budget, timeline, scope gaps)
- follow_up_questions: one per ambiguity, phrased as a direct question
- Return ONLY the JSON object, nothing else`

const REGEN_SYSTEM = `You are a senior project manager refining a project brief based on client feedback.
Return ONLY valid JSON with the exact same shape — no markdown, no backticks.
Incorporate ALL client corrections. Remove ambiguities the client has now answered.
Do not remove goals or requirements the client did not object to.`

function cleanJson(raw) {
  return raw.trim()
    .replace(/^```(?:json)?\s*/, '').replace(/\s*```$/, '')
    .replace(/[\x00-\x1F\x7F]/g, '').trim()
}

function parseResult(raw, fallbackTitle = '') {
  try {
    const parsed = JSON.parse(cleanJson(raw))
    return {
      project_title:        parsed.project_title        || fallbackTitle,
      summary:              parsed.summary              || '',
      goals:                Array.isArray(parsed.goals)               ? parsed.goals               : [],
      ambiguities:          Array.isArray(parsed.ambiguities)         ? parsed.ambiguities         : [],
      follow_up_questions:  Array.isArray(parsed.follow_up_questions) ? parsed.follow_up_questions : [],
      estimated_complexity: ['low','medium','high'].includes(parsed.estimated_complexity) ? parsed.estimated_complexity : 'medium',
      suggested_timeline:   parsed.suggested_timeline   || 'TBD',
    }
  } catch (e) {
    console.error('AI JSON parse error:', e.message)
    console.error('Raw response:', raw.slice(0, 500))
    return {
      project_title:        fallbackTitle,
      summary:              'AI could not fully parse the input. Please add more detail and try again.',
      goals:                [],
      ambiguities:          ['Input was too vague or AI response was malformed'],
      follow_up_questions:  ['Could you provide more detail about what you need?'],
      estimated_complexity: 'medium',
      suggested_timeline:   'TBD',
    }
  }
}

/**
 * generateBrief
 * Uses Groq llama-3.1-8b-instant (fast, good for text brief generation)
 */
async function generateBrief({ rawText = '', transcriptions = [], interpretations = [] }) {
  const parts = []
  if (rawText)                parts.push(`CLIENT TEXT:\n${rawText}`)
  if (transcriptions.length)  parts.push(`VOICE NOTE TRANSCRIPTIONS:\n${transcriptions.join('\n---\n')}`)
  if (interpretations.length) parts.push(`IMAGE / DOCUMENT CONTENT:\n${interpretations.join('\n---\n')}`)

  const userMsg = parts.join('\n\n===\n\n') || 'No input provided.'

  const res = await groq.chat.completions.create({
    model:       'llama-3.1-8b-instant',
    temperature: 0.2,
    max_tokens:  2000,
    messages: [
      { role: 'system', content: BRIEF_SYSTEM },
      { role: 'user',   content: `Analyze this client input and generate a structured project brief.\n\n${userMsg}` },
    ],
  })

  return parseResult(res.choices[0].message.content)
}

/**
 * regenerateBrief
 * Uses Groq llama-3.3-70b-versatile (higher quality for V2+)
 */
async function regenerateBrief(currentVersion, feedback) {
  const original = JSON.stringify({
    summary:             currentVersion.summary,
    goals:               currentVersion.goals,
    ambiguities:         currentVersion.ambiguities,
    follow_up_questions: currentVersion.follow_up_questions,
  }, null, 2)

  const feedbackText = [
    feedback.summary && `On the summary: ${feedback.summary}`,
    feedback.goals   && `On the goals: ${feedback.goals}`,
    feedback.missing && `Answers to open questions: ${feedback.missing}`,
    feedback.extra   && `Additional context: ${feedback.extra}`,
  ].filter(Boolean).join('\n\n')

  const res = await groq.chat.completions.create({
    model:       'llama-3.3-70b-versatile',
    temperature: 0.2,
    max_tokens:  2000,
    messages: [
      { role: 'system', content: REGEN_SYSTEM },
      { role: 'user',   content: `ORIGINAL BRIEF:\n${original}\n\nCLIENT FEEDBACK:\n${feedbackText}\n\nGenerate an improved brief that addresses all the client's feedback.` },
    ],
  })

  const parsed = parseResult(res.choices[0].message.content, currentVersion.project_title)
  // preserve project_title if AI didn't change it
  if (!parsed.project_title) parsed.project_title = currentVersion.project_title || ''
  return parsed
}

/**
 * interpretImage
 * Uses Gemini 2.5 Flash vision to extract content from screenshots/images
 */
async function interpretImage(imageBuffer, mimeType) {
  const model = genAI.getGenerativeModel({ model: process.env.GEMINI_MODEL || 'gemini-2.5-flash' })

  const result = await model.generateContent([
    `You are a design analyst at a software studio. A client uploaded this image as part of their project brief.
Describe everything useful you can see: visible text, UI layout and structure, annotations, arrows pointing to things,
highlighted areas, what the client likely wants built or changed. Be specific and actionable.
Write in plain paragraphs — not JSON, not bullet points, just clear descriptive text.`,
    { inlineData: { data: imageBuffer.toString('base64'), mimeType } },
  ])

  return result.response.text()
}

module.exports = { generateBrief, regenerateBrief, interpretImage }
