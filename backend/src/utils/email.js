import nodemailer from 'nodemailer'

const getTransporter = () => {
  if (!process.env.SMTP_HOST) return null
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: parseInt(process.env.SMTP_PORT) || 587,
    secure: process.env.SMTP_PORT === '465',
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
  })
}

export const sendInviteEmail = async ({ to, workspaceName, workspaceId, inviterName }) => {
  const link = `${process.env.CLIENT_URL || 'http://localhost:5173'}/workspace/${workspaceId}`
  const transporter = getTransporter()
  if (!transporter) {
    console.log(`[Email] SMTP not configured. Invite link for ${to}: ${link}`)
    return { link, emailSent: false }
  }
  await transporter.sendMail({
    from: process.env.EMAIL_FROM || 'DevSpace <noreply@devspace.io>',
    to,
    subject: `${inviterName} invited you to "${workspaceName}" on DevSpace`,
    html: `<div style="font-family:sans-serif;max-width:520px;margin:0 auto;background:#0a0a0f;color:#e2e2f0;padding:40px;border-radius:12px;">
      <div style="display:flex;align-items:center;gap:10px;margin-bottom:28px;">
        <div style="width:36px;height:36px;border-radius:10px;background:linear-gradient(135deg,#7c6af7,#ff7eb3);display:flex;align-items:center;justify-content:center;font-size:16px;">⌨️</div>
        <span style="font-size:20px;font-weight:800;letter-spacing:-0.5px;">DevSpace</span>
      </div>
      <h2 style="color:#7c6af7;margin-bottom:12px;font-size:22px;">You've been invited! 🚀</h2>
      <p style="color:#6e6e8f;margin-bottom:8px;font-size:15px;line-height:1.6;">
        <strong style="color:#e2e2f0">${inviterName}</strong> has invited you to collaborate on 
        <strong style="color:#e2e2f0">"${workspaceName}"</strong>.
      </p>
      <p style="color:#6e6e8f;margin-bottom:28px;font-size:14px;">Click the button below to join and start coding together in real-time.</p>
      <a href="${link}" style="display:inline-block;padding:14px 32px;background:#7c6af7;color:#fff;text-decoration:none;border-radius:9px;font-weight:700;font-size:15px;letter-spacing:0.2px;">Join Workspace →</a>
      <p style="color:#3a3a55;margin-top:28px;font-size:12px;">Or paste this link: <span style="color:#7c6af7">${link}</span></p>
    </div>`,
  })
  return { link, emailSent: true }
}
