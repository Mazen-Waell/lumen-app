const { supabase } = require('../lib/db')

function throwIfError(e, ctx) { if (e) throw Object.assign(new Error(e.message || ctx), { supabaseError: e }) }
function row(r) { return r ? { ...r, _id: r.id, createdAt: r.created_at } : null }

const Department = {
  async create({ name, description, created_by }) {
    const { data, error } = await supabase.from('departments').insert({ name, description, created_by }).select().single()
    throwIfError(error, 'Department.create'); return row(data)
  },
  async find() {
    const { data, error } = await supabase.from('departments').select('*').order('created_at', { ascending: false })
    throwIfError(error, 'Department.find'); return (data || []).map(row)
  },
  async findById(id) {
    const { data, error } = await supabase.from('departments').select('*').eq('id', id).maybeSingle()
    throwIfError(error, 'Department.findById'); return row(data)
  },
  async deleteMany() {
    const { error } = await supabase.from('departments').delete().neq('id', '00000000-0000-0000-0000-000000000000')
    throwIfError(error, 'Department.deleteMany')
  },
}
module.exports = Department
