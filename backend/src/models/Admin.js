const { supabase } = require('../lib/db')

function throwIfError(e, ctx) { if (e) throw Object.assign(new Error(e.message || ctx), { supabaseError: e }) }
function row(r) { return r ? { ...r, _id: r.id, createdAt: r.created_at } : null }

const Admin = {
  async create({ name, email, password_hash, dept_id, created_by }) {
    const { data, error } = await supabase.from('admins').insert({ name, email, password_hash, dept_id, created_by }).select().single()
    throwIfError(error, 'Admin.create'); return row(data)
  },
  async findOne(filter) {
    let q = supabase.from('admins').select('*')
    if (filter.email)   q = q.eq('email', filter.email.toLowerCase())
    if (filter._id)     q = q.eq('id', filter._id)
    if (filter.dept_id) q = q.eq('dept_id', filter.dept_id)
    const { data, error } = await q.maybeSingle()
    throwIfError(error, 'Admin.findOne'); return row(data)
  },
  async findById(id) { return Admin.findOne({ _id: id }) },
  async find(filter = {}) {
    let q = supabase.from('admins').select('*').order('created_at', { ascending: false })
    if (filter.dept_id) q = q.eq('dept_id', filter.dept_id)
    const { data, error } = await q
    throwIfError(error, 'Admin.find'); return (data || []).map(row)
  },
}
module.exports = Admin
