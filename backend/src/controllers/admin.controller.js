const bcrypt     = require('bcryptjs')
const SuperAdmin = require('../models/SuperAdmin')
const Admin      = require('../models/Admin')
const User       = require('../models/User')
const Department = require('../models/Department')
const Brief      = require('../models/Brief')

// ── Departments ───────────────────────────────────────────────────────────────

async function createDepartment(req, res) {
  const { name, description } = req.body
  if (!name) return res.status(400).json({ error: 'name is required' })
  const dept = await Department.create({ name, description, created_by: req.user.id })
  res.status(201).json(dept)
}

async function listDepartments(req, res) {
  const depts = await Department.find()
  res.json(depts)
}

// ── Admins ────────────────────────────────────────────────────────────────────

async function createAdmin(req, res) {
  const { name, email, password, dept_id } = req.body
  if (!name || !email || !password || !dept_id)
    return res.status(400).json({ error: 'name, email, password, dept_id are required' })
  const exists = await Admin.findOne({ email })
  if (exists) return res.status(409).json({ error: 'Email already in use' })
  const admin = await Admin.create({ name, email, password_hash: await bcrypt.hash(password, 10), dept_id, created_by: req.user.id })
  res.status(201).json({ id: admin._id, name: admin.name, email: admin.email, dept_id: admin.dept_id })
}

async function listAdmins(req, res) {
  const filter = req.query.dept_id ? { dept_id: req.query.dept_id } : {}
  const admins = await Admin.find(filter)
  res.json(admins.map(({ password_hash, ...a }) => a))
}

// ── Users ─────────────────────────────────────────────────────────────────────

async function createUser(req, res) {
  const { name, email, password } = req.body
  if (!name || !email || !password)
    return res.status(400).json({ error: 'name, email, password are required' })

  const dept_id = req.user.role === 'admin' ? req.user.dept_id : req.body.dept_id
  if (!dept_id) return res.status(400).json({ error: 'dept_id is required' })

  const [existsUser, existsAdmin, existsSuper] = await Promise.all([
    User.findOne({ email }),
    Admin.findOne({ email }),
    SuperAdmin.findOne({ email }),
  ])
  if (existsUser || existsAdmin || existsSuper)
    return res.status(409).json({ error: 'Email already in use' })

  const user = await User.create({ name, email, password_hash: await bcrypt.hash(password, 10), dept_id, created_by: req.user.id })
  res.status(201).json({ id: user._id, name: user.name, email: user.email, dept_id: user.dept_id })
}

async function listUsers(req, res) {
  const filter = req.user.role === 'admin' ? { dept_id: req.user.dept_id } : {}
  const users  = await User.find(filter)
  res.json(users.map(({ password_hash, ...u }) => u))
}

async function deleteUser(req, res) {
  const filter = req.user.role === 'admin'
    ? { _id: req.params.id, dept_id: req.user.dept_id }
    : { _id: req.params.id }
  const user = await User.findOneAndDelete(filter)
  if (!user) return res.status(404).json({ error: 'User not found' })
  res.status(204).send()
}

// ── Briefs ────────────────────────────────────────────────────────────────────

async function listAllBriefs(req, res) {
  let briefs
  if (req.user.role === 'admin') {
    const users  = await User.find({ dept_id: req.user.dept_id })
    const ids    = users.map(u => u._id)
    briefs       = await Brief.findAll({ user_ids: ids })
  } else {
    briefs = await Brief.findAll()
  }
  res.json(briefs)
}

async function getUserBriefs(req, res) {
  const targetId = req.params.id

  if (req.user.role === 'admin') {
    const targetUser = await User.findOne({ _id: targetId, dept_id: req.user.dept_id })
    if (!targetUser) return res.status(404).json({ error: 'User not found in your department' })
  }

  const limit = parseInt(req.query.limit) || 10
  const skip  = parseInt(req.query.skip)  || 0

  const [briefs, total] = await Promise.all([
    Brief.findWithPagination({ user_id: targetId }, { skip, limit }),
    Brief.countDocuments({ user_id: targetId }),
  ])

  res.json({ briefs, total, hasMore: skip + limit < total })
}

module.exports = {
  createDepartment, listDepartments,
  createAdmin, listAdmins,
  createUser, listUsers, deleteUser,
  listAllBriefs, getUserBriefs,
}
