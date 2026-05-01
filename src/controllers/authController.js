/**
 * Auth Controller
 * Registration, Login, Token Management
 */

const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const User = require('../models/User');
const { AppError } = require('../middleware/errorMiddleware');
const { sendEmail } = require('../services/emailService');
const logger = require('../utils/logger');

// Generate JWT tokens
const generateTokens = (userId) => {
  const accessToken = jwt.sign({ id: userId }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRE || '7d',
  });
  const refreshToken = jwt.sign({ id: userId }, process.env.JWT_REFRESH_SECRET, {
    expiresIn: process.env.JWT_REFRESH_EXPIRE || '30d',
  });
  return { accessToken, refreshToken };
};

const sendAuthResponse = (user, statusCode, res) => {
  const { accessToken, refreshToken } = generateTokens(user._id);
  const userData = {
    _id: user._id,
    name: user.name,
    email: user.email,
    phone: user.phone,
    role: user.role,
    avatar: user.avatar,
    isEmailVerified: user.isEmailVerified,
  };

  res.status(statusCode).json({
    success: true,
    accessToken,
    refreshToken,
    user: userData,
  });
};

/**
 * POST /api/auth/register
 */
exports.register = async (req, res, next) => {
  try {
    const { name, email, phone, password } = req.body;

    const existing = await User.findOne({ email });
    if (existing) {
      return next(new AppError('Email already registered. Please login.', 409));
    }

    const user = await User.create({ name, email, phone, password });

    // Send welcome email (non-blocking)
    sendEmail({
      to: user.email,
      subject: 'Welcome to Restaurant App! 🍽️',
      template: 'welcome',
      data: { name: user.name },
    }).catch((emailErr) => {
      logger.warn('Welcome email failed:', emailErr.message);
    });

    sendAuthResponse(user, 201, res);
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/auth/login
 */
exports.login = async (req, res, next) => {
  try {
    const { email, password } = req.body;

    const user = await User.findOne({ email }).select('+password');
    if (!user || !(await user.comparePassword(password))) {
      return next(new AppError('Invalid email or password', 401));
    }

    if (!user.isActive) {
      return next(new AppError('Your account has been deactivated. Contact support.', 401));
    }

    user.lastLogin = new Date();
    await user.save({ validateBeforeSave: false });

    sendAuthResponse(user, 200, res);
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/auth/refresh-token
 */
exports.refreshToken = async (req, res, next) => {
  try {
    const { refreshToken } = req.body;
    if (!refreshToken) return next(new AppError('Refresh token required', 400));

    const decoded = jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET);
    const user = await User.findById(decoded.id);
    if (!user || !user.isActive) {
      return next(new AppError('Invalid refresh token', 401));
    }

    const { accessToken, refreshToken: newRefreshToken } = generateTokens(user._id);
    res.json({ success: true, accessToken, refreshToken: newRefreshToken });
  } catch {
    next(new AppError('Invalid or expired refresh token', 401));
  }
};

/**
 * GET /api/auth/me
 */
exports.getMe = async (req, res, next) => {
  try {
    const user = await User.findById(req.user._id).populate('ordersCount');
    res.json({ success: true, user });
  } catch (error) {
    next(error);
  }
};

/**
 * PUT /api/auth/update-profile
 */
exports.updateProfile = async (req, res, next) => {
  try {
    const { name, phone } = req.body;
    const updates = {};
    if (name) updates.name = name;
    if (phone) updates.phone = phone;

    const user = await User.findByIdAndUpdate(req.user._id, updates, {
      new: true,
      runValidators: true,
    });
    res.json({ success: true, user });
  } catch (error) {
    next(error);
  }
};

/**
 * PUT /api/auth/change-password
 */
exports.changePassword = async (req, res, next) => {
  try {
    const { currentPassword, newPassword } = req.body;
    if (!currentPassword || !newPassword) {
      return next(new AppError('Current and new password are required', 400));
    }

    const user = await User.findById(req.user._id).select('+password');
    if (!(await user.comparePassword(currentPassword))) {
      return next(new AppError('Current password is incorrect', 400));
    }

    user.password = newPassword;
    await user.save();

    sendAuthResponse(user, 200, res);
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/auth/forgot-password
 */
exports.forgotPassword = async (req, res, next) => {
  try {
    const { email } = req.body;
    const user = await User.findOne({ email });
    if (!user) {
      return res.json({ success: true, message: 'If that email exists, a reset link has been sent.' });
    }

    const resetToken = crypto.randomBytes(32).toString('hex');
    user.passwordResetToken = crypto.createHash('sha256').update(resetToken).digest('hex');
    user.passwordResetExpires = Date.now() + 30 * 60 * 1000;
    await user.save({ validateBeforeSave: false });

    const resetUrl = `${process.env.FRONTEND_URL}/reset-password/${resetToken}`;

    // Send email (non-blocking, no failure crash)
    sendEmail({
      to: user.email,
      subject: 'Password Reset Request',
      template: 'resetPassword',
      data: { name: user.name, resetUrl },
    }).catch((err) => {
      logger.warn('Reset email failed:', err.message);
    });

    res.json({ success: true, message: 'Reset link sent to your email.' });
  } catch (error) {
    next(error);
  }
};

/**
 * PUT /api/auth/reset-password/:token
 */
exports.resetPassword = async (req, res, next) => {
  try {
    const hashedToken = crypto.createHash('sha256').update(req.params.token).digest('hex');
    const user = await User.findOne({
      passwordResetToken: hashedToken,
      passwordResetExpires: { $gt: Date.now() },
    });

    if (!user) return next(new AppError('Invalid or expired reset token', 400));

    user.password = req.body.password;
    user.passwordResetToken = undefined;
    user.passwordResetExpires = undefined;
    await user.save();

    sendAuthResponse(user, 200, res);
  } catch (error) {
    next(error);
  }
};
