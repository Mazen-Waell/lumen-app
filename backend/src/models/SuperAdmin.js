const { supabase } = require('../lib/db')

function throwIfError(e, ctx) { if (e) throw Object.assign(new Error(e.message || ctx), { supabaseError: e }) }
function row(r) { return r ? { ...r, _id: r.id, createdAt: r.created_at } : null }

const SuperAdmin = {
  async create({ name, email, password_hash }) {
    const { data, error } = await supabase.from('super_admins').insert({ name, email, password_hash }).select().single()
    throwIfError(error, 'SuperAdmin.create'); return row(data)
  },
  async findOne(filter) {
    let q = supabase.from('super_admins').select('*')
    if (filter.email) q = q.eq('email', filter.email.toLowerCase())
    if (filter._id)   q = q.eq('id', filter._id)
    const { data, error } = await q.maybeSingle()
    throwIfError(error, 'SuperAdmin.findOne'); return row(data)
  },
  async findById(id) { return SuperAdmin.findOne({ _id: id }) },
  async deleteMany() {
    const { error } = await supabase.from('super_admins').delete().neq('id', '00000000-0000-0000-0000-000000000000')
    throwIfError(error, 'SuperAdmin.deleteMany')
  },
}
module.exports = SuperAdmin
