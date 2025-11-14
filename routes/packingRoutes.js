// routes/packingRoutes.js
const express = require('express');
const router = express.Router();

const PackingController = require('../controllers/PackingController');
const { protectRoute } = require('../middleware/authMiddleware');

// Páginas (Views)
router.get('/', protectRoute, PackingController.renderPackingList);
router.get('/estacao/:type', protectRoute, PackingController.renderPackingStation);
router.get('/etiqueta/:numero_venda', protectRoute, PackingController.renderLabel);

// API Endpoints
router.post('/api/acquire', protectRoute, PackingController.api_acquireOrder);
router.post('/api/pack', protectRoute, PackingController.api_packUnit);
router.post('/api/release', protectRoute, PackingController.api_releaseSession);

module.exports = router;