/**
 * Restaurant App - Main Server Entry Point
 * Production-grade Express + Socket.io server
 */

require('dotenv').config();
const http = require('http');
const app = require('./app');
const { connectDB } = require('./config/database');
const { initSocket } = require('./config/socket');
const logger = require('./utils/logger');

const PORT = process.env.PORT || 5000;

// Create HTTP server
const server = http.createServer(app);

// Initialize Socket.io
initSocket(server);

// Connect to MongoDB then start server
const startServer = async () => {
  try {
    await connectDB();
    server.listen(PORT, () => {
      logger.info(`🚀 Server running on port ${PORT} in ${process.env.NODE_ENV} mode`);
    });
  } catch (error) {
    logger.error('Failed to start server:', error);
    process.exit(1);
  }
};

// Handle unhandled promise rejections
process.on('unhandledRejection', (err) => {
  logger.error('Unhandled Rejection:', err);
  server.close(() => process.exit(1));
});

// Handle uncaught exceptions
process.on('uncaughtException', (err) => {
  logger.error('Uncaught Exception:', err);
  process.exit(1);
});

startServer();
