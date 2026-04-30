/**
 * Category Controller
 */

const Category = require('../models/Category');
const Product = require('../models/Product');
const { AppError } = require('../middleware/errorMiddleware');
const { deleteImage } = require('../config/cloudinary');

exports.getCategories = async (req, res, next) => {
  try {
    const filter = {};
    if (req.query.active !== 'false') filter.isActive = true;

    const categories = await Category.find(filter)
      .sort('sortOrder name')
      .populate('productCount');

    res.json({ success: true, categories });
  } catch (error) { next(error); }
};

exports.getCategory = async (req, res, next) => {
  try {
    const category = await Category.findOne({
      $or: [{ _id: req.params.id }, { slug: req.params.id }],
    });
    if (!category) return next(new AppError('Category not found', 404));
    res.json({ success: true, category });
  } catch (error) { next(error); }
};

exports.createCategory = async (req, res, next) => {
  try {
    const data = { ...req.body };
    if (req.file) {
      data.image = { url: req.file.path, publicId: req.file.filename };
    }
    const category = await Category.create(data);
    res.status(201).json({ success: true, category });
  } catch (error) { next(error); }
};

exports.updateCategory = async (req, res, next) => {
  try {
    const category = await Category.findById(req.params.id);
    if (!category) return next(new AppError('Category not found', 404));

    const updates = { ...req.body };

    if (req.file) {
      // Delete old image
      if (category.image?.publicId) await deleteImage(category.image.publicId);
      updates.image = { url: req.file.path, publicId: req.file.filename };
    }

    const updated = await Category.findByIdAndUpdate(req.params.id, updates, {
      new: true, runValidators: true,
    });

    res.json({ success: true, category: updated });
  } catch (error) { next(error); }
};

exports.deleteCategory = async (req, res, next) => {
  try {
    const category = await Category.findById(req.params.id);
    if (!category) return next(new AppError('Category not found', 404));

    const productCount = await Product.countDocuments({ category: req.params.id, isActive: true });
    if (productCount > 0) {
      return next(new AppError(`Cannot delete category with ${productCount} active products`, 400));
    }

    if (category.image?.publicId) await deleteImage(category.image.publicId);
    await category.deleteOne();

    res.json({ success: true, message: 'Category deleted' });
  } catch (error) { next(error); }
};
