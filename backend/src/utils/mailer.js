import nodemailer from 'nodemailer'

// Uses Gmail or any SMTP — set env vars
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || 'smtp.gmail.com',
  port: parseInt(process.env.SMTP_PORT) || 587,
  secure: false,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,  // Gmail: use App Password (not account password)
  },
})

export const sendOTPEmail = async (to, otp) => {
  await transporter.sendMail({
    from: `"DevSpace" <${process.env.SMTP_USER}>`,
    to,
    subject: 'Your DevSpace verification code',
    html: `
      <div style="font-family:'Segoe UI',sans-serif;background:#0a0a0f;padding:40px;max-width:480px;margin:0 auto;border-radius:16px;border:1px solid #1e1e2e">
        <div style="display:flex;align-items:center;gap:10px;margin-bottom:32px">
          <div style="width:36px;height:36px;background:linear-gradient(135deg,#7c6af7,#ff7eb3);border-radius:8px;display:flex;align-items:center;justify-content:center;font-size:16px">⌨️</div>
          <span style="font-weight:800;font-size:18px;color:#e2e2f0">DevSpace</span>
        </div>
        <h2 style="color:#e2e2f0;margin:0 0 8px">Verify your email</h2>
        <p style="color:#6e6e8f;font-size:14px;margin:0 0 28px">Enter this code to complete your sign up:</p>
        <div style="background:#111118;border:1px solid #1e1e2e;border-radius:12px;padding:24px;text-align:center;margin-bottom:24px">
          <div style="font-size:40px;font-weight:800;letter-spacing:12px;color:#7c6af7;font-family:monospace">${otp}</div>
        </div>
        <p style="color:#6e6e8f;font-size:12px;margin:0">This code expires in <strong style="color:#e2e2f0">10 minutes</strong>. If you didn't request this, ignore this email.</p>
      </div>
    `,
  })
}

export const sendWelcomeEmail = async (to, name) => {
  await transporter.sendMail({
    from: `"DevSpace" <${process.env.SMTP_USER}>`,
    to,
    subject: `Welcome to DevSpace, ${name}!`,
    html: `
      <div style="font-family:'Segoe UI',sans-serif;background:#0a0a0f;padding:40px;max-width:480px;margin:0 auto;border-radius:16px;border:1px solid #1e1e2e">
        <h2 style="color:#e2e2f0">Welcome, ${name}! 🎉</h2>
        <p style="color:#6e6e8f;font-size:14px">Your DevSpace account is verified and ready. Start collaborating in real-time!</p>
        <a href="${process.env.CLIENT_URL}/dashboard" style="display:inline-block;margin-top:16px;padding:12px 24px;background:#7c6af7;color:#fff;border-radius:8px;text-decoration:none;font-weight:600">Open DevSpace →</a>
      </div>
    `,
  })
}
