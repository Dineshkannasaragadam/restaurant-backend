const express = require('express');
const router = express.Router();
const productCtrl = require('../controllers/productController');
const { protect, restrictTo } = require('../middleware/authMiddleware');
const { productUpload } = require('../config/cloudinary');

router.get('/', productCtrl.getProducts);
router.get('/featured', productCtrl.getFeaturedProducts);
router.get('/popular', productCtrl.getPopularProducts);
router.get('/slug/:slug', productCtrl.getProductBySlug);
router.get('/:id', productCtrl.getProduct);

// Admin only
router.post('/', protect, restrictTo('admin'), productUpload.array('images', 5), productCtrl.createProduct);
router.put('/:id', protect, restrictTo('admin'), productUpload.array('images', 5), productCtrl.updateProduct);
router.delete('/:id/image/:imageId', protect, restrictTo('admin'), productCtrl.deleteProductImage);
router.delete('/:id', protect, restrictTo('admin'), productCtrl.deleteProduct);

module.exports = router;
