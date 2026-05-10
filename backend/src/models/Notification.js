const { supabase } = require('../lib/db')

function throwIfError(e, ctx) { if (e) throw Object.assign(new Error(e.message || ctx), { supabaseError: e }) }
function row(r) { return r ? { ...r, _id: r.id, createdAt: r.created_at } : null }

const Notification = {
  async create({ user_id, type, title, body, brief_id = null }) {
    const { data, error } = await supabase.from('notifications')
      .insert({ user_id, type, title, body, brief_id, is_read: false }).select().single()
    throwIfError(error, 'Notification.create'); return row(data)
  },
  async find({ user_id }) {
    const { data, error } = await supabase.from('notifications')
      .select('*').eq('user_id', user_id).order('created_at', { ascending: false }).limit(50)
    throwIfError(error, 'Notification.find'); return (data || []).map(row)
  },
  async findOneAndUpdate(filter, update) {
    const { data, error } = await supabase.from('notifications')
      .update({ is_read: update.is_read }).eq('id', filter._id).eq('user_id', filter.user_id)
      .select().single()
    throwIfError(error, 'Notification.findOneAndUpdate'); return row(data)
  },
  async updateMany(filter, update) {
    let q = supabase.from('notifications').update({ is_read: update.is_read })
    if (filter.user_id) q = q.eq('user_id', filter.user_id)
    if (filter.is_read === false) q = q.eq('is_read', false)
    const { error } = await q
    throwIfError(error, 'Notification.updateMany')
  },
  async countDocuments(filter) {
    let q = supabase.from('notifications').select('*', { count: 'exact', head: true })
    if (filter.user_id) q = q.eq('user_id', filter.user_id)
    if (filter.is_read === false) q = q.eq('is_read', false)
    const { count, error } = await q
    throwIfError(error, 'Notification.countDocuments'); return count || 0
  },
}
module.exports = Notification
