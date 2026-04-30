const express = require('express');
const router = express.Router();
const orderCtrl = require('../controllers/orderController');
const { protect, restrictTo } = require('../middleware/authMiddleware');
const { validate, schemas } = require('../middleware/validateMiddleware');

router.use(protect);
router.post('/', validate(schemas.orderSchema), orderCtrl.createOrder);
router.get('/my-orders', orderCtrl.getMyOrders);
router.get('/:id', orderCtrl.getOrder);
router.post('/:id/cancel', orderCtrl.cancelOrder);
router.post('/:id/rate', orderCtrl.rateOrder);
router.patch('/:id/status', restrictTo('admin'), orderCtrl.updateOrderStatus);

module.exports = router;
