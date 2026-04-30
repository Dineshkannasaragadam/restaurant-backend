const express = require('express');
const router = express.Router();
const cartCtrl = require('../controllers/cartController');
const { protect } = require('../middleware/authMiddleware');

router.use(protect);
router.get('/', cartCtrl.getCart);
router.post('/sync', cartCtrl.syncCart);
router.post('/add', cartCtrl.addToCart);
router.put('/item/:itemId', cartCtrl.updateCartItem);
router.delete('/item/:itemId', cartCtrl.removeFromCart);
router.delete('/clear', cartCtrl.clearCart);

module.exports = router;
