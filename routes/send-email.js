import express from 'express';
import nodemailer from 'nodemailer';
import multer from 'multer';

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage() });

// Configure your email service (Gmail example)
const createTransporter = () => {
  return nodemailer.createTransporter({
    service: 'gmail',
    auth: {
      user: process.env.EMAIL_USER, // Your email
      pass: process.env.EMAIL_PASSWORD, // Your app password
    },
  });
};

router.post('/send-email', upload.single('file'), async (req, res) => {
  try {
    const { to, cc, bcc, subject, body } = req.body;
    const file = req.file;

    if (!to) {
      return res.status(400).json({ error: 'Recipient email is required' });
    }

    const transporter = createTransporter();

    const mailOptions = {
      from: process.env.EMAIL_USER,
      to: to,
      cc: cc || undefined,
      bcc: bcc || undefined,
      subject: subject || 'DSR Report',
      text: body || 'Please find attached the DSR Report.',
      attachments: file ? [
        {
          filename: file.originalname,
          content: file.buffer,
          contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
        }
      ] : []
    };

    const result = await transporter.sendMail(mailOptions);
    
    console.log('Email sent successfully:', result.messageId);
    res.json({ 
      success: true, 
      message: 'Email sent successfully',
      messageId: result.messageId 
    });

  } catch (error) {
    console.error('Error sending email:', error);
    res.status(500).json({ 
      error: 'Failed to send email',
      details: error.message 
    });
  }
});

export default router;