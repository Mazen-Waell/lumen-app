import { NavLink } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { LayoutDashboard, FilePlus, Users, Settings, ChevronRight } from 'lucide-react'

export default function Sidebar() {
  const { user } = useAuth()
  const isAdmin  = user?.role === 'admin' || user?.role === 'super_admin'

  return (
    <aside className="sidebar">
      {user?.role === 'user' && <>
        <div className="sidebar-section-label">Workspace</div>
        <NavLink to="/home"       className={({isActive}) => `sidebar-link ${isActive?'active':''}`}>
          <LayoutDashboard size={15} /> Activity
        </NavLink>
        <NavLink to="/briefs/new" className={({isActive}) => `sidebar-link ${isActive?'active':''}`}>
          <FilePlus size={15} /> New brief
        </NavLink>
      </>}

      {isAdmin && <>
        <div className="sidebar-section-label">Management</div>
        <NavLink to="/admin"     className={({isActive}) => `sidebar-link ${isActive?'active':''}`}>
          <Users size={15} /> Users
        </NavLink>
        <NavLink to="/settings/api" className={({isActive}) => `sidebar-link ${isActive?'active':''}`}>
          <Settings size={15} /> API settings
        </NavLink>
      </>}
    </aside>
  )
}
