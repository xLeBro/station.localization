const nodemailer = require('nodemailer');

const transport = process.env.SMTP_HOST
  ? nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT || 587),
      secure: Number(process.env.SMTP_PORT) === 465,
      auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } : undefined,
    })
  : null;

const FROM = process.env.MAIL_FROM || process.env.SMTP_USER || 'no-reply@localhost';

async function send({ to, subject, text, replyTo }) {
  if (!transport) {
    console.log(`[mail disabled] To: ${to}\nSubject: ${subject}\n\n${text}\n`);
    return;
  }
  try {
    await transport.sendMail({ from: FROM, to, subject, text, replyTo });
  } catch (err) {
    console.error(`Failed to send mail to ${to}:`, err.message);
  }
}

module.exports = { send };
