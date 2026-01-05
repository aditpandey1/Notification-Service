const sgMail = require("@sendgrid/mail");
require("dotenv").config();
sgMail.setApiKey(process.env.SENDGRID_API_KEY);

const sendEmail = async (to, subject, text, notificationId) => {
  const [response] = await sgMail.send({
    to,
    from: process.env.SENDGRID_FROM_EMAIL,
    subject,
    text,
    headers: {
      "Idempotency-Key": notificationId,
    },
  });
  return response.headers["x-message-id"];
};

module.exports = { sendEmail };
