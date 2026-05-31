/**
 * Email Service using Brevo REST API
 * 300 free emails per day — works on Render, Vercel, etc.
 */

const logger = require('../utils/logger');
const { sendEmailViaAPI } = require('./brevoApi');

// Brevo API is now used via brevoApi.js

// ─── Email Templates ──────────────────────────────────────────────────────────
const templates = {

  welcome: ({ name }) => ({
    subject: 'Welcome to Athidhi! 🍽️',
    html: `
      <div style="font-family: 'Segoe UI', sans-serif; max-width: 600px; 
                  margin: auto; background: #fff;">
        <div style="background: linear-gradient(135deg, #FF6B35, #F7931E); 
                    padding: 40px; text-align: center;">
          <h1 style="color: white; margin: 0; font-size: 28px;">
            Welcome, ${name}! 🎉
          </h1>
        </div>
        <div style="padding: 40px;">
          <p style="color: #333; font-size: 16px; line-height: 1.6;">
            Your account has been created successfully. 
            Start exploring our delicious menu!
          </p>
          <a href="${process.env.FRONTEND_URL}" 
             style="display: inline-block; background: #FF6B35; color: white; 
                    padding: 14px 32px; border-radius: 8px; text-decoration: none; 
                    font-weight: 600; margin-top: 20px;">
            Browse Menu →
          </a>
        </div>
        <div style="background: #f9f9f9; padding: 20px; text-align: center; 
                    color: #999; font-size: 13px;">
          © ${new Date().getFullYear()} Athidhi Restaurant
        </div>
      </div>
    `,
  }),

  orderConfirmation: ({ name, order }) => ({
    subject: `Order Confirmed ✅ - ${order.orderNumber}`,
    html: `
      <div style="font-family: 'Segoe UI', sans-serif; max-width: 600px; 
                  margin: auto; background: #fff;">
        <div style="background: linear-gradient(135deg, #FF6B35, #F7931E); 
                    padding: 40px; text-align: center;">
          <h1 style="color: white; margin: 0;">Order Confirmed! ✅</h1>
          <p style="color: rgba(255,255,255,0.9); margin: 10px 0 0;">
            Order #${order.orderNumber}
          </p>
        </div>
        <div style="padding: 40px;">
          <p style="color: #333; font-size: 16px;">Hi ${name},</p>
          <p style="color: #555;">Your order has been placed successfully!</p>

          <div style="background: #f9f9f9; border-radius: 8px; 
                      padding: 20px; margin: 20px 0;">
            ${order.items.map(item => `
              <div style="display: flex; justify-content: space-between; 
                          padding: 8px 0; border-bottom: 1px solid #eee; 
                          font-size: 14px;">
                <span>${item.name} × ${item.quantity}</span>
                <span style="font-weight: 600;">
                  ₹${(item.price * item.quantity).toFixed(2)}
                </span>
              </div>
            `).join('')}
            <div style="margin-top: 12px; font-size: 18px; font-weight: bold; 
                        text-align: right; color: #FF6B35;">
              Total: ₹${order.pricing.total.toFixed(2)}
            </div>
          </div>

          <p style="color: #555;">
            Payment: 
            <strong>
              ${order.payment.method === 'cod' 
                ? 'Cash on Delivery' 
                : 'Online Payment'}
            </strong>
          </p>
          <p style="color: #555;">
            Estimated delivery: <strong>45 minutes</strong>
          </p>

          <a href="${process.env.FRONTEND_URL}/orders/${order._id}" 
             style="display: inline-block; background: #FF6B35; color: white; 
                    padding: 14px 32px; border-radius: 8px; text-decoration: none; 
                    font-weight: 600; margin-top: 10px;">
            Track Order →
          </a>
        </div>
        <div style="background: #f9f9f9; padding: 20px; text-align: center; 
                    color: #999; font-size: 13px;">
          © ${new Date().getFullYear()} Athidhi Restaurant
        </div>
      </div>
    `,
  }),

  orderStatus: ({ name, order, status }) => {
    const statusMessages = {
      confirmed: {
        icon: '✅',
        title: 'Order Confirmed',
        msg: 'Your order has been confirmed!',
      },
      preparing: {
        icon: '👨‍🍳',
        title: 'Being Prepared',
        msg: 'Our chefs are preparing your meal!',
      },
      out_for_delivery: {
        icon: '🛵',
        title: 'Out for Delivery',
        msg: 'Your order is on the way!',
      },
      delivered: {
        icon: '🎉',
        title: 'Delivered!',
        msg: 'Your order has been delivered. Enjoy your meal!',
      },
      cancelled: {
        icon: '❌',
        title: 'Order Cancelled',
        msg: 'Your order has been cancelled.',
      },
    };

    const s = statusMessages[status] || {
      icon: '📦',
      title: 'Status Updated',
      msg: `Your order status is now: ${status}`,
    };

    return {
      subject: `Order ${order.orderNumber} - ${s.title} ${s.icon}`,
      html: `
        <div style="font-family: 'Segoe UI', sans-serif; max-width: 600px; 
                    margin: auto; background: #fff;">
          <div style="background: linear-gradient(135deg, #FF6B35, #F7931E); 
                      padding: 40px; text-align: center;">
            <div style="font-size: 48px; margin-bottom: 10px;">${s.icon}</div>
            <h1 style="color: white; margin: 0;">${s.title}</h1>
          </div>
          <div style="padding: 40px;">
            <p style="color: #333;">Hi ${name},</p>
            <p style="color: #555; font-size: 16px;">${s.msg}</p>
            <p style="color: #777;">Order #${order.orderNumber}</p>
            <a href="${process.env.FRONTEND_URL}/orders/${order._id}" 
               style="display: inline-block; background: #FF6B35; color: white; 
                      padding: 14px 32px; border-radius: 8px; text-decoration: none; 
                      font-weight: 600; margin-top: 20px;">
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
      <div style="font-family: 'Segoe UI', sans-serif; max-width: 600px; 
                  margin: auto; background: #fff;">
        <div style="background: linear-gradient(135deg, #667eea, #764ba2); 
                    padding: 40px; text-align: center;">
          <h1 style="color: white; margin: 0;">Reset Password 🔐</h1>
        </div>
        <div style="padding: 40px;">
          <p>Hi ${name},</p>
          <p>
            Click below to reset your password. 
            This link expires in <strong>30 minutes</strong>.
          </p>
          <a href="${resetUrl}" 
             style="display: inline-block; background: #667eea; color: white; 
                    padding: 14px 32px; border-radius: 8px; text-decoration: none; 
                    font-weight: 600;">
            Reset Password →
          </a>
          <p style="color: #999; font-size: 13px; margin-top: 30px;">
            If you didn't request this, ignore this email.
          </p>
        </div>
      </div>
    `,
  }),

  newOrderAdmin: ({ order, user }) => ({
    subject: `🛵 New Order - ${order.orderNumber}`,
    html: `
      <div style="font-family: 'Segoe UI', sans-serif; max-width: 600px; 
                  margin: auto; background: #fff;">
        <div style="background: linear-gradient(135deg, #1a1a1a, #333); 
                    padding: 40px; text-align: center;">
          <h1 style="color: white; margin: 0;">🛵 New Order Received!</h1>
          <p style="color: rgba(255,255,255,0.7); margin: 10px 0 0;">
            Review and confirm
          </p>
        </div>
        <div style="padding: 40px;">

          <div style="background: #f9f9f9; border-radius: 12px; 
                      padding: 20px; margin-bottom: 20px;">
            <h2 style="margin: 0 0 15px; color: #333; font-size: 18px;">
              Order Details
            </h2>
            <table style="width: 100%; font-size: 14px;">
              <tr>
                <td style="padding: 6px 0; color: #666;">Order Number</td>
                <td style="padding: 6px 0; font-weight: bold;">
                  #${order.orderNumber}
                </td>
              </tr>
              <tr>
                <td style="padding: 6px 0; color: #666;">Payment</td>
                <td style="padding: 6px 0; font-weight: bold;">
                  ${order.payment.method === 'cod' 
                    ? '💵 Cash on Delivery' 
                    : '💳 Online Payment'}
                </td>
              </tr>
              <tr>
                <td style="padding: 6px 0; color: #666;">Delivery</td>
                <td style="padding: 6px 0; font-weight: bold;">
                  ${order.deliveryType === 'pickup' 
                    ? '🏪 Self Pickup' 
                    : '🛵 Home Delivery'}
                </td>
              </tr>
            </table>
          </div>

          <div style="background: #f0f7ff; border-radius: 12px; 
                      padding: 20px; margin-bottom: 20px;">
            <h2 style="margin: 0 0 15px; color: #333; font-size: 18px;">
              👤 Customer
            </h2>
            <table style="width: 100%; font-size: 14px;">
              <tr>
                <td style="padding: 6px 0; color: #666;">Name</td>
                <td style="padding: 6px 0; font-weight: bold;">${user.name}</td>
              </tr>
              <tr>
                <td style="padding: 6px 0; color: #666;">Email</td>
                <td style="padding: 6px 0; font-weight: bold;">${user.email}</td>
              </tr>
              <tr>
                <td style="padding: 6px 0; color: #666;">Phone</td>
                <td style="padding: 6px 0; font-weight: bold;">
                  ${user.phone || 'Not provided'}
                </td>
              </tr>
              ${order.deliveryAddress ? `
              <tr>
                <td style="padding: 6px 0; color: #666;">Address</td>
                <td style="padding: 6px 0; font-weight: bold;">
                  ${order.deliveryAddress.street}, 
                  ${order.deliveryAddress.city},
                  ${order.deliveryAddress.state} - 
                  ${order.deliveryAddress.pincode}
                </td>
              </tr>
              ` : ''}
            </table>
          </div>

          <div style="margin-bottom: 20px;">
            <h2 style="margin: 0 0 15px; color: #333; font-size: 18px;">
              🍽️ Items
            </h2>
            ${order.items.map(item => `
              <div style="display: flex; justify-content: space-between; 
                          padding: 10px 0; border-bottom: 1px solid #eee; 
                          font-size: 14px;">
                <span>${item.name} × ${item.quantity}</span>
                <span style="font-weight: bold;">
                  ₹${item.subtotal?.toFixed(2)}
                </span>
              </div>
            `).join('')}
          </div>

          <div style="background: #f9f9f9; border-radius: 12px; 
                      padding: 20px; margin-bottom: 20px;">
            <div style="display: flex; justify-content: space-between; 
                        padding: 6px 0; font-size: 14px; color: #666;">
              <span>Subtotal</span>
              <span>₹${order.pricing.subtotal.toFixed(2)}</span>
            </div>
            <div style="display: flex; justify-content: space-between; 
                        padding: 6px 0; font-size: 14px; color: #666;">
              <span>Delivery</span>
              <span>
                ${order.pricing.deliveryFee === 0 
                  ? 'FREE' 
                  : `₹${order.pricing.deliveryFee}`}
              </span>
            </div>
            <div style="display: flex; justify-content: space-between; 
                        padding: 6px 0; font-size: 14px; color: #666;">
              <span>Tax</span>
              <span>₹${order.pricing.tax.toFixed(2)}</span>
            </div>
            <div style="display: flex; justify-content: space-between; 
                        padding: 10px 0 0; font-size: 20px; font-weight: bold; 
                        color: #FF6B35; border-top: 2px solid #eee; margin-top: 6px;">
              <span>Total</span>
              <span>₹${order.pricing.total.toFixed(2)}</span>
            </div>
          </div>

          ${order.specialInstructions ? `
          <div style="background: #fff8e1; border-radius: 12px; 
                      padding: 15px; margin-bottom: 20px;">
            <p style="margin: 0; font-size: 14px; color: #666;">
              <strong>📝 Special Instructions:</strong> 
              ${order.specialInstructions}
            </p>
          </div>
          ` : ''}

          <div style="text-align: center; margin-top: 30px;">
            <a href="${process.env.FRONTEND_URL}/admin/orders" 
               style="display: inline-block; background: #FF6B35; color: white; 
                      padding: 14px 32px; border-radius: 8px; text-decoration: none; 
                      font-weight: 600; font-size: 16px;">
              View in Admin Panel →
            </a>
          </div>
        </div>
        <div style="background: #f9f9f9; padding: 20px; text-align: center; 
                    color: #999; font-size: 13px;">
          © ${new Date().getFullYear()} Athidhi Restaurant Admin
        </div>
      </div>
    `,
  }),
};

// ─── Main Send Function ───────────────────────────────────────────────────────
const sendEmail = async ({ to, subject, template, data, html }) => {
  try {
    let emailContent = { subject, html: html || '' };

    if (template && templates[template]) {
      const rendered = templates[template](data || {});
      emailContent = rendered;
    }

    // Use Brevo REST API instead of SMTP
    const info = await sendEmailViaAPI({
      to,
      subject: emailContent.subject,
      html: emailContent.html,
    });

    return info;
  } catch (error) {
    console.error("FULL EMAIL ERROR:", error);
    return null;
  }
};

module.exports = { sendEmail };


