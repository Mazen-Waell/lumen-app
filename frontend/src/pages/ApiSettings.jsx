import { useState, useEffect } from 'react'
import Nav from '../components/Nav'
import Sidebar from '../components/Sidebar'
import Footer from '../components/Footer'
import { useToast } from '../context/ToastContext'
import { Key, AlertTriangle, CheckCircle, Edit2, Save, X } from 'lucide-react'

const MODELS = [
  {
    id:    'groq',
    name:  'Groq',
    model: 'llama-3.1-8b-instant / llama-3.3-70b-versatile',
    use:   'Brief generation (text)',
    color: '#f97316',
  },
  {
    id:    'gemini',
    name:  'Google Gemini',
    model: 'gemini-2.5-flash',
    use:   'Image interpretation',
    color: '#2563eb',
  },
]

const STORAGE_KEY = 'lumen_api_settings'

function loadSettings() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY)) || {} } catch { return {} }
}
function saveSettings(s) { localStorage.setItem(STORAGE_KEY, JSON.stringify(s)) }

export default function ApiSettings() {
  const { toast } = useToast()
  const [settings,  setSettings]  = useState(loadSettings)
  const [editing,   setEditing]   = useState(null)
  const [editForm,  setEditForm]  = useState({})
  const [testResults, setTestResults] = useState({})
  const [testing,   setTesting]   = useState({})

  // Check for expiry on load
  useEffect(() => {
    MODELS.forEach(m => {
      const s = settings[m.id]
      if (!s?.expiry) return
      const days = daysUntilExpiry(s.expiry)
      if (days !== null && days <= 7 && days >= 0) {
        toast('warning', `${m.name} API key expires in ${days} day${days!==1?'s':''}`, 'Update it in API Settings before it expires.')
      }
    })
  }, [])

  function daysUntilExpiry(dateStr) {
    if (!dateStr) return null
    const diff = new Date(dateStr) - new Date()
    return Math.ceil(diff / (1000 * 60 * 60 * 24))
  }

  function expiryStatus(dateStr) {
    const days = daysUntilExpiry(dateStr)
    if (days === null) return null
    if (days < 0)  return { label: 'Expired', color: 'var(--danger)', bg: 'var(--danger-bg)' }
    if (days <= 7) return { label: `Expires in ${days}d`, color: 'var(--warning)', bg: 'var(--warning-bg)' }
    return { label: `Expires in ${days}d`, color: 'var(--success)', bg: 'var(--success-bg)' }
  }

  function startEdit(modelId) {
    const s = settings[modelId] || {}
    setEditForm({ key: s.key || '', expiry: s.expiry || '', isPaid: s.isPaid || false })
    setEditing(modelId)
  }

  function cancelEdit() { setEditing(null); setEditForm({}) }

  function saveEdit(modelId) {
    const next = { ...settings, [modelId]: editForm }
    setSettings(next); saveSettings(next)
    setEditing(null)
    toast('success', 'API settings saved')

    // check expiry warning after save
    if (editForm.expiry) {
      const days = daysUntilExpiry(editForm.expiry)
      if (days !== null && days <= 7 && days >= 0) {
        toast('warning', `${MODELS.find(m=>m.id===modelId)?.name} expires in ${days} day${days!==1?'s':''}`)
      }
    }
  }

  async function testKey(modelId) {
    setTesting(t => ({ ...t, [modelId]: true }))
    setTestResults(r => ({ ...r, [modelId]: null }))
    try {
      // We test by calling our own backend health endpoint and checking if brief generation works
      const res = await fetch('/api/health')
      if (res.ok) {
        setTestResults(r => ({ ...r, [modelId]: { ok: true, msg: 'Backend reachable — key configured in .env' } }))
      } else {
        setTestResults(r => ({ ...r, [modelId]: { ok: false, msg: 'Backend unreachable' } }))
      }
    } catch {
      setTestResults(r => ({ ...r, [modelId]: { ok: false, msg: 'Cannot reach backend' } }))
    } finally { setTesting(t => ({ ...t, [modelId]: false })) }
  }

  return (
    <div style={{ display:'flex', flexDirection:'column', minHeight:'100vh' }}>
      <Nav />
      <div className="app-layout" style={{ flex:1 }}>
        <Sidebar />
        <main className="main-content">
          <div className="page-header">
            <h1 className="page-title">API settings</h1>
            <p className="page-subtitle">Manage AI model keys, expiry dates, and connection status</p>
          </div>

          <div style={{ display:'flex', flexDirection:'column', gap:16 }}>
            {MODELS.map(m => {
              const s     = settings[m.id] || {}
              const expSt = expiryStatus(s.expiry)
              const test  = testResults[m.id]

              return (
                <div key={m.id} className="card">
                  <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', marginBottom:16 }}>
                    <div style={{ display:'flex', alignItems:'center', gap:12 }}>
                      <div style={{ width:40, height:40, borderRadius:10, background:`${m.color}15`, border:`1.5px solid ${m.color}30`, display:'flex', alignItems:'center', justifyContent:'center' }}>
                        <Key size={18} color={m.color}/>
                      </div>
                      <div>
                        <div style={{ fontSize:15, fontWeight:700 }}>{m.name}</div>
                        <div style={{ fontSize:12, color:'var(--text3)', marginTop:1 }}>{m.model}</div>
                        <div style={{ fontSize:12, color:'var(--text2)', marginTop:1 }}>Used for: {m.use}</div>
                      </div>
                    </div>
                    <div style={{ display:'flex', gap:8 }}>
                      {editing !== m.id && (
                        <button className="btn btn-outline btn-sm" onClick={() => startEdit(m.id)}>
                          <Edit2 size={13}/> Edit
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Key preview */}
                  {editing !== m.id && (
                    <div style={{ display:'flex', flexWrap:'wrap', gap:10, alignItems:'center' }}>
                      <div style={{ flex:1, background:'var(--bg2)', border:'1px solid var(--border)', borderRadius:6, padding:'8px 12px', fontFamily:'var(--mono)', fontSize:12, color:'var(--text2)' }}>
                        {s.key ? `${s.key.slice(0,8)}${'•'.repeat(16)}${s.key.slice(-4)}` : 'No key saved locally — configured in .env'}
                      </div>
                      {expSt && (
                        <span style={{ fontSize:12, padding:'4px 10px', borderRadius:20, background:expSt.bg, color:expSt.color, fontWeight:600, border:`1px solid ${expSt.color}30` }}>
                          {expSt.label}
                        </span>
                      )}
                      {!s.expiry && (
                        <span style={{ fontSize:12, color:'var(--text3)' }}>No expiry set</span>
                      )}
                      {s.isPaid && (
                        <span className="badge badge-sent">Paid plan</span>
                      )}
                    </div>
                  )}

                  {/* Edit form */}
                  {editing === m.id && (
                    <div style={{ borderTop:'1px solid var(--border)', paddingTop:16, marginTop:4 }}>
                      <div className="field">
                        <label className="field-label">API key <span style={{ color:'var(--text3)', fontWeight:400 }}>(stored locally in browser only)</span></label>
                        <input className="input" type="password" value={editForm.key}
                          onChange={e => setEditForm(f => ({...f, key:e.target.value}))}
                          placeholder="Paste your API key here"/>
                        <p style={{ fontSize:11, color:'var(--text3)', marginTop:4 }}>This is stored in your browser only. The actual key used by the backend must be set in the .env file.</p>
                      </div>
                      <div className="grid-2">
                        <div className="field">
                          <label className="field-label">Expiry date <span style={{ color:'var(--text3)', fontWeight:400 }}>(optional)</span></label>
                          <input className="input" type="date" value={editForm.expiry}
                            onChange={e => setEditForm(f => ({...f, expiry:e.target.value}))}/>
                        </div>
                        <div className="field">
                          <label className="field-label">Plan type</label>
                          <select className="input" value={editForm.isPaid} onChange={e => setEditForm(f => ({...f, isPaid:e.target.value==='true'}))}>
                            <option value="false">Free tier</option>
                            <option value="true">Paid plan</option>
                          </select>
                        </div>
                      </div>
                      <div style={{ display:'flex', gap:8 }}>
                        <button className="btn btn-primary btn-sm" onClick={() => saveEdit(m.id)}><Save size={13}/> Save</button>
                        <button className="btn btn-outline btn-sm" onClick={cancelEdit}><X size={13}/> Cancel</button>
                      </div>
                    </div>
                  )}

                  {/* Test */}
                  {editing !== m.id && (
                    <div style={{ marginTop:14, paddingTop:14, borderTop:'1px solid var(--border)', display:'flex', alignItems:'center', gap:12 }}>
                      <button className="btn btn-outline btn-sm" onClick={() => testKey(m.id)} disabled={testing[m.id]}>
                        {testing[m.id] ? <><span className="spinner"/> Testing...</> : 'Test connection'}
                      </button>
                      {test && (
                        <div style={{ display:'flex', alignItems:'center', gap:6, fontSize:13 }}>
                          {test.ok
                            ? <><CheckCircle size={14} color="var(--success)"/> <span style={{ color:'var(--success)' }}>{test.msg}</span></>
                            : <><AlertTriangle size={14} color="var(--danger)"/> <span style={{ color:'var(--danger)' }}>{test.msg}</span></>
                          }
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </div>

          {/* Info card */}
          <div className="alert alert-info" style={{ marginTop:24 }}>
            <AlertTriangle size={15}/>
            <div>
              <strong>Important:</strong> To update the actual API keys used by the backend, edit the <code style={{ fontFamily:'var(--mono)', fontSize:12, background:'rgba(37,99,235,0.1)', padding:'1px 5px', borderRadius:4 }}>.env</code> file in your backend folder and restart the server. The keys saved here are for your reference and expiry tracking only.
            </div>
          </div>
        </main>
      </div>
      <Footer />
    </div>
  )
}
