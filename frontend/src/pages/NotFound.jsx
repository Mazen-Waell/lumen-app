import { Link } from 'react-router-dom'
export default function NotFound() {
  return (
    <div style={{ minHeight:'100vh', display:'flex', alignItems:'center', justifyContent:'center', flexDirection:'column', gap:14, textAlign:'center' }}>
      <div style={{ fontSize:56, fontWeight:900, color:'var(--border2)' }}>404</div>
      <p style={{ color:'var(--text3)', fontSize:15 }}>This page doesn't exist.</p>
      <Link to="/"><button className="btn btn-primary">Go home</button></Link>
    </div>
  )
}
