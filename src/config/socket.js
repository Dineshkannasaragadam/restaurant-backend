/**
 * Socket.io Configuration
 * Real-time order tracking
 */

const { Server } = require('socket.io');
const jwt = require('jsonwebtoken');
const logger = require('../utils/logger');

let io;

const initSocket = (server) => {
  io = new Server(server, {
    cors: {
      origin: [process.env.FRONTEND_URL, 'http://localhost:3000', 'http://localhost:5173'],
      methods: ['GET', 'POST'],
      credentials: true,
    },
    pingTimeout: 60000,
  });

  // Auth middleware for socket connections
  io.use((socket, next) => {
    const token = socket.handshake.auth?.token || socket.handshake.headers?.authorization?.split(' ')[1];
    if (!token) {
      // Allow unauthenticated connections for public tracking
      socket.userId = null;
      return next();
    }
    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      socket.userId = decoded.id;
      socket.userRole = decoded.role;
      next();
    } catch {
      next(new Error('Authentication error'));
    }
  });

  io.on('connection', (socket) => {
    logger.info(`Socket connected: ${socket.id} (user: ${socket.userId || 'guest'})`);

    // Join personal room for order updates
    if (socket.userId) {
      socket.join(`user:${socket.userId}`);
    }

    // Admin joins admin room
    if (socket.userRole === 'admin') {
      socket.join('admin-room');
    }

    // Join specific order tracking room
    socket.on('track:order', (orderId) => {
      socket.join(`order:${orderId}`);
      logger.info(`Socket ${socket.id} tracking order ${orderId}`);
    });

    socket.on('leave:order', (orderId) => {
      socket.leave(`order:${orderId}`);
    });

    socket.on('disconnect', () => {
      logger.info(`Socket disconnected: ${socket.id}`);
    });
  });

  logger.info('✅ Socket.io initialized');
  return io;
};

const getIO = () => {
  if (!io) throw new Error('Socket.io not initialized');
  return io;
};

// Emit order status update to relevant rooms
const emitOrderUpdate = (order) => {
  if (!io) return;
  const payload = {
    orderId: order._id,
    status: order.status,
    updatedAt: order.updatedAt,
    estimatedDelivery: order.estimatedDelivery,
  };
  // Notify user
  io.to(`user:${order.user}`).emit('order:updated', payload);
  // Notify order tracking room
  io.to(`order:${order._id}`).emit('order:updated', payload);
  // Notify admins
  io.to('admin-room').emit('order:updated', { ...payload, userId: order.user });
};

const emitNewOrder = (order) => {
  if (!io) return;
  io.to('admin-room').emit('order:new', {
    orderId: order._id,
    userId: order.user,
    totalAmount: order.totalAmount,
    createdAt: order.createdAt,
  });
};

module.exports = { initSocket, getIO, emitOrderUpdate, emitNewOrder };
