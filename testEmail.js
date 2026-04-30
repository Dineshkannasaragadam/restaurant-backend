require('dotenv').config();
const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
  host: process.env.EMAIL_HOST,
  port: parseInt(process.env.EMAIL_PORT),
  secure: false,
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

async function test() {
  try {
    await transporter.verify();
    console.log('✅ Email connection successful!');

    await transporter.sendMail({
      from: process.env.EMAIL_FROM,
      to: process.env.EMAIL_USER,
      subject: 'Test Email ✅',
      html: '<h1>Email is working!</h1><p>Your restaurant app can send emails.</p>',
    });

    console.log('✅ Test email sent! Check your inbox.');
  } catch (error) {
    console.log('❌ Email failed:', error.message);
  }
}

test();