import axios from 'axios'

// Local dev: Vite proxy rewrites /api → http://localhost:3000
// Production: set VITE_API_URL=https://your-backend.railway.app in Vercel env vars
const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || '/api'
})

api.interceptors.request.use(cfg => {
  const t = localStorage.getItem('lumen_token')
  if (t) cfg.headers.Authorization = `Bearer ${t}`
  return cfg
})

api.interceptors.response.use(r => r, err => {
  if (err.response?.status === 401) {
    localStorage.removeItem('lumen_token')
    localStorage.removeItem('lumen_user')
    window.location.href = '/login'
  }
  return Promise.reject(err)
})

export default api
