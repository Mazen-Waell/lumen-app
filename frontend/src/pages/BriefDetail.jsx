import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import Nav from '../components/Nav'
import Sidebar from '../components/Sidebar'
import Footer from '../components/Footer'
import api from '../services/api'
import { useToast } from '../context/ToastContext'
import { ChevronLeft, Copy, Send, RefreshCw, Check, Clock, CheckCircle, FileText, Paperclip } from 'lucide-react'

const STATUS = {
  DRAFT:          { label: 'Draft',          badge: 'badge-draft',    icon: FileText },
  SENT:           { label: 'Awaiting client', badge: 'badge-sent',    icon: Clock },
  NEEDS_REVISION: { label: 'Needs revision',  badge: 'badge-revision', icon: RefreshCw },
  CONFIRMED:      { label: 'Confirmed',       badge: 'badge-confirmed',icon: CheckCircle },
}

export default function BriefDetail() {
  const { id }       = useParams()
  const navigate     = useNavigate()
  const { toast }    = useToast()
  const [brief,      setBrief]    = useState(null)
  const [loading,    setLoading]  = useState(true)
  const [activeV,    setActiveV]  = useState(0)
  const [sending,    setSending]  = useState(false)
  const [regen,      setRegen]    = useState(false)
  const [copied,     setCopied]   = useState(false)

  useEffect(() => {
    api.get(`/briefs/${id}`).then(r => {
      setBrief(r.data); setActiveV(r.data.versions.length - 1)
    }).catch(() => navigate('/')).finally(() => setLoading(false))
  }, [id])

  async function handleSend() {
    setSending(true)
    try {
      await api.post(`/briefs/${id}/resend`)
      const r = await api.get(`/briefs/${id}`)
      setBrief(r.data); toast('success', 'Brief sent to client')
    } catch { toast('error', 'Failed to send') }
    finally { setSending(false) }
  }

  async function handleRegen() {
    setRegen(true)
    try {
      await api.post(`/briefs/${id}/regenerate`)
      const r = await api.get(`/briefs/${id}`)
      setBrief(r.data); setActiveV(r.data.versions.length - 1)
      toast('success', `V${r.data.current_version} generated`, 'Brief updated with AI')
    } catch { toast('error', 'Regeneration failed') }
    finally { setRegen(false) }
  }

  function copyLink() {
    navigator.clipboard.writeText(`${window.location.origin}/p/${brief.share_token}`)
    setCopied(true); setTimeout(() => setCopied(false), 2000)
    toast('info', 'Share link copied')
  }

  if (loading) return (
    <div style={{ display:'flex', flexDirection:'column', minHeight:'100vh' }}>
      <Nav />
      <div className="app-layout" style={{ flex:1 }}>
        <Sidebar />
        <main className="main-content" style={{ display:'flex', alignItems:'center', justifyContent:'center' }}>
          <span className="spinner spinner-lg" />
        </main>
      </div>
    </div>
  )

  if (!brief) return null
  const v  = brief.versions[activeV]
  const st = STATUS[brief.status] || STATUS.DRAFT

  return (
    <div style={{ display:'flex', flexDirection:'column', minHeight:'100vh' }}>
      <Nav />
      <div className="app-layout" style={{ flex:1 }}>
        <Sidebar />
        <main className="main-content">
          <div style={{ maxWidth: 720 }}>
            {/* Header */}
            <div style={{ display:'flex', alignItems:'center', gap:12, marginBottom:24 }}>
              <button className="btn btn-ghost btn-sm" onClick={() => navigate('/home')}>
                <ChevronLeft size={15} /> Back
              </button>
              <div style={{ flex:1 }}>
                <div style={{ display:'flex', alignItems:'center', gap:10 }}>
                  <h1 className="page-title">{brief.client_name}</h1>
                  <span className={`badge ${st.badge}`}><st.icon size={10}/> {st.label}</span>
                </div>
                <p className="page-subtitle">Created {new Date(brief.createdAt).toLocaleDateString('en-GB',{day:'numeric',month:'long',year:'numeric'})}</p>
              </div>
            </div>

            {/* Version tabs */}
            {brief.versions.length > 1 && (
              <div style={{ display:'flex', gap:6, marginBottom:20 }}>
                {brief.versions.map((v2, i) => (
                  <button key={i} onClick={() => setActiveV(i)}
                    className={`btn btn-sm ${i === activeV ? 'btn-primary' : 'btn-outline'}`}>
                    V{v2.version_number}
                  </button>
                ))}
              </div>
            )}

            {/* Brief content */}
            <div className="card" style={{ marginBottom:16 }}>
              {v?.project_title && (
                <div style={{ marginBottom:20 }}>
                  <h2 style={{ fontSize:18, fontWeight:700 }}>{v.project_title}</h2>
                  {v.estimated_complexity && (
                    <div style={{ display:'flex', gap:8, marginTop:8 }}>
                      {[['Complexity', v.estimated_complexity], ['Timeline', v.suggested_timeline]].map(([k,val]) => val && (
                        <span key={k} style={{ fontSize:12, padding:'3px 10px', background:'var(--bg2)', border:'1px solid var(--border)', borderRadius:20, color:'var(--text2)' }}>
                          {k}: <strong style={{ color:'var(--text)' }}>{val}</strong>
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              )}

              <div className="brief-section">
                <p className="brief-section-title">Summary</p>
                <p style={{ fontSize:14, lineHeight:1.75, color:'var(--text)' }}>{v?.summary}</p>
              </div>

              {(v?.goals||[]).length > 0 && (
                <div className="brief-section">
                  <p className="brief-section-title">Goals</p>
                  {v.goals.map((g,i) => (
                    <div key={i} className="brief-item">
                      <div className="brief-item-dot" />
                      <span>{g}</span>
                    </div>
                  ))}
                </div>
              )}

              {(v?.ambiguities||[]).length > 0 && (
                <div className="brief-section">
                  <p className="brief-section-title">Ambiguities & missing info</p>
                  {v.ambiguities.map((a,i) => (
                    <div key={i} className="brief-item">
                      <span style={{ color:'var(--warning)', fontSize:13, flexShrink:0 }}>?</span>
                      <span>{a}</span>
                    </div>
                  ))}
                </div>
              )}

              {(v?.follow_up_questions||[]).length > 0 && (
                <div className="brief-section">
                  <p className="brief-section-title">Follow-up questions</p>
                  <ol style={{ paddingLeft:18 }}>
                    {v.follow_up_questions.map((q,i) => (
                      <li key={i} style={{ fontSize:13, marginBottom:7, lineHeight:1.6 }}>{q}</li>
                    ))}
                  </ol>
                </div>
              )}

              {v?.client_feedback && Object.values(v.client_feedback).some(Boolean) && (
                <div style={{ background:'var(--warning-bg)', border:'1px solid #fde68a', borderRadius:8, padding:16, marginTop:4 }}>
                  <p style={{ fontSize:12, fontWeight:700, color:'var(--warning)', marginBottom:10, textTransform:'uppercase', letterSpacing:'0.05em' }}>Client feedback</p>
                  {Object.entries(v.client_feedback).filter(([,val]) => val).map(([k,val]) => (
                    <div key={k} style={{ marginBottom:10 }}>
                      <p style={{ fontSize:11, color:'var(--warning)', textTransform:'uppercase', letterSpacing:'0.04em', marginBottom:3 }}>{k}</p>
                      <p style={{ fontSize:13 }}>{val}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Actions */}
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10, marginBottom:12 }}>
              <button className="btn btn-outline" onClick={copyLink}>
                {copied ? <><Check size={15}/> Copied!</> : <><Copy size={15}/> Copy share link</>}
              </button>
              {brief.status !== 'CONFIRMED' && (
                <button className="btn btn-primary" onClick={handleSend} disabled={sending}>
                  {sending ? <><span className="spinner"/> Sending...</> : <><Send size={15}/> Send to client</>}
                </button>
              )}
            </div>

            {brief.status === 'NEEDS_REVISION' && (
              <button className="btn btn-outline btn-full" style={{ marginBottom:12 }} onClick={handleRegen} disabled={regen}>
                {regen ? <><span className="spinner"/> Regenerating...</> : <><RefreshCw size={15}/> Regenerate V{(brief.current_version||1)+1} with AI</>}
              </button>
            )}

            {brief.status === 'CONFIRMED' && (
              <div className="alert alert-success">
                <CheckCircle size={15}/> Brief confirmed by client — locked and ready for project kickoff
              </div>
            )}

            {/* Attachments */}
            {(brief.attachments||[]).length > 0 && (
              <div className="card" style={{ marginTop:14 }}>
                <div style={{ display:'flex', alignItems:'center', gap:7, marginBottom:12 }}>
                  <Paperclip size={14} color="var(--text3)"/>
                  <p style={{ fontSize:12, fontWeight:700, color:'var(--text3)', textTransform:'uppercase', letterSpacing:'0.05em' }}>Original attachments</p>
                </div>
                <div style={{ display:'flex', flexWrap:'wrap', gap:8 }}>
                  {brief.attachments.map((a,i) => (
                    <span key={i} className="badge badge-draft">
                      {a.type==='AUDIO'?'🎙️':a.type==='IMAGE'?'📸':'📄'} {a.original_filename}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        </main>
      </div>
      <Footer />
    </div>
  )
}
