import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import Nav from '../components/Nav'
import Sidebar from '../components/Sidebar'
import Footer from '../components/Footer'
import api from '../services/api'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../context/ToastContext'
import { Users, UserPlus, Building2, ChevronRight, Trash2, X } from 'lucide-react'

export default function AdminHome() {
  const { user }  = useAuth()
  const { toast } = useToast()
  const navigate  = useNavigate()
  const [users,   setUsers]   = useState([])
  const [depts,   setDepts]   = useState([])
  const [admins,  setAdmins]  = useState([])
  const [loading, setLoading] = useState(true)
  const [tab,     setTab]     = useState('users')
  const [modal,   setModal]   = useState(null) // 'user'|'admin'|'dept'

  const isSuper = user?.role === 'super_admin'

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    try {
      const reqs = [api.get('/admin/users')]
      if (isSuper) { reqs.push(api.get('/admin/departments')); reqs.push(api.get('/admin/admins')) }
      const [u, d, a] = await Promise.all(reqs)
      setUsers(u.data)
      if (d) setDepts(d.data)
      if (a) setAdmins(a.data)
    } catch (e) { console.error(e) }
    finally { setLoading(false) }
  }

  async function deleteUser(id, name) {
    if (!confirm(`Delete user "${name}"? This cannot be undone.`)) return
    try { await api.delete(`/admin/users/${id}`); toast('success', 'User deleted'); load() }
    catch (e) { toast('error', e.response?.data?.error || 'Failed to delete') }
  }

  const tabs = ['users', ...(isSuper ? ['admins', 'departments'] : [])]

  return (
    <div style={{ display:'flex', flexDirection:'column', minHeight:'100vh' }}>
      <Nav />
      <div className="app-layout" style={{ flex:1 }}>
        <Sidebar />
        <main className="main-content">
          <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:28 }}>
            <div>
              <h1 className="page-title">Team management</h1>
              <p className="page-subtitle">
                {isSuper ? 'Manage departments, admins and users across the system' : 'Manage users in your department'}
              </p>
            </div>
            <button className="btn btn-primary" onClick={() => setModal(tab === 'departments' ? 'dept' : tab === 'admins' ? 'admin' : 'user')}>
              <UserPlus size={15} /> Add {tab === 'departments' ? 'department' : tab === 'admins' ? 'admin' : 'user'}
            </button>
          </div>

          {/* Tabs */}
          <div style={{ display:'flex', gap:4, marginBottom:20 }}>
            {tabs.map(t => (
              <button key={t} onClick={() => setTab(t)}
                className={`btn btn-sm ${tab===t ? 'btn-primary' : 'btn-outline'}`}
                style={{ textTransform:'capitalize' }}>
                {t}
              </button>
            ))}
          </div>

          {loading ? (
            <div style={{ textAlign:'center', padding:60 }}><span className="spinner spinner-lg"/></div>
          ) : (
            <>
              {tab === 'users' && (
                <div className="table-wrap">
                  <table className="table">
                    <thead><tr><th>Name</th><th>Email</th><th>Joined</th><th>Briefs</th><th></th></tr></thead>
                    <tbody>
                      {users.length === 0 ? (
                        <tr><td colSpan={5}><div className="empty-state"><p className="empty-title">No users yet</p><p className="empty-sub">Add your first user to get started.</p></div></td></tr>
                      ) : users.map(u => (
                        <tr key={u._id}>
                          <td className="primary" style={{ cursor:'pointer' }} onClick={() => navigate(`/admin/users/${u._id}/briefs`)}>{u.name}</td>
                          <td style={{ cursor:'pointer' }} onClick={() => navigate(`/admin/users/${u._id}/briefs`)}>{u.email}</td>
                          <td style={{ cursor:'pointer' }} onClick={() => navigate(`/admin/users/${u._id}/briefs`)}>{new Date(u.createdAt).toLocaleDateString('en-GB',{day:'numeric',month:'short',year:'numeric'})}</td>
                          <td style={{ cursor:'pointer' }} onClick={() => navigate(`/admin/users/${u._id}/briefs`)}>
                            <span style={{ display:'inline-flex', alignItems:'center', gap:5 }}>
                              <ChevronRight size={13} color="var(--text3)"/>
                              <span style={{ fontSize:12, color:'var(--info)' }}>View history</span>
                            </span>
                          </td>
                          <td style={{ textAlign:'right' }}>
                            <button className="btn btn-ghost btn-sm btn-icon" onClick={() => deleteUser(u._id, u.name)}>
                              <Trash2 size={14} color="var(--danger)"/>
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {tab === 'admins' && (
                <div className="table-wrap">
                  <table className="table">
                    <thead><tr><th>Name</th><th>Email</th><th>Department</th><th>Joined</th></tr></thead>
                    <tbody>
                      {admins.length === 0 ? (
                        <tr><td colSpan={4}><div className="empty-state"><p className="empty-title">No admins yet</p></div></td></tr>
                      ) : admins.map(a => (
                        <tr key={a._id}>
                          <td className="primary">{a.name}</td>
                          <td>{a.email}</td>
                          <td>{depts.find(d=>d._id===a.dept_id)?.name||'—'}</td>
                          <td>{new Date(a.createdAt).toLocaleDateString('en-GB',{day:'numeric',month:'short',year:'numeric'})}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {tab === 'departments' && (
                <div className="table-wrap">
                  <table className="table">
                    <thead><tr><th>Name</th><th>Description</th><th>Created</th></tr></thead>
                    <tbody>
                      {depts.length === 0 ? (
                        <tr><td colSpan={3}><div className="empty-state"><p className="empty-title">No departments yet</p></div></td></tr>
                      ) : depts.map(d => (
                        <tr key={d._id}>
                          <td className="primary">{d.name}</td>
                          <td>{d.description||'—'}</td>
                          <td>{new Date(d.createdAt).toLocaleDateString('en-GB',{day:'numeric',month:'short',year:'numeric'})}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}
        </main>
      </div>
      <Footer />
      {modal && <CreateModal type={modal} depts={depts} userRole={user?.role} userDeptId={user?.dept_id} onClose={() => setModal(null)} onCreated={() => { setModal(null); load() }} toast={toast} />}
    </div>
  )
}

function CreateModal({ type, depts, userRole, userDeptId, onClose, onCreated, toast }) {
  const [form,  setForm]  = useState({ name:'', email:'', password:'', dept_id:'', description:'' })
  const [errors,setErrors]= useState({})
  const [saving,setSaving]= useState(false)

  const titles = { user:'Add user', admin:'Add admin', dept:'Add department' }

  function validate() {
    const e = {}
    if (type !== 'dept') {
      if (!form.name.trim())  e.name  = 'Name is required'
      if (!form.email.trim()) e.email = 'Email is required'
      if (!form.password.trim()) e.password = 'Password is required'
      if (userRole === 'super_admin' && !form.dept_id) e.dept_id = 'Department is required'
    } else {
      if (!form.name.trim()) e.name = 'Department name is required'
    }
    return e
  }

  async function handleSubmit(e) {
    e.preventDefault()
    const errs = validate()
    if (Object.keys(errs).length) { setErrors(errs); return }
    setSaving(true)
    try {
      if (type === 'user')  await api.post('/admin/users',       { ...form, dept_id: userRole==='admin' ? userDeptId : form.dept_id })
      if (type === 'admin') await api.post('/admin/admins',      form)
      if (type === 'dept')  await api.post('/admin/departments', { name: form.name, description: form.description })
      toast('success', `${titles[type]} created`)
      onCreated()
    } catch (err) {
      const msg = err.response?.data?.error || 'Something went wrong'
      if (msg.includes('already')) setErrors({ email: 'This email is already in use' })
      else toast('error', msg)
    } finally { setSaving(false) }
  }

  const set = k => e => setForm(f => ({ ...f, [k]: e.target.value }))

  return (
    <div className="modal-overlay" onClick={e => e.target===e.currentTarget && onClose()}>
      <div className="modal">
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:20 }}>
          <h3 className="modal-title" style={{ margin:0 }}>{titles[type]}</h3>
          <button className="btn btn-ghost btn-icon btn-sm" onClick={onClose}><X size={16}/></button>
        </div>
        <form onSubmit={handleSubmit}>
          {type !== 'dept' ? (
            <>
              <div className="field">
                <label className="field-label">Full name</label>
                <input className={`input ${errors.name?'error':''}`} value={form.name} onChange={set('name')} placeholder="Sara Ahmed"/>
                {errors.name && <p className="field-error">{errors.name}</p>}
              </div>
              <div className="field">
                <label className="field-label">Email address</label>
                <input className={`input ${errors.email?'error':''}`} type="email" value={form.email} onChange={set('email')} placeholder="sara@studio.com"/>
                {errors.email && <p className="field-error">{errors.email}</p>}
              </div>
              <div className="field">
                <label className="field-label">Password</label>
                <input className={`input ${errors.password?'error':''}`} type="password" value={form.password} onChange={set('password')} placeholder="Min. 8 characters"/>
                {errors.password && <p className="field-error">{errors.password}</p>}
              </div>
              {userRole === 'super_admin' && (
                <div className="field">
                  <label className="field-label">Department</label>
                  <select className={`input ${errors.dept_id?'error':''}`} value={form.dept_id} onChange={set('dept_id')}>
                    <option value="">Select department</option>
                    {depts.map(d => <option key={d._id} value={d._id}>{d.name}</option>)}
                  </select>
                  {errors.dept_id && <p className="field-error">{errors.dept_id}</p>}
                </div>
              )}
            </>
          ) : (
            <>
              <div className="field">
                <label className="field-label">Department name</label>
                <input className={`input ${errors.name?'error':''}`} value={form.name} onChange={set('name')} placeholder="e.g. Design Department"/>
                {errors.name && <p className="field-error">{errors.name}</p>}
              </div>
              <div className="field">
                <label className="field-label">Description <span style={{ color:'var(--text3)', fontWeight:400 }}>(optional)</span></label>
                <input className="input" value={form.description} onChange={set('description')} placeholder="Optional description"/>
              </div>
            </>
          )}
          <div style={{ display:'flex', gap:10, justifyContent:'flex-end', marginTop:4 }}>
            <button type="button" className="btn btn-outline" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn btn-primary" disabled={saving}>
              {saving ? <><span className="spinner"/> Creating...</> : `Create ${type}`}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
