/**
 * Admin Controller
 * Dashboard analytics, order management, user management
 */

const Order = require('../models/Order');
const Product = require('../models/Product');
const User = require('../models/User');
const Category = require('../models/Category');
const { AppError } = require('../middleware/errorMiddleware');

/**
 * GET /api/admin/dashboard
 * Aggregated stats for admin dashboard
 */
exports.getDashboard = async (req, res, next) => {
  try {
    const now = new Date();
    const todayStart = new Date(now.setHours(0, 0, 0, 0));
    const weekStart = new Date(now - 7 * 24 * 60 * 60 * 1000);
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

    const [
      totalOrders,
      todayOrders,
      pendingOrders,
      totalRevenue,
      todayRevenue,
      totalUsers,
      newUsersToday,
      totalProducts,
      topProducts,
      recentOrders,
      dailyRevenue,
      ordersByStatus,
    ] = await Promise.all([
      // Counts
      Order.countDocuments({ 'payment.status': 'paid' }),
      Order.countDocuments({ createdAt: { $gte: todayStart }, 'payment.status': 'paid' }),
      Order.countDocuments({ status: { $in: ['pending', 'confirmed', 'preparing'] } }),

      // Revenue
      Order.aggregate([
        { $match: { 'payment.status': 'paid' } },
        { $group: { _id: null, total: { $sum: '$pricing.total' } } },
      ]),
      Order.aggregate([
        { $match: { 'payment.status': 'paid', createdAt: { $gte: todayStart } } },
        { $group: { _id: null, total: { $sum: '$pricing.total' } } },
      ]),

      // Users
      User.countDocuments({ role: 'user' }),
      User.countDocuments({ role: 'user', createdAt: { $gte: todayStart } }),

      // Products
      Product.countDocuments({ isActive: true }),

      // Top 5 selling products
      Product.find({ isActive: true }).sort('-totalOrders').limit(5).select('name totalOrders price images rating'),

      // Recent 10 orders
      Order.find()
        .sort('-createdAt')
        .limit(10)
        .populate('user', 'name email')
        .select('orderNumber status pricing.total createdAt payment.status'),

      // Daily revenue last 7 days
      Order.aggregate([
        { $match: { 'payment.status': 'paid', createdAt: { $gte: weekStart } } },
        {
          $group: {
            _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
            revenue: { $sum: '$pricing.total' },
            orders: { $sum: 1 },
          },
        },
        { $sort: { _id: 1 } },
      ]),

      // Orders by status
      Order.aggregate([
        { $group: { _id: '$status', count: { $sum: 1 } } },
      ]),
    ]);

    // Monthly revenue breakdown
    const monthlyRevenue = await Order.aggregate([
      {
        $match: {
          'payment.status': 'paid',
          createdAt: { $gte: new Date(now.getFullYear(), 0, 1) }, // YTD
        },
      },
      {
        $group: {
          _id: { $month: '$createdAt' },
          revenue: { $sum: '$pricing.total' },
          orders: { $sum: 1 },
        },
      },
      { $sort: { _id: 1 } },
    ]);

    res.json({
      success: true,
      dashboard: {
        stats: {
          totalOrders,
          todayOrders,
          pendingOrders,
          totalRevenue: totalRevenue[0]?.total || 0,
          todayRevenue: todayRevenue[0]?.total || 0,
          totalUsers,
          newUsersToday,
          totalProducts,
        },
        topProducts,
        recentOrders,
        charts: {
          dailyRevenue,
          monthlyRevenue,
          ordersByStatus: ordersByStatus.reduce((acc, s) => ({ ...acc, [s._id]: s.count }), {}),
        },
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/admin/orders - All orders with filters
 */
exports.getAllOrders = async (req, res, next) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const skip = (page - 1) * limit;

    const filter = {};
    if (req.query.status) filter.status = req.query.status;
    if (req.query.paymentStatus) filter['payment.status'] = req.query.paymentStatus;
    if (req.query.from) filter.createdAt = { $gte: new Date(req.query.from) };
    if (req.query.to) filter.createdAt = { ...filter.createdAt, $lte: new Date(req.query.to) };
    if (req.query.search) {
      filter.$or = [
        { orderNumber: { $regex: req.query.search, $options: 'i' } },
      ];
    }

    const [orders, total] = await Promise.all([
      Order.find(filter)
        .sort('-createdAt')
        .skip(skip)
        .limit(limit)
        .populate('user', 'name email phone'),
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
 * GET /api/admin/users - All users
 */
exports.getAllUsers = async (req, res, next) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const skip = (page - 1) * limit;

    const filter = { role: 'user' };
    if (req.query.search) {
      filter.$or = [
        { name: { $regex: req.query.search, $options: 'i' } },
        { email: { $regex: req.query.search, $options: 'i' } },
      ];
    }

    const [users, total] = await Promise.all([
      User.find(filter).sort('-createdAt').skip(skip).limit(limit).select('-password'),
      User.countDocuments(filter),
    ]);

    res.json({ success: true, total, page, pages: Math.ceil(total / limit), users });
  } catch (error) {
    next(error);
  }
};

/**
 * PATCH /api/admin/users/:id/toggle-status
 */
exports.toggleUserStatus = async (req, res, next) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) return next(new AppError('User not found', 404));
    if (user.role === 'admin') return next(new AppError('Cannot deactivate admin', 403));

    user.isActive = !user.isActive;
    await user.save();

    res.json({ success: true, isActive: user.isActive, message: `User ${user.isActive ? 'activated' : 'deactivated'}` });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/admin/analytics/revenue
 * Revenue analytics with date range
 */
exports.getRevenueAnalytics = async (req, res, next) => {
  try {
    const days = parseInt(req.query.days) || 30;
    const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    const [dailyData, categoryRevenue] = await Promise.all([
      Order.aggregate([
        { $match: { 'payment.status': 'paid', createdAt: { $gte: startDate } } },
        {
          $group: {
            _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
            revenue: { $sum: '$pricing.total' },
            orders: { $sum: 1 },
            avgOrderValue: { $avg: '$pricing.total' },
          },
        },
        { $sort: { _id: 1 } },
      ]),
      Order.aggregate([
        { $match: { 'payment.status': 'paid', createdAt: { $gte: startDate } } },
        { $unwind: '$items' },
        {
          $lookup: {
            from: 'products',
            localField: 'items.product',
            foreignField: '_id',
            as: 'product',
          },
        },
        { $unwind: '$product' },
        {
          $lookup: {
            from: 'categories',
            localField: 'product.category',
            foreignField: '_id',
            as: 'category',
          },
        },
        { $unwind: '$category' },
        {
          $group: {
            _id: '$category.name',
            revenue: { $sum: { $multiply: ['$items.price', '$items.quantity'] } },
            quantity: { $sum: '$items.quantity' },
          },
        },
        { $sort: { revenue: -1 } },
      ]),
    ]);

    res.json({ success: true, dailyData, categoryRevenue });
  } catch (error) {
    next(error);
  }
};
