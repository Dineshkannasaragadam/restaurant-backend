/**
 * Cart Model
 * Persistent cart synced between localStorage and database
 */

const mongoose = require('mongoose');

const cartItemSchema = new mongoose.Schema({
  product: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Product',
    required: true,
  },
  quantity: {
    type: Number,
    required: true,
    min: [1, 'Quantity must be at least 1'],
    max: [20, 'Maximum 20 items per product'],
  },
  variant: {
    variantId: mongoose.Schema.Types.ObjectId,
    name: String,
    price: Number,
  },
  addedAt: { type: Date, default: Date.now },
}, { _id: true });

const cartSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    unique: true,
  },
  items: [cartItemSchema],
  appliedCoupon: {
    code: String,
    discount: Number,
    type: { type: String, enum: ['percentage', 'flat'] },
  },
  lastUpdated: { type: Date, default: Date.now },
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true },
});

cartSchema.pre('save', function (next) {
  this.lastUpdated = new Date();
  next();
});

// Virtual: item count
cartSchema.virtual('itemCount').get(function () {
  return this.items.reduce((acc, item) => acc + item.quantity, 0);
});

module.exports = mongoose.model('Cart', cartSchema);
