import { createContext, useContext, useState, useCallback } from 'react'
import { CheckCircle, XCircle, Info, AlertTriangle } from 'lucide-react'
const Ctx = createContext(null)
export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([])
  const toast = useCallback((type, title, body = '') => {
    const id = Date.now() + Math.random()
    setToasts(t => [...t, { id, type, title, body }])
    setTimeout(() => setToasts(t => t.filter(x => x.id !== id)), 4500)
  }, [])
  const icons = { success: CheckCircle, error: XCircle, info: Info, warning: AlertTriangle }
  return (
    <Ctx.Provider value={{ toast }}>
      {children}
      <div className="toast-wrap">
        {toasts.map(t => {
          const Icon = icons[t.type] || Info
          return (
            <div key={t.id} className={`toast toast-${t.type}`}>
              <Icon size={16} style={{ flexShrink: 0, marginTop: 1, color: t.type === 'success' ? 'var(--success)' : t.type === 'error' ? 'var(--danger)' : t.type === 'warning' ? 'var(--warning)' : 'var(--info)' }} />
              <div><div className="toast-title">{t.title}</div>{t.body && <div className="toast-body">{t.body}</div>}</div>
            </div>
          )
        })}
      </div>
    </Ctx.Provider>
  )
}
export const useToast = () => useContext(Ctx)
