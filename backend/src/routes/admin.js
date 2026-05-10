const express         = require('express')
const router          = express.Router()
const auth            = require('../middleware/auth')
const { requireRole } = require('../middleware/rbac')
const c               = require('../controllers/admin.controller')

router.use(auth)

// Departments — super_admin only
router.post('/departments',          requireRole('super_admin'),          c.createDepartment)
router.get('/departments',           requireRole('super_admin'),          c.listDepartments)

// Admins — super_admin only
router.post('/admins',               requireRole('super_admin'),          c.createAdmin)
router.get('/admins',                requireRole('super_admin'),          c.listAdmins)

// Users — admin + super_admin
router.post('/users',                requireRole('admin', 'super_admin'), c.createUser)
router.get('/users',                 requireRole('admin', 'super_admin'), c.listUsers)
router.delete('/users/:id',          requireRole('admin', 'super_admin'), c.deleteUser)

// Brief history for a specific user — admin + super_admin
// Must be BEFORE /briefs to avoid route conflicts
router.get('/users/:id/briefs',      requireRole('admin', 'super_admin'), c.getUserBriefs)

// All briefs — admin + super_admin
router.get('/briefs',                requireRole('admin', 'super_admin'), c.listAllBriefs)

module.exports = router
