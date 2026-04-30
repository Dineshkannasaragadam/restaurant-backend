/**
 * Seed Admin User
 * Run: node src/scripts/seedAdmin.js
 */

require('dotenv').config();

const mongoose = require('mongoose');
const User = require('../models/User');

console.log("🚀 File loaded"); // 👈 this MUST print

async function seedAdmin() {
  try {
    console.log("👉 Function started");

    console.log("MONGODB_URI:", process.env.MONGODB_URI);

    if (!process.env.MONGODB_URI) {
      throw new Error("MONGODB_URI is undefined");
    }

    console.log('🔌 Connecting to MongoDB...');
    await mongoose.connect(process.env.MONGODB_URI);

    console.log('✅ Connected');

    const existing = await User.findOne({ email: 'admin@athidhi.in' });

    if (existing) {
      console.log('ℹ️ Admin already exists:', existing.email);
      return;
    }

    const admin = await User.create({
      name: 'Admin User',
      email: 'admin@athidhi.in',
      password: 'Admin@1234',
      role: 'admin',
      isEmailVerified: true,
      isActive: true,
    });

    console.log('🎉 Admin created:', admin.email);

  } catch (err) {
    console.error('❌ Error:', err);
  } finally {
    await mongoose.disconnect();
    console.log("🔌 Disconnected");
    process.exit(0);
  }
}

seedAdmin();