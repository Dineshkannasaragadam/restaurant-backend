/**
 * Email Service
 * Nodemailer with HTML templates
 */

const nodemailer = require('nodemailer');
const logger = require('../utils/logger');

// Create transporter
const createTransporter = () =>
  nodemailer.createTransport({
    host: process.env.EMAIL_HOST,
    port: parseInt(process.env.EMAIL_PORT) || 587,
    secure: process.env.EMAIL_PORT === '465',
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS,
    },
  });

// Email HTML templates
const templates = {
  welcome: ({ name }) => ({
    subject: 'Welcome to Restaurant App! 🍽️',
    html: `
      <div style="font-family: 'Segoe UI', sans-serif; max-width: 600px; margin: auto; background: #fff;">
        <div style="background: linear-gradient(135deg, #FF6B35, #F7931E); padding: 40px; text-align: center;">
          <h1 style="color: white; margin: 0; font-size: 28px;">Welcome, ${name}! 🎉</h1>
        </div>
        <div style="padding: 40px;">
          <p style="color: #333; font-size: 16px; line-height: 1.6;">
            Your account has been created successfully. Start exploring our delicious menu and place your first order!
          </p>
          <a href="${process.env.FRONTEND_URL}" 
             style="display: inline-block; background: #FF6B35; color: white; padding: 14px 32px; 
                    border-radius: 8px; text-decoration: none; font-weight: 600; margin-top: 20px;">
            Browse Menu →
          </a>
        </div>
        <div style="background: #f9f9f9; padding: 20px; text-align: center; color: #999; font-size: 13px;">
          © ${new Date().getFullYear()} Restaurant App. All rights reserved.
        </div>
      </div>
    `,
  }),

  orderConfirmation: ({ name, order }) => ({
    subject: `Order Confirmed ✅ - ${order.orderNumber}`,
    html: `
      <div style="font-family: 'Segoe UI', sans-serif; max-width: 600px; margin: auto; background: #fff;">
        <div style="background: linear-gradient(135deg, #FF6B35, #F7931E); padding: 40px; text-align: center;">
          <h1 style="color: white; margin: 0;">Order Confirmed! ✅</h1>
          <p style="color: rgba(255,255,255,0.9); margin: 10px 0 0;">Order #${order.orderNumber}</p>
        </div>
        <div style="padding: 40px;">
          <p style="color: #333; font-size: 16px;">Hi ${name},</p>
          <p style="color: #555;">Your order has been placed successfully. Here's your summary:</p>
          
          <div style="background: #f9f9f9; border-radius: 8px; padding: 20px; margin: 20px 0;">
            ${order.items.map(item => `
              <div style="display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid #eee;">
                <span>${item.name} × ${item.quantity}</span>
                <span style="font-weight: 600;">₹${(item.price * item.quantity).toFixed(2)}</span>
              </div>
            `).join('')}
            <div style="margin-top: 12px; font-size: 18px; font-weight: bold; text-align: right; color: #FF6B35;">
              Total: ₹${order.pricing.total.toFixed(2)}
            </div>
          </div>

          <p style="color: #555;">Estimated delivery: <strong>45 minutes</strong></p>
          
          <a href="${process.env.FRONTEND_URL}/orders/${order._id}" 
             style="display: inline-block; background: #FF6B35; color: white; padding: 14px 32px; 
                    border-radius: 8px; text-decoration: none; font-weight: 600; margin-top: 10px;">
            Track Order →
          </a>
        </div>
      </div>
    `,
  }),

  orderStatus: ({ name, order, status }) => {
    const statusMessages = {
      confirmed: { icon: '✅', title: 'Order Confirmed', msg: 'Your order has been confirmed and will be prepared shortly.' },
      preparing: { icon: '👨‍🍳', title: 'Being Prepared', msg: 'Our chefs are preparing your delicious meal!' },
      out_for_delivery: { icon: '🛵', title: 'Out for Delivery', msg: "Your order is on its way! It'll arrive soon." },
      delivered: { icon: '🎉', title: 'Delivered!', msg: 'Your order has been delivered. Enjoy your meal!' },
      cancelled: { icon: '❌', title: 'Order Cancelled', msg: 'Your order has been cancelled.' },
    };
    const s = statusMessages[status] || { icon: '📦', title: 'Status Updated', msg: `Order status: ${status}` };

    return {
      subject: `Order ${order.orderNumber} - ${s.title} ${s.icon}`,
      html: `
        <div style="font-family: 'Segoe UI', sans-serif; max-width: 600px; margin: auto; background: #fff;">
          <div style="background: linear-gradient(135deg, #FF6B35, #F7931E); padding: 40px; text-align: center;">
            <div style="font-size: 48px; margin-bottom: 10px;">${s.icon}</div>
            <h1 style="color: white; margin: 0;">${s.title}</h1>
          </div>
          <div style="padding: 40px;">
            <p style="color: #333;">Hi ${name},</p>
            <p style="color: #555; font-size: 16px;">${s.msg}</p>
            <p style="color: #777;">Order #${order.orderNumber}</p>
            <a href="${process.env.FRONTEND_URL}/orders/${order._id}" 
               style="display: inline-block; background: #FF6B35; color: white; padding: 14px 32px; 
                      border-radius: 8px; text-decoration: none; font-weight: 600; margin-top: 20px;">
              View Order →
            </a>
          </div>
        </div>
      `,
    };
  },

  resetPassword: ({ name, resetUrl }) => ({
    subject: 'Password Reset Request 🔐',
    html: `
      <div style="font-family: 'Segoe UI', sans-serif; max-width: 600px; margin: auto; background: #fff;">
        <div style="background: linear-gradient(135deg, #667eea, #764ba2); padding: 40px; text-align: center;">
          <h1 style="color: white; margin: 0;">Reset Password 🔐</h1>
        </div>
        <div style="padding: 40px;">
          <p>Hi ${name},</p>
          <p>Click the button below to reset your password. This link expires in <strong>30 minutes</strong>.</p>
          <a href="${resetUrl}" 
             style="display: inline-block; background: #667eea; color: white; padding: 14px 32px; 
                    border-radius: 8px; text-decoration: none; font-weight: 600; margin-top: 10px;">
            Reset Password →
          </a>
          <p style="color: #999; font-size: 13px; margin-top: 30px;">
            If you didn't request this, please ignore this email.
          </p>
        </div>
      </div>
    `,
  }),
};

/**
 * Send email using template
 */
const sendEmail = async ({ to, subject, template, data, html }) => {
  try {
    const transporter = createTransporter();

    let emailContent = { subject, html: html || '' };
    if (template && templates[template]) {
      const rendered = templates[template](data || {});
      emailContent = rendered;
    }

    const info = await transporter.sendMail({
      from: process.env.EMAIL_FROM,
      to,
      subject: emailContent.subject,
      html: emailContent.html,
    });

    logger.info(`Email sent to ${to}: ${info.messageId}`);
    return info;
  } catch (error) {
    logger.error('Email send failed:', error);
    throw error;
  }
};

module.exports = { sendEmail };
