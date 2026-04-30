/**
 * Product Controller
 * Full CRUD + search, filter, pagination
 */

const Product = require('../models/Product');
const Category = require('../models/Category');
const { AppError } = require('../middleware/errorMiddleware');
const { deleteImage } = require('../config/cloudinary');
const APIFeatures = require('../utils/apiFeatures');

/**
 * GET /api/products - Get all products with filtering, search, pagination
 */
exports.getProducts = async (req, res, next) => {
  try {
    const filter = { isActive: true };

    // Category filter
    if (req.query.category) {
      const cat = await Category.findOne({ slug: req.query.category });
      if (cat) filter.category = cat._id;
    }

    // Type filter (veg/non-veg/etc)
    if (req.query.type) filter.type = req.query.type;

    // Feature flags
    if (req.query.featured === 'true') filter.isFeatured = true;
    if (req.query.popular === 'true') filter.isPopular = true;

    // Price range
    if (req.query.minPrice || req.query.maxPrice) {
      filter.price = {};
      if (req.query.minPrice) filter.price.$gte = Number(req.query.minPrice);
      if (req.query.maxPrice) filter.price.$lte = Number(req.query.maxPrice);
    }

    // Text search
    let query = Product.find(filter).populate('category', 'name slug type icon');

    if (req.query.search) {
      query = Product.find({
        ...filter,
        $text: { $search: req.query.search },
      }, { score: { $meta: 'textScore' } })
        .sort({ score: { $meta: 'textScore' } })
        .populate('category', 'name slug type icon');
    } else {
      // Sort
      const sortBy = req.query.sort || '-createdAt';
      query = query.sort(sortBy);
    }

    // Pagination
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 12;
    const skip = (page - 1) * limit;

    const total = await Product.countDocuments(filter);
    const products = await query.skip(skip).limit(limit);

    res.json({
      success: true,
      total,
      page,
      pages: Math.ceil(total / limit),
      limit,
      products,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/products/:id
 */
exports.getProduct = async (req, res, next) => {
  try {
    const product = await Product.findById(req.params.id)
      .populate('category', 'name slug type icon');

    if (!product || !product.isActive) {
      return next(new AppError('Product not found', 404));
    }

    res.json({ success: true, product });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/products/slug/:slug
 */
exports.getProductBySlug = async (req, res, next) => {
  try {
    const product = await Product.findOne({ slug: req.params.slug, isActive: true })
      .populate('category', 'name slug type icon');

    if (!product) return next(new AppError('Product not found', 404));

    res.json({ success: true, product });
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/products - Admin only
 */
exports.createProduct = async (req, res, next) => {
  try {
    const productData = { ...req.body };

    // Handle uploaded images from Cloudinary
    if (req.files?.length) {
      productData.images = req.files.map((file, idx) => ({
        url: file.path,
        publicId: file.filename,
        isMain: idx === 0,
      }));
    }

    const product = await Product.create(productData);
    await product.populate('category', 'name slug type');

    res.status(201).json({ success: true, product });
  } catch (error) {
    next(error);
  }
};

/**
 * PUT /api/products/:id - Admin only
 */
exports.updateProduct = async (req, res, next) => {
  try {
    const product = await Product.findById(req.params.id);
    if (!product) return next(new AppError('Product not found', 404));

    const updateData = { ...req.body };

    // Handle new image uploads
    if (req.files?.length) {
      const newImages = req.files.map((file, idx) => ({
        url: file.path,
        publicId: file.filename,
        isMain: idx === 0 && !product.images.length,
      }));
      updateData.images = [...product.images, ...newImages];
    }

    const updated = await Product.findByIdAndUpdate(req.params.id, updateData, {
      new: true,
      runValidators: true,
    }).populate('category', 'name slug type');

    res.json({ success: true, product: updated });
  } catch (error) {
    next(error);
  }
};

/**
 * DELETE /api/products/:id/image/:imageId - Remove a specific image
 */
exports.deleteProductImage = async (req, res, next) => {
  try {
    const product = await Product.findById(req.params.id);
    if (!product) return next(new AppError('Product not found', 404));

    const imageIdx = product.images.findIndex((img) => img._id.toString() === req.params.imageId);
    if (imageIdx === -1) return next(new AppError('Image not found', 404));

    const image = product.images[imageIdx];

    // Delete from Cloudinary
    if (image.publicId) await deleteImage(image.publicId);

    product.images.splice(imageIdx, 1);

    // Make first image main if deleted image was main
    if (image.isMain && product.images.length) {
      product.images[0].isMain = true;
    }

    await product.save();
    res.json({ success: true, product });
  } catch (error) {
    next(error);
  }
};

/**
 * DELETE /api/products/:id - Admin only (soft delete)
 */
exports.deleteProduct = async (req, res, next) => {
  try {
    const product = await Product.findById(req.params.id);
    if (!product) return next(new AppError('Product not found', 404));

    // Soft delete
    product.isActive = false;
    await product.save();

    res.json({ success: true, message: 'Product deleted successfully' });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/products/featured - Featured products for homepage
 */
exports.getFeaturedProducts = async (req, res, next) => {
  try {
    const products = await Product.find({ isFeatured: true, isActive: true })
      .populate('category', 'name slug')
      .limit(8)
      .sort('-rating.average');

    res.json({ success: true, products });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/products/popular - Most ordered products
 */
exports.getPopularProducts = async (req, res, next) => {
  try {
    const products = await Product.find({ isActive: true })
      .populate('category', 'name slug')
      .sort('-totalOrders')
      .limit(10);

    res.json({ success: true, products });
  } catch (error) {
    next(error);
  }
};
