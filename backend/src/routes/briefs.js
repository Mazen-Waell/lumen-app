const express         = require('express')
const router          = express.Router()
const auth            = require('../middleware/auth')
const { requireRole } = require('../middleware/rbac')
const { briefUpload } = require('../middleware/upload')
const c               = require('../controllers/brief.controller')

router.use(auth, requireRole('user'))
router.post('/', briefUpload, c.create)
router.get('/',              c.list)
router.get('/:id',           c.getOne)
router.delete('/:id',        c.remove)
router.post('/:id/regenerate', c.regenerate)
router.post('/:id/resend',   c.resend)
router.get('/:id/versions',  c.versions)

module.exports = router
