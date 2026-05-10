import { useEffect, useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import Nav from '../components/Nav'
import Sidebar from '../components/Sidebar'
import Footer from '../components/Footer'
import api from '../services/api'
import { FilePlus, FileText, Clock, CheckCircle, RefreshCw, XCircle } from 'lucide-react'

const STATUS_MAP = {
  DRAFT:          { label: 'Draft',          badge: 'badge-draft',    icon: FileText,   color: 'var(--text3)' },
  SENT:           { label: 'Awaiting client', badge: 'badge-sent',    icon: Clock,      color: 'var(--info)' },
  NEEDS_REVISION: { label: 'Resent',          badge: 'badge-revision', icon: RefreshCw, color: 'var(--warning)' },
  CONFIRMED:      { label: 'Confirmed',       badge: 'badge-confirmed',icon: CheckCircle,color: 'var(--success)' },
}

export default function UserHome() {
  const navigate   = useNavigate()
  const [briefs,   setBriefs]   = useState([])
  const [loading,  setLoading]  = useState(true)
  const [active,   setActive]   = useState('all')

  useEffect(() => {
    api.get('/briefs').then(r => setBriefs(r.data)).catch(console.error).finally(() => setLoading(false))
  }, [])

  const categories = [
    { key: 'all',           label: 'All briefs',      icon: FileText,    statuses: null },
    { key: 'DRAFT',         label: 'Drafts',          icon: FileText,    statuses: ['DRAFT'] },
    { key: 'SENT',          label: 'Awaiting client', icon: Clock,       statuses: ['SENT'] },
    { key: 'NEEDS_REVISION',label: 'Resent',          icon: RefreshCw,   statuses: ['NEEDS_REVISION'] },
    { key: 'CONFIRMED',     label: 'Confirmed',       icon: CheckCircle, statuses: ['CONFIRMED'] },
  ]

  const filtered = active === 'all' ? briefs : briefs.filter(b => b.status === active)
  const count    = key => key === 'all' ? briefs.length : briefs.filter(b => b.status === key).length

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
      <Nav />
      <div className="app-layout" style={{ flex: 1 }}>
        <Sidebar />
        <main className="main-content">

          {/* Header */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 28 }}>
            <div>
              <h1 className="page-title">Activity</h1>
              <p className="page-subtitle">All your project briefs in one place</p>
            </div>
            <Link to="/briefs/new">
              <button className="btn btn-primary"><FilePlus size={15} /> New brief</button>
            </Link>
          </div>

          {/* Category tabs */}
          <div style={{ display: 'flex', gap: 8, marginBottom: 24, flexWrap: 'wrap' }}>
            {categories.map(cat => {
              const n = count(cat.key)
              const isActive = active === cat.key
              return (
                <button key={cat.key}
                  onClick={() => setActive(cat.key)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 7, padding: '8px 16px',
                    borderRadius: 8, border: '1.5px solid', cursor: 'pointer', fontFamily: 'inherit',
                    fontSize: 13, fontWeight: isActive ? 600 : 400, transition: 'all 0.15s',
                    background: isActive ? 'var(--text)' : 'var(--bg)',
                    borderColor: isActive ? 'var(--text)' : 'var(--border)',
                    color: isActive ? '#fff' : 'var(--text2)',
                  }}>
                  <cat.icon size={14} />
                  {cat.label}
                  <span style={{
                    background: isActive ? 'rgba(255,255,255,0.2)' : 'var(--bg2)',
                    color: isActive ? '#fff' : 'var(--text3)',
                    borderRadius: 20, padding: '1px 7px', fontSize: 11, fontWeight: 600,
                  }}>{n}</span>
                </button>
              )
            })}
          </div>

          {/* Briefs list */}
          {loading ? (
            <div style={{ textAlign: 'center', padding: 60 }}><span className="spinner spinner-lg" /></div>
          ) : filtered.length === 0 ? (
            <div className="card">
              <div className="empty-state">
                <div className="empty-icon"><FileText size={24} /></div>
                <p className="empty-title">No briefs here</p>
                <p className="empty-sub">
                  {active === 'all' ? 'Create your first brief to get started.' : `No ${categories.find(c=>c.key===active)?.label.toLowerCase()} briefs.`}
                </p>
                {active === 'all' && (
                  <Link to="/briefs/new"><button className="btn btn-primary"><FilePlus size={15} /> New brief</button></Link>
                )}
              </div>
            </div>
          ) : (
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>Client</th>
                    <th>Status</th>
                    <th>Version</th>
                    <th>Last updated</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map(b => {
                    const s = STATUS_MAP[b.status] || STATUS_MAP.DRAFT
                    return (
                      <tr key={b._id} onClick={() => navigate(`/briefs/${b._id}`)}>
                        <td className="primary">{b.client_name}</td>
                        <td>
                          <span className={`badge ${s.badge}`}>
                            <s.icon size={10} />
                            {s.label}
                          </span>
                        </td>
                        <td><span className="mono">V{b.current_version}</span></td>
                        <td className="muted text-sm">{new Date(b.updatedAt || b.createdAt).toLocaleDateString('en-GB', { day:'numeric', month:'short', year:'numeric' })}</td>
                        <td style={{ textAlign: 'right' }}>
                          <span style={{ fontSize: 18, color: 'var(--text3)' }}>›</span>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </main>
      </div>
      <Footer />
    </div>
  )
}
