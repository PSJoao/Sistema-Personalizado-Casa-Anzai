const express = require('express');
const router = express.Router();

const OrderController = require('../controllers/OrderController');
const { protectRoute } = require('../middleware/authMiddleware');
const { ordersUpload } = require('../middleware/uploadMiddleware');

// Listagem / dashboard
router.get('/', protectRoute, OrderController.renderDashboard);

// Upload de planilhas
router.get('/upload', protectRoute, OrderController.renderUploadPage);
router.post(
  '/upload',
  protectRoute,
  ordersUpload.array('orderFiles', 10),
  OrderController.handleUpload
);

// APIs auxiliares
router.get('/api/status-summary', protectRoute, OrderController.getStatusSummary);
router.get('/api/status/:bucket', protectRoute, OrderController.getOrdersByBucket);

module.exports = router;

