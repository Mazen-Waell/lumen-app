import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './context/AuthContext'
import { ToastProvider } from './context/ToastContext'
import Login       from './pages/Login'
import UserHome    from './pages/UserHome'
import NewBrief    from './pages/NewBrief'
import BriefDetail from './pages/BriefDetail'
import AdminHome   from './pages/AdminHome'
import UserBriefs  from './pages/UserBriefs'
import ApiSettings from './pages/ApiSettings'
import PublicBrief from './pages/PublicBrief'
import NotFound    from './pages/NotFound'

function Guard({ children, roles }) {
  const { user } = useAuth()
  if (!user) return <Navigate to="/login" replace />
  if (roles && !roles.includes(user.role)) return <Navigate to="/" replace />
  return children
}

function RoleRedirect() {
  const { user } = useAuth()
  if (!user) return <Navigate to="/login" replace />
  if (user.role === 'user') return <Navigate to="/home" replace />
  return <Navigate to="/admin" replace />
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <ToastProvider>
          <Routes>
            <Route path="/login"           element={<Login />} />
            <Route path="/p/:token"        element={<PublicBrief />} />
            <Route path="/"                element={<RoleRedirect />} />
            <Route path="/home"            element={<Guard roles={['user']}><UserHome /></Guard>} />
            <Route path="/briefs/new"      element={<Guard roles={['user']}><NewBrief /></Guard>} />
            <Route path="/briefs/:id"      element={<Guard><BriefDetail /></Guard>} />
            <Route path="/admin"           element={<Guard roles={['admin','super_admin']}><AdminHome /></Guard>} />
            <Route path="/admin/users/:id/briefs" element={<Guard roles={['admin','super_admin']}><UserBriefs /></Guard>} />
            <Route path="/settings/api"    element={<Guard roles={['admin','super_admin']}><ApiSettings /></Guard>} />
            <Route path="*"               element={<NotFound />} />
          </Routes>
        </ToastProvider>
      </AuthProvider>
    </BrowserRouter>
  )
}
