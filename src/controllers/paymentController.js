/**
 * Payment Controller
 * Razorpay integration: create order, verify payment, handle webhooks
 */

const crypto = require('crypto');
const Razorpay = require('razorpay');
const Order = require('../models/Order');
const { AppError } = require('../middleware/errorMiddleware');
const { emitOrderUpdate } = require('../config/socket');
const logger = require('../utils/logger');

// Initialize Razorpay
const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET,
});

/**
 * POST /api/payments/create-order
 * Create Razorpay order for a restaurant order
 */
exports.createPaymentOrder = async (req, res, next) => {
  try {
    const { orderId } = req.body;

    const order = await Order.findOne({ _id: orderId, user: req.user._id });
    if (!order) return next(new AppError('Order not found', 404));

    if (order.payment.status === 'paid') {
      return next(new AppError('Order already paid', 400));
    }

    // Create Razorpay order
    const razorpayOrder = await razorpay.orders.create({
      amount: Math.round(order.pricing.total * 100), // Convert to paise
      currency: 'INR',
      receipt: order.orderNumber,
      notes: {
        orderId: order._id.toString(),
        userId: req.user._id.toString(),
        orderNumber: order.orderNumber,
      },
    });

    // Store Razorpay order ID
    order.payment.razorpayOrderId = razorpayOrder.id;
    await order.save();

    res.json({
      success: true,
      razorpayOrderId: razorpayOrder.id,
      amount: razorpayOrder.amount,
      currency: razorpayOrder.currency,
      keyId: process.env.RAZORPAY_KEY_ID,
      orderNumber: order.orderNumber,
      prefill: {
        name: req.user.name,
        email: req.user.email,
        contact: req.user.phone || '',
      },
    });
  } catch (error) {
    logger.error('Razorpay order creation failed:', error);
    next(new AppError('Payment initialization failed. Please try again.', 500));
  }
};

/**
 * POST /api/payments/verify
 * Verify Razorpay payment signature after frontend payment
 */
exports.verifyPayment = async (req, res, next) => {
  try {
    const { razorpayOrderId, razorpayPaymentId, razorpaySignature, orderId } = req.body;

    if (!razorpayOrderId || !razorpayPaymentId || !razorpaySignature) {
      return next(new AppError('Payment verification data missing', 400));
    }

    // Verify signature
    const expectedSignature = crypto
      .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
      .update(`${razorpayOrderId}|${razorpayPaymentId}`)
      .digest('hex');

    if (expectedSignature !== razorpaySignature) {
      logger.warn(`Payment signature mismatch for order ${orderId}`);

      // Mark payment as failed
      await Order.findByIdAndUpdate(orderId, {
        'payment.status': 'failed',
      });

      return next(new AppError('Payment verification failed. Invalid signature.', 400));
    }

    // Update order payment status
    const order = await Order.findByIdAndUpdate(
      orderId,
      {
        'payment.status': 'paid',
        'payment.razorpayPaymentId': razorpayPaymentId,
        'payment.razorpaySignature': razorpaySignature,
        'payment.paidAt': new Date(),
        status: 'confirmed',
        $push: {
          statusHistory: {
            status: 'confirmed',
            note: 'Payment received',
            timestamp: new Date(),
          },
        },
      },
      { new: true }
    ).populate('user', 'name email');

    if (!order) return next(new AppError('Order not found', 404));

    // Real-time notification
    emitOrderUpdate(order);

    logger.info(`Payment verified for order ${order.orderNumber}`);

    res.json({
      success: true,
      message: 'Payment verified successfully',
      order: {
        _id: order._id,
        orderNumber: order.orderNumber,
        status: order.status,
        payment: order.payment,
      },
    });
  } catch (error) {
    logger.error('Payment verification error:', error);
    next(error);
  }
};

/**
 * POST /api/payments/webhook
 * Handle Razorpay webhooks (server-to-server)
 */
exports.handleWebhook = async (req, res, next) => {
  try {
    const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET;
    if (!webhookSecret) return res.status(200).json({ received: true });

    const signature = req.headers['x-razorpay-signature'];
    const body = JSON.stringify(req.body);

    const expectedSig = crypto
      .createHmac('sha256', webhookSecret)
      .update(body)
      .digest('hex');

    if (signature !== expectedSig) {
      logger.warn('Invalid webhook signature');
      return res.status(400).json({ error: 'Invalid signature' });
    }

    const event = req.body.event;
    const payment = req.body.payload?.payment?.entity;

    logger.info(`Razorpay webhook: ${event}`);

    if (event === 'payment.failed') {
      const order = await Order.findOne({ 'payment.razorpayOrderId': payment.order_id });
      if (order && order.payment.status !== 'paid') {
        order.payment.status = 'failed';
        await order.save();
        emitOrderUpdate(order);
      }
    }

    res.status(200).json({ received: true });
  } catch (error) {
    logger.error('Webhook error:', error);
    res.status(200).json({ received: true }); // Always return 200 to Razorpay
  }
};

/**
 * POST /api/payments/refund/:orderId
 * Admin: Initiate refund
 */
exports.initiateRefund = async (req, res, next) => {
  try {
    const order = await Order.findById(req.params.orderId);
    if (!order) return next(new AppError('Order not found', 404));

    if (order.payment.status !== 'paid') {
      return next(new AppError('Order has not been paid', 400));
    }

    const refund = await razorpay.payments.refund(order.payment.razorpayPaymentId, {
      amount: Math.round(order.pricing.total * 100),
      notes: { orderId: order._id.toString(), reason: req.body.reason || 'Admin refund' },
    });

    order.payment.status = 'refunded';
    await order.save();

    logger.info(`Refund initiated for order ${order.orderNumber}: ${refund.id}`);

    res.json({ success: true, message: 'Refund initiated successfully', refundId: refund.id });
  } catch (error) {
    logger.error('Refund error:', error);
    next(new AppError('Refund failed. Please try again.', 500));
  }
};

/**
 * POST /api/payments/collect-cod/:orderId
 * Admin: Manually mark COD payment as collected/paid
 */
exports.collectCodPayment = async (req, res, next) => {
  try {
    const order = await Order.findById(req.params.orderId).populate('user', 'name email');
    if (!order) return next(new AppError('Order not found', 404));

    if (order.payment.method !== 'cod') {
      return next(new AppError('This order is not a cash on delivery order', 400));
    }

    if (order.payment.status === 'paid') {
      return next(new AppError('Payment already collected', 400));
    }

    // Mark payment as collected
    order.payment.status = 'paid';
    order.payment.paidAt = new Date();
    order.statusHistory.push({
      status: order.status,
      note: 'COD payment collected',
      updatedBy: req.user._id,
      timestamp: new Date(),
    });

    await order.save();

    // Real-time notification
    emitOrderUpdate(order);

    logger.info(`COD payment collected for order ${order.orderNumber}`);

    res.json({
      success: true,
      message: 'COD payment marked as collected',
      order: {
        _id: order._id,
        orderNumber: order.orderNumber,
        payment: order.payment,
      },
    });
  } catch (error) {
    logger.error('COD collection error:', error);
    next(error);
  }
};
