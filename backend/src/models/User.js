const { supabase } = require('../lib/db')

function throwIfError(e, ctx) { if (e) throw Object.assign(new Error(e.message || ctx), { supabaseError: e }) }
function row(r) { return r ? { ...r, _id: r.id, createdAt: r.created_at } : null }

const User = {
  async create({ name, email, password_hash, dept_id, created_by }) {
    const { data, error } = await supabase.from('users').insert({ name, email, password_hash, dept_id, created_by }).select().single()
    throwIfError(error, 'User.create'); return row(data)
  },
  async findOne(filter) {
    let q = supabase.from('users').select('*')
    if (filter.email) q = q.eq('email', filter.email.toLowerCase())
    if (filter._id)   q = q.eq('id', filter._id)
    if (filter.dept_id) q = q.eq('dept_id', filter.dept_id)
    const { data, error } = await q.maybeSingle()
    throwIfError(error, 'User.findOne'); return row(data)
  },
  async findById(id) { return User.findOne({ _id: id }) },
  async find(filter = {}) {
    let q = supabase.from('users').select('*').order('created_at', { ascending: false })
    if (filter.dept_id) q = q.eq('dept_id', filter.dept_id)
    const { data, error } = await q
    throwIfError(error, 'User.find'); return (data || []).map(row)
  },
  async findOneAndDelete(filter) {
    const found = await User.findOne(filter)
    if (!found) return null
    const { error } = await supabase.from('users').delete().eq('id', found._id)
    throwIfError(error, 'User.findOneAndDelete'); return found
  },
  select(fields) { return this } // compatibility shim — ignored at query level
}
module.exports = User
