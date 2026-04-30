const express = require('express');
const router = express.Router();
const paymentCtrl = require('../controllers/paymentController');
const { protect, restrictTo } = require('../middleware/authMiddleware');

router.post('/webhook', paymentCtrl.handleWebhook);
router.use(protect);
router.post('/create-order', paymentCtrl.createPaymentOrder);
router.post('/verify', paymentCtrl.verifyPayment);
router.post('/collect-cod/:orderId', restrictTo('admin'), paymentCtrl.collectCodPayment);
router.post('/refund/:orderId', restrictTo('admin'), paymentCtrl.initiateRefund);

module.exports = router;
