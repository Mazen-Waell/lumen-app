import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import Nav from '../components/Nav'
import Sidebar from '../components/Sidebar'
import Footer from '../components/Footer'
import api from '../services/api'
import { ChevronLeft, FileText, Clock, CheckCircle, RefreshCw } from 'lucide-react'

const STATUS = {
  DRAFT:          { label:'Draft',           badge:'badge-draft',     icon:FileText },
  SENT:           { label:'Awaiting client', badge:'badge-sent',     icon:Clock },
  NEEDS_REVISION: { label:'Needs revision',  badge:'badge-revision', icon:RefreshCw },
  CONFIRMED:      { label:'Confirmed',       badge:'badge-confirmed',icon:CheckCircle },
}
const PAGE = 5

export default function UserBriefs() {
  const { id }   = useParams()
  const navigate = useNavigate()
  const [briefs,  setBriefs]  = useState([])
  const [user,    setUser]    = useState(null)
  const [loading, setLoading] = useState(true)
  const [page,    setPage]    = useState(1)

  useEffect(() => {
    Promise.all([
      api.get('/admin/briefs'),
      api.get('/admin/users'),
    ]).then(([b, u]) => {
      const targetUser = u.data.find(x => x._id === id)
      setUser(targetUser)
      const userBriefs = b.data.filter(br => br.user_id === id || String(br.user_id) === id)
      setBriefs(userBriefs)
    }).catch(console.error).finally(() => setLoading(false))
  }, [id])

  const visible = briefs.slice(0, page * PAGE)
  const hasMore = visible.length < briefs.length

  return (
    <div style={{ display:'flex', flexDirection:'column', minHeight:'100vh' }}>
      <Nav />
      <div className="app-layout" style={{ flex:1 }}>
        <Sidebar />
        <main className="main-content">
          <div style={{ display:'flex', alignItems:'center', gap:12, marginBottom:28 }}>
            <button className="btn btn-ghost btn-sm" onClick={() => navigate('/admin')}>
              <ChevronLeft size={15}/> Back to team
            </button>
            <div>
              <h1 className="page-title">{user?.name || 'User'}'s briefs</h1>
              <p className="page-subtitle">{user?.email} · {briefs.length} brief{briefs.length !== 1 ? 's' : ''} total</p>
            </div>
          </div>

          {loading ? (
            <div style={{ textAlign:'center', padding:60 }}><span className="spinner spinner-lg"/></div>
          ) : briefs.length === 0 ? (
            <div className="card">
              <div className="empty-state">
                <div className="empty-icon"><FileText size={24}/></div>
                <p className="empty-title">No briefs yet</p>
                <p className="empty-sub">This user hasn't created any briefs.</p>
              </div>
            </div>
          ) : (
            <>
              <div className="table-wrap">
                <table className="table">
                  <thead>
                    <tr><th>Client</th><th>Status</th><th>Version</th><th>Created</th><th></th></tr>
                  </thead>
                  <tbody>
                    {visible.map(b => {
                      const s = STATUS[b.status] || STATUS.DRAFT
                      return (
                        <tr key={b._id} onClick={() => navigate(`/briefs/${b._id}`)}>
                          <td className="primary">{b.client_name}</td>
                          <td><span className={`badge ${s.badge}`}><s.icon size={10}/> {s.label}</span></td>
                          <td><span className="mono">V{b.current_version}</span></td>
                          <td className="muted text-sm">{new Date(b.createdAt).toLocaleDateString('en-GB',{day:'numeric',month:'short',year:'numeric'})}</td>
                          <td style={{ textAlign:'right', fontSize:18, color:'var(--text3)' }}>›</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>

              {hasMore && (
                <div style={{ textAlign:'center', marginTop:16 }}>
                  <button className="btn btn-outline" onClick={() => setPage(p => p+1)}>
                    Load more ({briefs.length - visible.length} remaining)
                  </button>
                </div>
              )}
            </>
          )}
        </main>
      </div>
      <Footer />
    </div>
  )
}
