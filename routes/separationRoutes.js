const express = require('express');
const router = express.Router();

const SeparationController = require('../controllers/SeparationController');
const { protectRoute } = require('../middleware/authMiddleware');

router.get('/', protectRoute, SeparationController.renderDepartmentList);
router.get('/departamento/:code', protectRoute, SeparationController.renderDepartmentPage);

router.get('/api/session', protectRoute, SeparationController.getCurrentSession);
router.post('/api/acquire', protectRoute, SeparationController.acquireProduct);
router.post('/api/pick', protectRoute, SeparationController.pickUnit);
router.post('/api/release', protectRoute, SeparationController.releaseSession);

module.exports = router;

