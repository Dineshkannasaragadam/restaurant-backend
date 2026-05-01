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
const TAX_RATE = 0.05;
const FREE_DELIVERY_ABOVE = 500;

/**
 * CREATE ORDER
 */
exports.createOrder = async (req, res, next) => {
  try {
    const { items, deliveryAddress, deliveryType, paymentMethod, specialInstructions } = req.body;

    const orderItems = [];
    let subtotal = 0;

    for (const item of items) {
      const product = await Product.findById(item.product);

      if (!product || !product.isActive || !product.isAvailable) {
        return next(new AppError(`Product ${item.product} is not available`, 400));
      }

      let price = product.discountPrice || product.price;
      let variant = null;

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
        image: product.images?.find(img => img.isMain)?.url || product.images?.[0]?.url,
        subtotal: itemSubtotal,
      });
    }

    const deliveryFee =
      deliveryType === 'pickup' || subtotal >= FREE_DELIVERY_ABOVE ? 0 : DELIVERY_FEE;

    const tax = Math.round(subtotal * TAX_RATE * 100) / 100;
    const total = subtotal + deliveryFee + tax;

    const order = await Order.create({
      user: req.user._id,
      items: orderItems,
      deliveryAddress,
      deliveryType,
      pricing: { subtotal, deliveryFee, tax, total },
      payment: {
        method: paymentMethod,
        status: 'pending',
      },
      specialInstructions,
      estimatedDelivery: new Date(Date.now() + 45 * 60 * 1000),
    });

    await order.populate('user', 'name email');

    await Cart.findOneAndUpdate({ user: req.user._id }, { $set: { items: [] } });

    // Socket safe emit
    try {
      emitNewOrder(order);
    } catch (err) {
      logger.warn('Socket emit failed:', err.message);
    }

    // Non-blocking email
    sendEmail({
      to: req.user.email,
      subject: `Order Confirmed - ${order.orderNumber}`,
      template: 'orderConfirmation',
      data: { name: req.user.name, order },
    }).catch(err => {
      logger.warn('Email failed:', err.message);
    });

    res.status(201).json({ success: true, order });
  } catch (error) {
    next(error);
  }
};

/**
 * GET MY ORDERS
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
 * GET SINGLE ORDER
 */
exports.getOrder = async (req, res, next) => {
  try {
    const order = await Order.findById(req.params.id)
      .populate('user', 'name email phone')
      .populate('items.product', 'name images');

    if (!order) return next(new AppError('Order not found', 404));

    if (
      req.user.role !== 'admin' &&
      order.user._id.toString() !== req.user._id.toString()
    ) {
      return next(new AppError('Not authorized', 403));
    }

    res.json({ success: true, order });
  } catch (error) {
    next(error);
  }
};

/**
 * UPDATE ORDER STATUS (FIXED 🔥)
 */
exports.updateOrderStatus = async (req, res, next) => {
  try {
    let { status, note } = req.body;

    // FIX: normalize input
    status = status?.toLowerCase().trim();

    const allowedStatuses = ['pending', 'confirmed', 'delivered', 'cancelled'];

    if (!allowedStatuses.includes(status)) {
      return next(new AppError(`Invalid status '${status}'`, 400));
    }

    const validTransitions = {
      pending: ['confirmed', 'cancelled'],
      confirmed: ['delivered', 'cancelled'],
      delivered: [],
      cancelled: [],
    };

    const order = await Order.findById(req.params.id).populate('user', 'name email');

    if (!order) return next(new AppError('Order not found', 404));

    if (!validTransitions[order.status]?.includes(status)) {
      return next(
        new AppError(`Cannot transition from '${order.status}' to '${status}'`, 400)
      );
    }

    order.status = status;

    order.statusHistory.push({
      status,
      note,
      updatedBy: req.user._id,
      timestamp: new Date(),
    });

    if (status === 'delivered') order.deliveredAt = new Date();
    if (status === 'cancelled') order.cancelledAt = new Date();

    await order.save();

    try {
      emitOrderUpdate(order);
    } catch (err) {
      logger.warn('Socket emit failed:', err.message);
    }

    sendEmail({
      to: order.user.email,
      subject: `Order ${order.orderNumber} - Status Update`,
      template: 'orderStatus',
      data: { name: order.user.name, order, status },
    }).catch(err => {
      logger.warn('Email failed:', err.message);
    });

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
 * CANCEL ORDER
 */
exports.cancelOrder = async (req, res, next) => {
  try {
    const order = await Order.findOne({
      _id: req.params.id,
      user: req.user._id,
    });

    if (!order) return next(new AppError('Order not found', 404));

    if (!['pending', 'confirmed'].includes(order.status)) {
      return next(new AppError('Cannot cancel at this stage', 400));
    }

    order.status = 'cancelled';
    order.cancelledAt = new Date();

    await order.save();

    try {
      emitOrderUpdate(order);
    } catch (err) {
      logger.warn('Socket emit failed:', err.message);
    }

    sendEmail({
      to: req.user.email,
      subject: `Order ${order.orderNumber} - Cancelled`,
      template: 'orderStatus',
      data: { name: req.user.name, order, status: 'cancelled' },
    }).catch(err => {
      logger.warn('Email failed:', err.message);
    });

    res.json({ success: true, message: 'Order cancelled', order });
  } catch (error) {
    next(error);
  }
};

/**
 * RATE ORDER
 */
exports.rateOrder = async (req, res, next) => {
  try {
    const { score, review } = req.body;

    if (!score || score < 1 || score > 5) {
      return next(new AppError('Score must be between 1 and 5', 400));
    }

    const order = await Order.findOne({
      _id: req.params.id,
      user: req.user._id,
      status: 'delivered',
    });

    if (!order) return next(new AppError('Delivered order not found', 404));
    if (order.rating?.score) return next(new AppError('Already rated', 400));

    order.rating = { score, review, createdAt: new Date() };
    await order.save();

    res.json({ success: true, message: 'Thanks for rating!' });
  } catch (error) {
    next(error);
  }
};
