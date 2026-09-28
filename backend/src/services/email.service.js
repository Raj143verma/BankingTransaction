const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

// Verify the connection configuration
transporter.verify((error, success) => {
  if (error) {
    console.error('Error connecting to email server:', error);
  } else {
    console.log('Email server is ready to send messages');
  }
});

// Function to send email
const sendEmail = async (to, subject, text, html) => {
  try {
    const info = await transporter.sendMail({
      from: `"BankingSystem" <${process.env.EMAIL_USER}>`, // sender address
      to, // list of receivers
      subject, // Subject line
      text, // plain text body
      html, // html body
    });

    console.log('Message sent: %s', info.messageId);
    console.log('Preview URL: %s', nodemailer.getTestMessageUrl(info));
  } catch (error) {
    console.error('Error sending email:', error);
  }
};

async function sendRegisterEmail(userEmail, userName) {
  const subject = 'Welcome to BankingSystem!';
  const text = `Hello ${userName},\n\nThank you for registering at BankingSystem. We're excited to have you on board!
    \n\nIf you have any questions or need assistance, feel free to reach out to our support team.\n\nBest regards,\nThe BankingSystem Team`;
  const html = `<p>Hello ${userName},</p><p>Thank you for registering at BankingSystem. We're excited to have you on board!</p><p></p>The BankingSystem Team</p>`;

  await sendEmail(userEmail, subject, text, html);
}

async function sendTransactionEmail(userEmail, name, amount, toAccount) {
  const subject = 'Transaction Successful!';
  const text = `Hello ${name},\n\nYour transaction of $${amount} to account ${toAccount} has been completed successfully.\n\nBest regards,\nThe BankingSystem Team`;
  const html = `<p>Hello ${name},</p><p>Your transaction of $${amount} to account ${toAccount} has been completed successfully.</p><p></p>The BankingSystem Team</p>`;

  await sendEmail(userEmail, subject, text, html);
}


async function sendTransactionFailureEmail(userEmail, name, amount, toAccount) {
  const subject = 'Transaction Failed!';
  const text = `Hello ${name},\n\nWe regret to inform you that your transaction of $${amount} to account ${toAccount} has failed. Please check your account balance and try again.\n\nBest regards,\nThe BankingSystem Team`;
  const html = `<p>Hello ${name},</p><p>We regret to inform you that your transaction of $${amount} to account ${toAccount} has failed. Please check your account balance and try again.</p><p></p>The BankingSystem Team</p>`;

  await sendEmail(userEmail, subject, text, html);
}

module.exports = {
  sendRegisterEmail,
  sendTransactionEmail,
  sendTransactionFailureEmail
};
