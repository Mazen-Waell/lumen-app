const { supabase } = require('../lib/db')
const { v4: uuidv4 } = require('uuid')

function throwIfError(error, context = '') {
  if (error) throw Object.assign(new Error(error.message || context), { supabaseError: error })
}

const Brief = {

  async create({ user_id, client_name, raw_text_input, attachments = [], versions = [] }) {
    const share_token = uuidv4()
    const { data: brief, error } = await supabase
      .from('briefs')
      .insert({
        user_id,
        client_name,
        raw_text_input: raw_text_input || null,
        share_token,
        status:          'DRAFT',
        current_version: 1,
        confirmed_at:    null,
        attachments:     JSON.stringify(attachments),
        versions:        JSON.stringify(versions),
      })
      .select()
      .single()
    throwIfError(error, 'Brief.create')
    return withSave(deserialize(brief))
  },

  async find({ user_id } = {}) {
    let q = supabase.from('briefs').select('*').order('created_at', { ascending: false })
    if (user_id) q = q.eq('user_id', user_id)
    const { data, error } = await q
    throwIfError(error, 'Brief.find')
    return (data || []).map(b => withSave(deserialize(b)))
  },

  async findOne(filter = {}) {
    let q = supabase.from('briefs').select('*')
    if (filter._id)         q = q.eq('id', filter._id)
    if (filter.share_token) q = q.eq('share_token', filter.share_token)
    if (filter.user_id)     q = q.eq('user_id', filter.user_id)
    const { data, error } = await q.maybeSingle()
    throwIfError(error, 'Brief.findOne')
    if (!data) return null
    return withSave(deserialize(data))
  },

  async findOneAndDelete(filter = {}) {
    const found = await Brief.findOne(filter)
    if (!found) return null
    const { error } = await supabase.from('briefs').delete().eq('id', found._id)
    throwIfError(error, 'Brief.findOneAndDelete')
    return found
  },

  async findAll({ user_ids } = {}) {
    let q = supabase.from('briefs').select('*').order('created_at', { ascending: false })
    if (user_ids && user_ids.length) q = q.in('user_id', user_ids)
    const { data, error } = await q
    throwIfError(error, 'Brief.findAll')
    return (data || []).map(b => ({ ...withSave(deserialize(b)), user_id: String(b.user_id) }))
  },

  async countDocuments(filter = {}) {
    let q = supabase.from('briefs').select('*', { count: 'exact', head: true })
    if (filter.user_id) q = q.eq('user_id', filter.user_id)
    const { count, error } = await q
    throwIfError(error, 'Brief.countDocuments')
    return count || 0
  },

  async findWithPagination({ user_id }, { skip = 0, limit = 10 } = {}) {
    const { data, error } = await supabase
      .from('briefs').select('*')
      .eq('user_id', user_id)
      .order('created_at', { ascending: false })
      .range(skip, skip + limit - 1)
    throwIfError(error, 'Brief.findWithPagination')
    return (data || []).map(b => ({ ...withSave(deserialize(b)), user_id: String(b.user_id) }))
  },
}

function deserialize(row) {
  const b = {
    ...row,
    _id:         row.id,
    createdAt:   row.created_at,
    updatedAt:   row.updated_at,
    attachments: safeJson(row.attachments, []),
    versions:    safeJson(row.versions,    []),
  }
  b.versions = b.versions.map(v => ({ ...v, toObject() { return { ...this } } }))
  return b
}

function safeJson(val, fallback) {
  if (Array.isArray(val)) return val
  if (typeof val === 'string') { try { return JSON.parse(val) } catch { return fallback } }
  return fallback
}

function withSave(brief) {
  brief.toObject = () => {
    const { save, toObject, ...plain } = brief
    plain.versions    = brief.versions.map(v => { const { toObject: to, ...r } = v; return r })
    plain.attachments = brief.attachments
    return plain
  }
  brief.save = async function () {
    const { error } = await supabase.from('briefs').update({
      status:          brief.status,
      current_version: brief.current_version,
      confirmed_at:    brief.confirmed_at || null,
      versions:        JSON.stringify(brief.versions.map(v => { const { toObject, ...r } = v; return r })),
      attachments:     JSON.stringify(brief.attachments),
      updated_at:      new Date().toISOString(),
    }).eq('id', brief._id)
    throwIfError(error, 'Brief.save')
    return brief
  }
  return brief
}

module.exports = Brief
