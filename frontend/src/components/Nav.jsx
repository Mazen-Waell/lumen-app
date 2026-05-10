import { Link, useNavigate } from 'react-router-dom'
import { Bell, LogOut, Settings } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../context/ToastContext'
import { useState, useEffect } from 'react'
import api from '../services/api'
import { io } from 'socket.io-client'

export default function Nav() {
  const { user, logout } = useAuth()
  const { toast }        = useToast()
  const navigate         = useNavigate()
  const [unread, setUnread] = useState(0)

  useEffect(() => {
    if (!user) return
    api.get('/notifications/unread-count').then(r => setUnread(r.data.count)).catch(() => {})
    const token  = localStorage.getItem('lumen_token')
    const socket = io('http://localhost:3000', { transports: ['websocket'] })
    socket.on('connect',      () => socket.emit('authenticate', token))
    socket.on('notification', n  => {
      setUnread(c => c + 1)
      const type = n.type === 'BRIEF_CONFIRMED' ? 'success' : n.type === 'BRIEF_REJECTED' ? 'error' : 'info'
      toast(type, n.title, n.body)
    })
    return () => socket.disconnect()
  }, [user])

  function handleLogout() { logout(); navigate('/login') }

  const deptLabel = user?.role === 'super_admin' ? 'Super Admin' : user?.role === 'admin' ? 'Admin' : null

  return (
    <nav className="nav">
      <Link to="/" className="nav-brand">
        <div className="nav-logo-mark">L</div>
        <div className="nav-brand-text">
          <span className="nav-brand-name">lumen</span>
          <span className="nav-brand-tagline">Turn Chaos into a Brief</span>
        </div>
      </Link>

      <div className="nav-right">
        {deptLabel && <span className="nav-dept">{deptLabel} · {user?.name}</span>}

        {(user?.role === 'admin' || user?.role === 'super_admin') && (
          <Link to="/settings/api">
            <button className="btn btn-ghost btn-icon" title="API Settings">
              <Settings size={17} />
            </button>
          </Link>
        )}

        <div className="relative">
          <button className="btn btn-ghost btn-icon" title="Notifications"
            onClick={() => { setUnread(0); api.patch('/notifications/read-all').catch(() => {}) }}>
            <Bell size={17} />
          </button>
          {unread > 0 && (
            <span style={{
              position: 'absolute', top: 4, right: 4, width: 8, height: 8,
              background: 'var(--danger)', borderRadius: '50%', border: '2px solid var(--bg)'
            }} />
          )}
        </div>

        {!deptLabel && <span style={{ fontSize: 13, color: 'var(--text2)', fontWeight: 500 }}>{user?.name}</span>}

        <button className="btn btn-ghost btn-icon" title="Sign out" onClick={handleLogout}>
          <LogOut size={17} />
        </button>
      </div>
    </nav>
  )
}
