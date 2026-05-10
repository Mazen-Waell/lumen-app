import { useState, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import Nav from '../components/Nav'
import Sidebar from '../components/Sidebar'
import Footer from '../components/Footer'
import api from '../services/api'
import { Mic, Image, FileText, X, Loader, Sparkles, ChevronLeft } from 'lucide-react'

function UploadZone({ icon: Icon, label, sublabel, accept, files, onChange }) {
  const ref = useRef()
  const hasFiles = files.length > 0
  return (
    <div
      className={`upload-zone ${hasFiles ? 'has-files' : ''}`}
      onClick={() => ref.current.click()}
    >
      <input ref={ref} type="file" multiple accept={accept} style={{ display: 'none' }}
        onChange={e => onChange(Array.from(e.target.files))} />
      <div className="upload-zone-icon">
        <Icon size={28} strokeWidth={1.5} color={hasFiles ? 'var(--success)' : 'var(--text2)'} />
      </div>
      <div className="upload-zone-label">{label}</div>
      <div className="upload-zone-sub">{sublabel}</div>
      {hasFiles && (
        <div className="upload-zone-count">
          {files.length} file{files.length > 1 ? 's' : ''} selected
        </div>
      )}
    </div>
  )
}

export default function NewBrief() {
  const navigate   = useNavigate()
  const [client,   setClient]   = useState('')
  const [text,     setText]     = useState('')
  const [audio,    setAudio]    = useState([])
  const [images,   setImages]   = useState([])
  const [docs,     setDocs]     = useState([])
  const [errors,   setErrors]   = useState({})
  const [loading,  setLoading]  = useState(false)
  const [apiError, setApiError] = useState('')
  const [step,     setStep]     = useState('input') // input | generating

  function validate() {
    const e = {}
    if (!client.trim()) e.client = 'Client name is required'
    if (!text.trim() && !audio.length && !images.length && !docs.length)
      e.input = 'Please provide at least some input — text, a recording, image or document'
    return e
  }

  async function handleSubmit(ev) {
    ev.preventDefault()
    const e = validate()
    if (Object.keys(e).length) { setErrors(e); return }
    setErrors({}); setApiError(''); setLoading(true); setStep('generating')
    try {
      const fd = new FormData()
      fd.append('client_name',    client)
      fd.append('raw_text_input', text)
      audio.forEach(f  => fd.append('audio',     f))
      images.forEach(f => fd.append('images',    f))
      docs.forEach(f   => fd.append('documents', f))
      const res = await api.post('/briefs', fd, { headers: { 'Content-Type': 'multipart/form-data' } })
      navigate(`/briefs/${res.data._id}`)
    } catch (err) {
      setApiError(err.response?.data?.error || 'Something went wrong. Please try again.')
      setStep('input'); setLoading(false)
    }
  }

  if (step === 'generating') return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
      <Nav />
      <div className="app-layout" style={{ flex: 1 }}>
        <Sidebar />
        <main className="main-content" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ textAlign: 'center', maxWidth: 400 }}>
            {apiError ? (
              <>
                <div style={{ width: 64, height: 64, background: 'var(--bg2)', border: '1.5px solid var(--border)', borderRadius: 16, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px' }}>
                  <span style={{ fontSize: 28 }}>⚠️</span>
                </div>
                <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 8 }}>Something went wrong</h2>
                <p style={{ color: 'var(--text3)', fontSize: 13, marginBottom: 24 }}>{apiError}</p>
                <button className="btn btn-primary" onClick={() => { setStep('input'); setApiError(''); setLoading(false) }}>
                  Try again
                </button>
              </>
            ) : (
              <>
                <div style={{ width: 64, height: 64, background: 'var(--bg2)', border: '1.5px solid var(--border)', borderRadius: 16, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px' }}>
                  <Sparkles size={28} color="var(--text)" />
                </div>
                <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 8 }}>Generating brief</h2>
                <p style={{ color: 'var(--text3)', fontSize: 13, marginBottom: 24 }}>AI is reading everything you submitted and structuring it into a clean project brief.</p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {['Reading your input...', 'Extracting goals and requirements...', 'Identifying ambiguities...', 'Structuring the brief...'].map((s, i) => (
                    <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 16px', background: 'var(--bg2)', borderRadius: 8, border: '1px solid var(--border)' }}>
                      <span className="spinner" />
                      <span style={{ fontSize: 13, color: 'var(--text2)' }}>{s}</span>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        </main>
      </div>
    </div>
  )

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
      <Nav />
      <div className="app-layout" style={{ flex: 1 }}>
        <Sidebar />
        <main className="main-content">
          <div style={{ maxWidth: 700 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 28 }}>
              <button className="btn btn-ghost btn-sm" onClick={() => navigate('/home')}>
                <ChevronLeft size={15} /> Back
              </button>
              <div>
                <h1 className="page-title">New brief</h1>
                <p className="page-subtitle">Paste everything the client sent — the AI handles the rest</p>
              </div>
            </div>

            {apiError && <div className="alert alert-error" style={{ marginBottom: 20 }}>{apiError}</div>}

            <form onSubmit={handleSubmit}>
              {/* Client name */}
              <div className="card" style={{ marginBottom: 16 }}>
                <div className="field" style={{ marginBottom: 0 }}>
                  <label className="field-label">Client name *</label>
                  <input className={`input ${errors.client ? 'error' : ''}`}
                    value={client} onChange={e => setClient(e.target.value)}
                    placeholder="e.g. Nour Store, Mohamed's Agency..." />
                  {errors.client && <p className="field-error">{errors.client}</p>}
                </div>
              </div>

              {/* Text input */}
              <div className="card" style={{ marginBottom: 16 }}>
                <label className="field-label">Client messages & notes</label>
                <textarea className="input" style={{ minHeight: 180 }}
                  value={text} onChange={e => setText(e.target.value)}
                  placeholder="Paste everything here — WhatsApp messages, email threads, voice note summaries, random notes, anything the client sent. The messier the better." />
                {errors.input && !text.trim() && audio.length === 0 && images.length === 0 && docs.length === 0 && (
                  <p className="field-error">{errors.input}</p>
                )}
              </div>

              {/* File uploads */}
              <div className="card" style={{ marginBottom: 24 }}>
                <label className="field-label" style={{ marginBottom: 14 }}>Attachments</label>
                <div className="grid-3">
                  <UploadZone icon={Mic}      label="Recordings" sublabel="MP3, M4A, WAV, OGG"
                    accept="audio/*,.mp3,.m4a,.wav,.ogg" files={audio} onChange={setAudio} />
                  <UploadZone icon={Image}    label="Images"     sublabel="JPG, PNG, WEBP"
                    accept="image/*" files={images} onChange={setImages} />
                  <UploadZone icon={FileText} label="Docs"       sublabel="PDF, DOC, DOCX"
                    accept=".pdf,.doc,.docx,application/pdf" files={docs} onChange={setDocs} />
                </div>

                {/* File lists */}
                {[...audio, ...images, ...docs].length > 0 && (
                  <div style={{ marginTop: 14, display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {[...audio, ...images, ...docs].map((f, i) => (
                      <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 10px', background: 'var(--bg2)', borderRadius: 6, border: '1px solid var(--border)' }}>
                        <FileText size={13} color="var(--text3)" />
                        <span style={{ fontSize: 12, flex: 1, color: 'var(--text2)' }}>{f.name}</span>
                        <span style={{ fontSize: 11, color: 'var(--text3)' }}>{(f.size/1024).toFixed(0)} KB</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <button type="submit" className="btn btn-primary btn-full btn-xl" disabled={loading}>
                <Sparkles size={17} /> Generate brief with AI
              </button>
            </form>
          </div>
        </main>
      </div>
      <Footer />
    </div>
  )
}
