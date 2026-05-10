const { v4: uuidv4 } = require('uuid')
const { supabase }   = require('../lib/db')
const Groq           = require('groq-sdk')
const pdfParse       = require('pdf-parse')

let toFile = null
try {
  toFile = require('groq-sdk/uploads').toFile
} catch {
  toFile = null
}

const groq   = new Groq({ apiKey: process.env.GROQ_API_KEY })
const BUCKET = process.env.SUPABASE_STORAGE_BUCKET || 'lumen-attachments'

const AUDIO_TYPES    = ['audio/mpeg','audio/mp4','audio/wav','audio/webm','audio/ogg','audio/x-m4a']
const IMAGE_TYPES    = ['image/jpeg','image/png','image/webp']
const DOCUMENT_TYPES = [
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
]

function detectFileType(mimeType) {
  if (AUDIO_TYPES.includes(mimeType))    return 'AUDIO'
  if (IMAGE_TYPES.includes(mimeType))    return 'IMAGE'
  if (DOCUMENT_TYPES.includes(mimeType)) return 'DOCUMENT'
  return 'DOCUMENT'
}

// ── Upload to Supabase Storage ──────────────────────────────────────────────
async function uploadToStorage(buffer, originalName, mimeType, folder = 'uploads') {
  const key = `${folder}/${uuidv4()}-${originalName}`
  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(key, buffer, { contentType: mimeType, upsert: false })

  if (error) throw new Error(`Storage upload failed: ${error.message}`)

  const { data } = supabase.storage.from(BUCKET).getPublicUrl(key)
  return data.publicUrl
}

// ── Transcribe audio with Groq Whisper ─────────────────────────────────────
async function transcribeAudio(buffer, originalName, mimeType) {
  const file = toFile
    ? await toFile(buffer, originalName, { type: mimeType })
    : new File([buffer], originalName, { type: mimeType })

  // FIX: removed `language: 'ar'` — forcing Arabic caused Whisper to mistranslate
  // non-Arabic speech and ignore mixed Arabic/English audio correctly.
  // Whisper auto-detects the language when no `language` param is passed.
  // FIX: use response_format: 'verbose_json' so result always has a .text field
  // (plain 'text' format returns a raw string which some SDK versions wrap in an object).
  const result = await groq.audio.transcriptions.create({
    file,
    model:           'whisper-large-v3',
    response_format: 'verbose_json',
    prompt:          'This may contain Arabic, English, or mixed Arabic-English project requirements. Preserve names, numbers, prices, dates, platforms, and feature wording exactly.',
  })

  // verbose_json always returns an object with .text
  if (result && typeof result === 'object' && result.text) return result.text.trim()
  if (typeof result === 'string') return result.trim()
  return ''
}

// ── Extract text from PDF ──────────────────────────────────────────────────
async function extractDocumentText(buffer, mimeType) {
  if (mimeType === 'application/pdf') {
    try {
      const data = await pdfParse(buffer)
      const text = data.text?.trim()
      if (!text) return '[PDF contained no extractable text — may be a scanned image]'
      return text.length > 16000 ? text.slice(0, 16000) + '\n...[truncated]' : text
    } catch (e) {
      console.error('PDF parse error:', e.message)
      return '[PDF could not be parsed]'
    }
  }
  // .doc / .docx — return a note; full DOCX parsing needs mammoth which is optional
  return '[Word document attached — text extraction not available for .doc/.docx. Please paste the content as text.]'
}

// ── Main: process all uploaded files ───────────────────────────────────────
async function processAttachments(files = {}, interpretImage) {
  const results = []
  const allFiles = [
    ...(files.audio     || []).map(f => ({ ...f, folder: 'audio' })),
    ...(files.images    || []).map(f => ({ ...f, folder: 'images' })),
    ...(files.documents || []).map(f => ({ ...f, folder: 'documents' })),
  ]

  for (const file of allFiles) {
    const fileType = detectFileType(file.mimetype)
    let file_url        = null
    let transcription   = null
    let ai_interpretation = null

    // Upload to storage
    try {
      file_url = await uploadToStorage(file.buffer, file.originalname, file.mimetype, file.folder)
    } catch (err) {
      console.error(`Storage upload failed for ${file.originalname}:`, err.message)
      file_url = null
    }

    // Process content
    if (fileType === 'AUDIO') {
      try {
        transcription = await transcribeAudio(file.buffer, file.originalname, file.mimetype)
      } catch (err) {
        console.error(`Transcription failed for ${file.originalname}:`, err.message)
        transcription = null
      }
    }

    if (fileType === 'IMAGE') {
      try {
        ai_interpretation = await interpretImage(file.buffer, file.mimetype)
      } catch (err) {
        console.error(`Image interpretation failed for ${file.originalname}:`, err.message)
        ai_interpretation = null
      }
    }

    if (fileType === 'DOCUMENT') {
      try {
        ai_interpretation = await extractDocumentText(file.buffer, file.mimetype)
      } catch (err) {
        console.error(`Document extraction failed for ${file.originalname}:`, err.message)
        ai_interpretation = null
      }
    }

    results.push({
      type:              fileType,
      original_filename: file.originalname,
      file_url,
      transcription,
      ai_interpretation,
    })
  }
  return results
}

module.exports = { processAttachments, uploadToStorage }
