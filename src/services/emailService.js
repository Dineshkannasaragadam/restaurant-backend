const brevo = require('@getbrevo/brevo');

const apiInstance = new brevo.TransactionalEmailsApi();

apiInstance.setApiKey(
  brevo.TransactionalEmailsApiApiKeys.apiKey,
  process.env.BREVO_API_KEY
);

const sendEmail = async ({ to, subject, html }) => {
  try {

    const sendSmtpEmail = new brevo.SendSmtpEmail();

    sendSmtpEmail.subject = subject;

    sendSmtpEmail.htmlContent = html;

    sendSmtpEmail.sender = {
      name: 'Savori Restaurant',
      email: process.env.EMAIL_FROM,
    };

    sendSmtpEmail.to = [
      {
        email: to,
      },
    ];

    const result =
      await apiInstance.sendTransacEmail(sendSmtpEmail);

    console.log('EMAIL SENT:', result);

    return result;

  } catch (error) {

    console.error('BREVO API ERROR:', error);

    return null;
  }
};

module.exports = {
  sendEmail,
};
