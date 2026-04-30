/**
 * Product (Menu Item) Model
 * Complete food item with variants, nutritional info, etc.
 */

const mongoose = require('mongoose');

const variantSchema = new mongoose.Schema({
  name: { type: String, required: true }, // e.g., "Small", "Medium", "Large"
  price: { type: Number, required: true },
  isAvailable: { type: Boolean, default: true },
}, { _id: true });

const nutritionSchema = new mongoose.Schema({
  calories: Number,
  protein: Number,
  carbs: Number,
  fat: Number,
  fiber: Number,
}, { _id: false });

const productSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Product name is required'],
    trim: true,
    maxlength: [100, 'Product name cannot exceed 100 characters'],
  },
  slug: {
    type: String,
    unique: true,
    lowercase: true,
  },
  description: {
    type: String,
    required: [true, 'Description is required'],
    maxlength: [500, 'Description cannot exceed 500 characters'],
  },
  category: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Category',
    required: [true, 'Category is required'],
  },
  price: {
    type: Number,
    required: [true, 'Price is required'],
    min: [0, 'Price cannot be negative'],
  },
  discountPrice: {
    type: Number,
    min: [0, 'Discount price cannot be negative'],
    validate: {
      validator: function (val) {
        return !val || val < this.price;
      },
      message: 'Discount price must be less than original price',
    },
  },
  variants: [variantSchema],
  images: [{
    url: { type: String, required: true },
    publicId: String,
    isMain: { type: Boolean, default: false },
  }],
  type: {
    type: String,
    enum: ['veg', 'non-veg', 'vegan', 'egg'],
    required: [true, 'Food type is required'],
  },
  tags: [{ type: String, lowercase: true, trim: true }],
  ingredients: [String],
  allergens: [String],
  nutrition: nutritionSchema,
  preparationTime: { type: Number, default: 20 }, // in minutes
  isAvailable: { type: Boolean, default: true },
  isFeatured: { type: Boolean, default: false },
  isPopular: { type: Boolean, default: false },
  isNewItem: { type: Boolean, default: false },
  spiceLevel: {
    type: String,
    enum: ['none', 'mild', 'medium', 'hot', 'extra-hot'],
    default: 'none',
  },
  rating: {
    average: { type: Number, default: 0, min: 0, max: 5 },
    count: { type: Number, default: 0 },
  },
  totalOrders: { type: Number, default: 0 },
  isActive: { type: Boolean, default: true },
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true },
});

// Auto slug
productSchema.pre('save', function (next) {
  if (this.isModified('name')) {
    this.slug = this.name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '') + '-' + Date.now();
  }
  next();
});

// Virtual: effective price
productSchema.virtual('effectivePrice').get(function () {
  return this.discountPrice || this.price;
});

// Virtual: discount percentage
productSchema.virtual('discountPercent').get(function () {
  if (!this.discountPrice) return 0;
  return Math.round(((this.price - this.discountPrice) / this.price) * 100);
});

// Virtual: main image
productSchema.virtual('mainImage').get(function () {
  const main = this.images?.find((img) => img.isMain);
  return main || this.images?.[0];
});

// Indexes
productSchema.index({ name: 'text', description: 'text', tags: 'text' });
productSchema.index({ category: 1, isActive: 1 });
productSchema.index({ type: 1, isActive: 1 });
productSchema.index({ isFeatured: 1, isActive: 1 });
productSchema.index({ totalOrders: -1 });
productSchema.index({ 'rating.average': -1 });

module.exports = mongoose.model('Product', productSchema);
