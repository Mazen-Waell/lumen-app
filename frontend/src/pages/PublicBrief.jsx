import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import api from '../services/api'
import { CheckCircle, XCircle, Send, ChevronLeft } from 'lucide-react'

export default function PublicBrief() {
  const { token } = useParams()
  const [brief,      setBrief]      = useState(null)
  const [loading,    setLoading]    = useState(true)
  const [error,      setError]      = useState('')
  const [step,       setStep]       = useState('view')
  const [feedback,   setFeedback]   = useState({ summary:'', goals:'', missing:'', extra:'' })
  const [fbErrors,   setFbErrors]   = useState({})
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    api.get(`/p/${token}`).then(r => {
      setBrief(r.data)
      if (r.data.status === 'CONFIRMED') setStep('already_confirmed')
    }).catch(() => setError('This link is invalid or has expired.')).finally(() => setLoading(false))
  }, [token])

  async function handleConfirm() {
    setSubmitting(true)
    try { await api.post(`/p/${token}/confirm`); setStep('confirmed') }
    catch { setError('Something went wrong. Please try again.') }
    finally { setSubmitting(false) }
  }

  function validateFeedback() {
    const e = {}
    if (!feedback.summary.trim() && !feedback.goals.trim() && !feedback.missing.trim() && !feedback.extra.trim())
      e.general = 'Please fill in at least one section before sending feedback'
    return e
  }

  async function handleReject() {
    const e = validateFeedback()
    if (Object.keys(e).length) { setFbErrors(e); return }
    setFbErrors({}); setSubmitting(true)
    try { await api.post(`/p/${token}/reject`, feedback); setStep('feedback_sent') }
    catch { setError('Something went wrong. Please try again.') }
    finally { setSubmitting(false) }
  }

  if (loading) return (
    <div className="public-bg" style={{ alignItems:'center' }}>
      <span className="spinner spinner-lg"/>
    </div>
  )

  return (
    <div className="public-bg">
      <div className="public-card">
        {/* Header */}
        <div style={{ textAlign:'center', marginBottom:32 }}>
          <div style={{ width:44, height:44, background:'var(--text)', color:'#fff', borderRadius:10, display:'flex', alignItems:'center', justifyContent:'center', fontSize:22, fontWeight:900, margin:'0 auto 12px' }}>L</div>
          <h1 style={{ fontSize:22, fontWeight:800 }}>{brief?.client_name}</h1>
          <p style={{ fontSize:13, color:'var(--text3)', marginTop:4 }}>
            Project brief · V{brief?.version} · {brief && new Date(brief.created_at || brief.createdAt).toLocaleDateString('en-GB',{day:'numeric',month:'long',year:'numeric'})}
          </p>
        </div>

        {error && <div className="alert alert-error" style={{ marginBottom:20 }}>{error}</div>}

        {step === 'already_confirmed' && (
          <div className="card" style={{ textAlign:'center', padding:50 }}>
            <CheckCircle size={44} color="var(--success)" style={{ margin:'0 auto 16px' }}/>
            <h2 style={{ marginBottom:8 }}>Already confirmed</h2>
            <p style={{ color:'var(--text3)' }}>This brief has already been confirmed. The studio is ready to begin.</p>
          </div>
        )}

        {step === 'confirmed' && (
          <div className="card" style={{ textAlign:'center', padding:50 }}>
            <CheckCircle size={44} color="var(--success)" style={{ margin:'0 auto 16px' }}/>
            <h2 style={{ marginBottom:8 }}>Brief confirmed</h2>
            <p style={{ color:'var(--text3)' }}>Thank you — the studio has been notified and will be in touch shortly.</p>
          </div>
        )}

        {step === 'feedback_sent' && (
          <div className="card" style={{ textAlign:'center', padding:50 }}>
            <Send size={44} color="var(--info)" style={{ margin:'0 auto 16px' }}/>
            <h2 style={{ marginBottom:8 }}>Feedback sent</h2>
            <p style={{ color:'var(--text3)' }}>The studio has been notified. They'll review your feedback and send an updated brief shortly.</p>
          </div>
        )}

        {step === 'view' && brief && (
          <>
            <div className="card" style={{ marginBottom:14 }}>
              {/* Project title + meta badges */}
              {brief.project_title && (
                <div style={{ marginBottom:20 }}>
                  <h2 style={{ fontSize:20, fontWeight:800, marginBottom:8 }}>{brief.project_title}</h2>
                  <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
                    {brief.estimated_complexity && (
                      <span style={{ fontSize:12, padding:'3px 10px', background:'var(--bg2)', border:'1px solid var(--border)', borderRadius:20, color:'var(--text2)' }}>
                        Complexity: <strong style={{ color:'var(--text)' }}>{brief.estimated_complexity}</strong>
                      </span>
                    )}
                    {brief.suggested_timeline && brief.suggested_timeline !== 'TBD' && (
                      <span style={{ fontSize:12, padding:'3px 10px', background:'var(--bg2)', border:'1px solid var(--border)', borderRadius:20, color:'var(--text2)' }}>
                        Timeline: <strong style={{ color:'var(--text)' }}>{brief.suggested_timeline}</strong>
                      </span>
                    )}
                  </div>
                </div>
              )}

              <p style={{ fontSize:13, color:'var(--text2)', lineHeight:1.7, marginBottom:20, padding:'12px 14px', background:'var(--bg2)', borderRadius:8, border:'1px solid var(--border)' }}>
                Based on everything you shared, here is our understanding of your project. Please read through carefully and either confirm this is correct, or let us know what needs to change.
              </p>

              <PubSection title="What we understand you want">
                <p style={{ fontSize:14, lineHeight:1.75 }}>{brief.summary}</p>
              </PubSection>

              {(brief.goals||[]).length > 0 && (
                <PubSection title="Goals">
                  {brief.goals.map((g,i) => (
                    <div key={i} style={{ display:'flex', gap:8, marginBottom:7, fontSize:13 }}>
                      <div style={{ width:6,height:6,borderRadius:'50%',background:'var(--text)',flexShrink:0,marginTop:7 }}/>
                      <span>{g}</span>
                    </div>
                  ))}
                </PubSection>
              )}

              {(brief.ambiguities||[]).length > 0 && (
                <PubSection title="Things we still need from you">
                  {brief.ambiguities.map((a,i) => (
                    <div key={i} style={{ display:'flex', gap:8, marginBottom:7, fontSize:13 }}>
                      <span style={{ color:'var(--warning)', fontWeight:700 }}>?</span>
                      <span>{a}</span>
                    </div>
                  ))}
                </PubSection>
              )}

              {(brief.follow_up_questions||[]).length > 0 && (
                <PubSection title="Questions for you">
                  <ol style={{ paddingLeft:18 }}>
                    {brief.follow_up_questions.map((q,i) => (
                      <li key={i} style={{ marginBottom:7, fontSize:13, lineHeight:1.6 }}>{q}</li>
                    ))}
                  </ol>
                </PubSection>
              )}
            </div>

            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
              <button className="btn btn-primary btn-lg" onClick={handleConfirm} disabled={submitting}>
                {submitting ? <><span className="spinner"/> Confirming...</> : <><CheckCircle size={16}/> Yes, this is correct</>}
              </button>
              <button className="btn btn-outline btn-lg" onClick={() => setStep('feedback')}>
                <XCircle size={16}/> Something needs changing
              </button>
            </div>
          </>
        )}

        {step === 'feedback' && (
          <>
            <button className="btn btn-ghost btn-sm" style={{ marginBottom:16 }} onClick={() => setStep('view')}>
              <ChevronLeft size={14}/> Back to brief
            </button>
            <div className="card" style={{ marginBottom:14 }}>
              <h2 style={{ fontSize:18, fontWeight:700, marginBottom:6 }}>What needs to change?</h2>
              <p style={{ fontSize:13, color:'var(--text3)', marginBottom:20 }}>
                Tell us exactly what's wrong or missing in each section. The more specific you are, the better the updated brief.
              </p>

              {fbErrors.general && <div className="alert alert-error" style={{ marginBottom:16 }}>{fbErrors.general}</div>}

              {[
                ['summary', 'On the summary',          `"${(brief?.summary||'').slice(0,80)}..."`],
                ['goals',   'On the goals',            'Which goals are wrong or missing?'],
                ['missing', 'Answers to open questions','Please answer any questions from the brief'],
                ['extra',   'Anything else',           'Any additional context or corrections'],
              ].map(([key, label, hint]) => (
                <div className="field" key={key}>
                  <label className="field-label">{label}</label>
                  {key === 'summary' && brief?.summary && (
                    <div style={{ fontSize:12, color:'var(--text3)', background:'var(--bg2)', border:'1px solid var(--border)', borderRadius:6, padding:'8px 10px', marginBottom:6, lineHeight:1.5 }}>
                      "{brief.summary.slice(0,120)}..."
                    </div>
                  )}
                  <textarea className="input" style={{ minHeight:72 }}
                    placeholder={hint}
                    value={feedback[key]}
                    onChange={e => setFeedback(f => ({...f,[key]:e.target.value}))}/>
                </div>
              ))}
            </div>
            <button className="btn btn-primary btn-full btn-lg" onClick={handleReject} disabled={submitting}>
              {submitting ? <><span className="spinner"/> Sending...</> : <><Send size={16}/> Send feedback to studio</>}
            </button>
          </>
        )}

        <p style={{ textAlign:'center', marginTop:32, fontSize:12, color:'var(--text3)' }}>
          Powered by <strong style={{ color:'var(--text)' }}>SynapX</strong> · lumen
        </p>
      </div>
    </div>
  )
}

function PubSection({ title, children }) {
  return (
    <div style={{ marginBottom:20 }}>
      <p style={{ fontSize:11, fontWeight:700, color:'var(--text3)', textTransform:'uppercase', letterSpacing:'0.07em', marginBottom:10 }}>{title}</p>
      {children}
      <div style={{ height:1, background:'var(--border)', marginTop:16 }}/>
    </div>
  )
}
