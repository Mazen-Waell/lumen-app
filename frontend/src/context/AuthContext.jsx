import { createContext, useContext, useState } from 'react'
import api from '../services/api'
const Ctx = createContext(null)
export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => { try { return JSON.parse(localStorage.getItem('lumen_user')) } catch { return null } })
  async function login(email, password) {
    const res = await api.post('/auth/login', { email, password })
    localStorage.setItem('lumen_token', res.data.token)
    localStorage.setItem('lumen_user', JSON.stringify(res.data.user))
    setUser(res.data.user); return res.data.user
  }
  function logout() { localStorage.removeItem('lumen_token'); localStorage.removeItem('lumen_user'); setUser(null) }
  return <Ctx.Provider value={{ user, login, logout }}>{children}</Ctx.Provider>
}
export const useAuth = () => useContext(Ctx)
