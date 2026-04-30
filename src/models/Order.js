/**
 * Order Model
 * Complete order lifecycle management
 */

const mongoose = require('mongoose');

const orderItemSchema = new mongoose.Schema({
  product: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Product',
    required: true,
  },
  name: { type: String, required: true }, // Snapshot at order time
  price: { type: Number, required: true }, // Snapshot at order time
  quantity: {
    type: Number,
    required: true,
    min: [1, 'Quantity must be at least 1'],
  },
  variant: {
    name: String,
    price: Number,
  },
  image: String,
  subtotal: Number,
}, { _id: true });

// Calculate subtotal before saving
orderItemSchema.pre('save', function (next) {
  this.subtotal = (this.variant?.price || this.price) * this.quantity;
  next();
});

const deliveryAddressSchema = new mongoose.Schema({
  street: { type: String, required: true },
  city: { type: String, required: true },
  state: { type: String, required: true },
  pincode: { type: String, required: true },
  landmark: String,
  coordinates: {
    lat: Number,
    lng: Number,
  },
}, { _id: false });

const statusHistorySchema = new mongoose.Schema({
  status: { type: String, required: true },
  timestamp: { type: Date, default: Date.now },
  note: String,
  updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
}, { _id: false });

const orderSchema = new mongoose.Schema({
  orderNumber: {
    type: String,
    unique: true,
  },
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  items: [orderItemSchema],
  status: {
    type: String,
    enum: ['pending', 'confirmed', 'preparing', 'ready', 'out_for_delivery', 'delivered', 'cancelled'],
    default: 'pending',
  },
  statusHistory: [statusHistorySchema],
  deliveryAddress: deliveryAddressSchema,
  deliveryType: {
    type: String,
    enum: ['delivery', 'pickup'],
    default: 'delivery',
  },
  pricing: {
    subtotal: { type: Number, required: true },
    deliveryFee: { type: Number, default: 0 },
    tax: { type: Number, default: 0 },
    discount: { type: Number, default: 0 },
    total: { type: Number, required: true },
  },
  payment: {
    method: { type: String, enum: ['online', 'cod'], default: 'online' },
    status: { type: String, enum: ['pending', 'paid', 'failed', 'refunded'], default: 'pending' },
    razorpayOrderId: String,
    razorpayPaymentId: String,
    razorpaySignature: String,
    paidAt: Date,
  },
  coupon: {
    code: String,
    discount: Number,
  },
  specialInstructions: {
    type: String,
    maxlength: [300, 'Instructions too long'],
  },
  estimatedDelivery: Date,
  deliveredAt: Date,
  cancelledAt: Date,
  cancellationReason: String,
  rating: {
    score: { type: Number, min: 1, max: 5 },
    review: String,
    createdAt: Date,
  },
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true },
});

// Generate unique order number
orderSchema.pre('save', async function (next) {
  if (this.isNew) {
    const date = new Date();
    const prefix = `ORD${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, '0')}`;
    const count = await this.constructor.countDocuments();
    this.orderNumber = `${prefix}${String(count + 1).padStart(5, '0')}`;

    // Calculate item subtotals
    this.items.forEach((item) => {
      item.subtotal = (item.variant?.price || item.price) * item.quantity;
    });

    // Initialize status history
    this.statusHistory = [{ status: 'pending', timestamp: new Date() }];
  }
  next();
});

// Indexes
orderSchema.index({ user: 1, createdAt: -1 });
orderSchema.index({ status: 1, createdAt: -1 });
orderSchema.index({ 'payment.razorpayOrderId': 1 });

module.exports = mongoose.model('Order', orderSchema);
