const express = require('express');
const router = express.Router();
const adminCtrl = require('../controllers/adminController');
const { protect, restrictTo } = require('../middleware/authMiddleware');

router.use(protect, restrictTo('admin'));
router.get('/dashboard', adminCtrl.getDashboard);
router.get('/orders', adminCtrl.getAllOrders);
router.get('/users', adminCtrl.getAllUsers);
router.patch('/users/:id/toggle-status', adminCtrl.toggleUserStatus);
router.get('/analytics/revenue', adminCtrl.getRevenueAnalytics);

module.exports = router;
