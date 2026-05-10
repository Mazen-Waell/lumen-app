import { useState } from 'react'
import { useNavigate, Navigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { LogIn } from 'lucide-react'

export default function Login() {
  const { user, login } = useAuth()
  const navigate        = useNavigate()
  const [email,    setEmail]    = useState('')
  const [password, setPassword] = useState('')
  const [errors,   setErrors]   = useState({})
  const [apiError, setApiError] = useState('')
  const [loading,  setLoading]  = useState(false)

  if (user) return <Navigate to="/" replace />

  function validate() {
    const e = {}
    if (!email.trim())    e.email    = 'Email is required'
    if (!password.trim()) e.password = 'Password is required'
    return e
  }

  async function handleSubmit(ev) {
    ev.preventDefault()
    const e = validate()
    if (Object.keys(e).length) { setErrors(e); return }
    setErrors({}); setApiError(''); setLoading(true)
    try { await login(email, password); navigate('/') }
    catch (err) { setApiError(err.response?.data?.error || 'Invalid credentials') }
    finally { setLoading(false) }
  }

  return (
    <div style={{
      minHeight: '100vh', background: 'var(--bg2)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20
    }}>
      <div style={{ width: '100%', maxWidth: 400 }}>
        {/* Brand */}
        <div style={{ textAlign: 'center', marginBottom: 36 }}>
          <div style={{
            width: 52, height: 52, background: 'var(--text)', color: '#fff',
            borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 26, fontWeight: 900, margin: '0 auto 14px'
          }}>L</div>
          <h1 style={{ fontSize: 24, fontWeight: 800 }}>lumen</h1>
          <p style={{ fontSize: 13, color: 'var(--text3)', marginTop: 4 }}>Turn Chaos into a Brief</p>
        </div>

        <div className="card" style={{ boxShadow: 'var(--shadow-md)' }}>
          <h2 style={{ fontSize: 17, fontWeight: 700, marginBottom: 22 }}>Sign in to your workspace</h2>

          {apiError && (
            <div className="alert alert-error" style={{ marginBottom: 18 }}>
              <span>{apiError}</span>
            </div>
          )}

          <form onSubmit={handleSubmit}>
            <div className="field">
              <label className="field-label">Email address</label>
              <input className={`input ${errors.email ? 'error' : ''}`} type="email"
                value={email} onChange={e => setEmail(e.target.value)}
                placeholder="you@studio.com" autoFocus />
              {errors.email && <p className="field-error">{errors.email}</p>}
            </div>

            <div className="field">
              <label className="field-label">Password</label>
              <input className={`input ${errors.password ? 'error' : ''}`} type="password"
                value={password} onChange={e => setPassword(e.target.value)}
                placeholder="Enter your password" />
              {errors.password && <p className="field-error">{errors.password}</p>}
            </div>

            <button type="submit" className="btn btn-primary btn-full btn-lg" disabled={loading} style={{ marginTop: 8 }}>
              {loading ? <><span className="spinner" /> Signing in...</> : <><LogIn size={16} /> Sign in</>}
            </button>
          </form>
        </div>

        <p style={{ textAlign: 'center', marginTop: 28, fontSize: 12, color: 'var(--text3)' }}>
          Powered by <strong style={{ color: 'var(--text)' }}>SynapX</strong>
        </p>
      </div>
    </div>
  )
}
