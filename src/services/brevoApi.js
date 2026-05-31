/**
 * Brevo REST API Service
 * Uses v3 API instead of SMTP (works on Render, Vercel, etc.)
 */

const SibApiV3Sdk = require('sib-api-v3-sdk');
const logger = require('../utils/logger');

// Initialize Brevo API client
const initBrevoClient = () => {
  const defaultClient = SibApiV3Sdk.ApiClient.instance;
  const apiKey = defaultClient.authentications['api-key'];
  apiKey.apiKey = process.env.BREVO_API_KEY;
  return new SibApiV3Sdk.TransactionalEmailsApi();
};

// Send email using Brevo REST API
const sendEmailViaAPI = async ({ to, subject, html }) => {
  try {
    console.log('====== BREVO API EMAIL ======');
    console.log('To:', to);
    console.log('Subject:', subject);
    console.log('Brevo API Key:', process.env.BREVO_API_KEY ? '***[SET]***' : '***[NOT SET]***');
    console.log('Email From:', process.env.EMAIL_FROM);
    console.log('==============================');

    const apiInstance = initBrevoClient();
    
    const sender = {
      email: process.env.EMAIL_FROM || 'saragadamdinesh1973@gmail.com',
      name: 'Athidhi Restaurant'
    };

    const receivers = [{ email: to }];

    const response = await apiInstance.sendTransacEmail({
      sender,
      to: receivers,
      subject,
      htmlContent: html
    });

    logger.info(`Email sent to ${to} via Brevo API: ${response.messageId}`);
    console.log('✅ Email sent successfully via Brevo API');
    return response;
  } catch (error) {
    console.error('❌ Brevo API Error:', error.message || error);
    logger.error(`Email API error: ${error.message}`);
    throw error;
  }
};

module.exports = { sendEmailViaAPI };
