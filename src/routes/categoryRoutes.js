const express = require('express');
const router = express.Router();
const categoryCtrl = require('../controllers/categoryController');
const { protect, restrictTo } = require('../middleware/authMiddleware');
const { categoryUpload } = require('../config/cloudinary');

router.get('/', categoryCtrl.getCategories);
router.get('/:id', categoryCtrl.getCategory);
router.post('/', protect, restrictTo('admin'), categoryUpload.single('image'), categoryCtrl.createCategory);
router.put('/:id', protect, restrictTo('admin'), categoryUpload.single('image'), categoryCtrl.updateCategory);
router.delete('/:id', protect, restrictTo('admin'), categoryCtrl.deleteCategory);

module.exports = router;
