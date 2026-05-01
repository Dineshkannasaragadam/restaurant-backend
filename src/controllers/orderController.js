/**
 * Order Controller
 * Complete order lifecycle: create, track, manage
 */

const Order = require('../models/Order');
const Product = require('../models/Product');
const Cart = require('../models/Cart');
const { AppError } = require('../middleware/errorMiddleware');
const { emitOrderUpdate, emitNewOrder } = require('../config/socket');
const { sendEmail } = require('../services/emailService');
const logger = require('../utils/logger');

const DELIVERY_FEE = 40;
const TAX_RATE = 0.05; // 5% GST
const FREE_DELIVERY_ABOVE = 500;

/**
 * POST /api/orders - Create new order
 */
exports.createOrder = async (req, res, next) => {
  try {
    const { items, deliveryAddress, deliveryType, paymentMethod, specialInstructions, couponCode } = req.body;

    // Validate and get product details
    const orderItems = [];
    let subtotal = 0;

    for (const item of items) {
      const product = await Product.findById(item.product);
      if (!product || !product.isActive || !product.isAvailable) {
        return next(new AppError(`Product ${item.product} is not available`, 400));
      }

      let price = product.effectivePrice;
      let variant = null;

      // Handle variant pricing
      if (item.variantId) {
        const v = product.variants.id(item.variantId);
        if (v && v.isAvailable) {
          price = v.price;
          variant = { name: v.name, price: v.price };
        }
      }

      const itemSubtotal = price * item.quantity;
      subtotal += itemSubtotal;

      orderItems.push({
        product: product._id,
        name: product.name,
        price,
        quantity: item.quantity,
        variant,
        image: product.mainImage?.url,
        subtotal: itemSubtotal,
      });
    }

    // Calculate pricing
    const deliveryFee = deliveryType === 'pickup' || subtotal >= FREE_DELIVERY_ABOVE ? 0 : DELIVERY_FEE;
    const tax = Math.round(subtotal * TAX_RATE * 100) / 100;
    const total = subtotal + deliveryFee + tax;

    // Create order
    const order = await Order.create({
      user: req.user._id,
      items: orderItems,
      deliveryAddress,
      deliveryType,
      pricing: { subtotal, deliveryFee, tax, total },
      payment: { method: paymentMethod, status: 'pending' },
      specialInstructions,
      estimatedDelivery: new Date(Date.now() + 45 * 60 * 1000), // 45 mins
    });

    await order.populate('user', 'name email');

    // Clear cart after order
    await Cart.findOneAndUpdate({ user: req.user._id }, { $set: { items: [] } });

    // Notify admin via socket
    emitNewOrder(order);

    // Send confirmation email
    try {
      sendEmail({
        to: req.user.email,
        subject: `Order Confirmed - ${order.orderNumber}`,
        template: 'orderConfirmation',
        data: { name: req.user.name, order },
      }).catch(err => {console.log('Email failed:', err.message);});;
    } catch (emailErr) {
      logger.warn('Order confirmation email failed:', emailErr.message);
    }

    res.status(201).json({ success: true, order });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/orders/my-orders - Get current user's orders
 */
exports.getMyOrders = async (req, res, next) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    const filter = { user: req.user._id };
    if (req.query.status) filter.status = req.query.status;

    const [orders, total] = await Promise.all([
      Order.find(filter)
        .sort('-createdAt')
        .skip(skip)
        .limit(limit)
        .populate('items.product', 'name images'),
      Order.countDocuments(filter),
    ]);

    res.json({
      success: true,
      total,
      page,
      pages: Math.ceil(total / limit),
      orders,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/orders/:id - Get single order
 */
exports.getOrder = async (req, res, next) => {
  try {
    const order = await Order.findById(req.params.id)
      .populate('user', 'name email phone')
      .populate('items.product', 'name images');

    if (!order) return next(new AppError('Order not found', 404));

    // Users can only see their own orders
    if (req.user.role !== 'admin' && order.user._id.toString() !== req.user._id.toString()) {
      return next(new AppError('Not authorized to view this order', 403));
    }

    res.json({ success: true, order });
  } catch (error) {
    next(error);
  }
};

/**
 * PATCH /api/orders/:id/status - Admin: Update order status
 */
exports.updateOrderStatus = async (req, res, next) => {
  try {
    const { status, note } = req.body;

    const validTransitions = {
      pending: ['confirmed', 'cancelled'],
      confirmed: ['delivered', 'cancelled'],
      delivered: [],
      cancelled: [],
    };

    const order = await Order.findById(req.params.id).populate('user', 'name email');
    if (!order) return next(new AppError('Order not found', 404));

    if (!validTransitions[order.status]?.includes(status)) {
      return next(new AppError(`Cannot transition from '${order.status}' to '${status}'`, 400));
    }

    order.status = status;
    order.statusHistory.push({ status, note, updatedBy: req.user._id, timestamp: new Date() });

    if (status === 'delivered') order.deliveredAt = new Date();
    if (status === 'cancelled') order.cancelledAt = new Date();

    await order.save();

    // Real-time update via Socket.io
    emitOrderUpdate(order);

    // Email notification for key statuses
    // Email notification for key statuses
    const notifyStatuses = ['delivered','confirmed', 'cancelled'];
    if (notifyStatuses.includes(status)) {
      sendEmail({
        to: order.user.email,
        subject: `Order ${order.orderNumber} - Status Update`,
        template: 'orderStatus',
        data: { name: order.user.name, order, status },
      }).catch((emailErr) => {
        logger.warn('Order status email failed:', emailErr.message);
      });
    }

    // Update product totalOrders when delivered
    if (status === 'delivered') {
      for (const item of order.items) {
        await Product.findByIdAndUpdate(item.product, {
          $inc: { totalOrders: item.quantity },
        });
      }
    }

    res.json({ success: true, order });
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/orders/:id/cancel - User cancel order
 */
exports.cancelOrder = async (req, res, next) => {
  try {
    const order = await Order.findOne({ _id: req.params.id, user: req.user._id });
    if (!order) return next(new AppError('Order not found', 404));

    const cancellableStatuses = ['pending', 'confirmed'];
    if (!cancellableStatuses.includes(order.status)) {
      return next(new AppError('Order cannot be cancelled at this stage', 400));
    }

    order.status = 'cancelled';
    order.cancelledAt = new Date();
    order.cancellationReason = req.body.reason || 'Cancelled by user';
    order.statusHistory.push({
      status: 'cancelled',
      note: order.cancellationReason,
      updatedBy: req.user._id,
      timestamp: new Date(),
    });

    await order.save();
    emitOrderUpdate(order);

    res.json({ success: true, message: 'Order cancelled successfully', order });
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/orders/:id/rate - Rate delivered order
 */
exports.rateOrder = async (req, res, next) => {
  try {
    const { score, review } = req.body;
    const order = await Order.findOne({ _id: req.params.id, user: req.user._id, status: 'delivered' });

    if (!order) return next(new AppError('Delivered order not found', 404));
    if (order.rating?.score) return next(new AppError('Order already rated', 400));

    order.rating = { score, review, createdAt: new Date() };
    await order.save();

    // Update product ratings (simplified)
    for (const item of order.items) {
      const product = await Product.findById(item.product);
      if (product) {
        const newCount = product.rating.count + 1;
        const newAvg = ((product.rating.average * product.rating.count) + score) / newCount;
        product.rating = { average: Math.round(newAvg * 10) / 10, count: newCount };
        await product.save();
      }
    }

    res.json({ success: true, message: 'Thank you for your rating!' });
  } catch (error) {
    next(error);
  }
};
