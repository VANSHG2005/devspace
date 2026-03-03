import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import { v4 as uuidv4 } from 'uuid'
import nodemailer from 'nodemailer'
import { supabaseAdmin } from '../config/database.js'

const signToken   = (u) => jwt.sign({ id:u.id, email:u.email, name:u.name }, process.env.JWT_SECRET, { expiresIn:'7d' })
const signRefresh = (id) => jwt.sign({ id }, process.env.JWT_SECRET+'_refresh', { expiresIn:'30d' })

const COLORS  = ['#7c6af7','#ff7eb3','#3dffa0','#ff9d4d','#4dd9ff','#ff6b6b','#c9b1ff','#64ffda']
const AVATARS = ['🦊','🐯','🐼','🦁','🐸','🦋','🦄','🐧','🎯','🚀','⚡','🎨']
const SAFE    = 'id, name, email, color, avatar, avatar_url, phone, bio, address, provider, created_at'

// ── Email sender ──────────────────────────────────────────────────────────────
// Reads SMTP_* from Render env vars — same Gmail credentials you set in Supabase
const sendOTP = async (to, otp) => {
  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST || 'smtp.gmail.com',
    port: parseInt(process.env.SMTP_PORT) || 587,
    secure: false,
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  })

  await transporter.sendMail({
    from: `"DevSpace" <${process.env.SMTP_USER}>`,
    to,
    subject: 'Your DevSpace verification code',
    html: `
      <div style="font-family:'Segoe UI',sans-serif;background:#0a0a0f;padding:40px;max-width:480px;margin:0 auto;border-radius:16px;border:1px solid #1e1e2e">
        <div style="display:flex;align-items:center;gap:10px;margin-bottom:28px">
          <div style="width:40px;height:40px;background:linear-gradient(135deg,#7c6af7,#ff7eb3);border-radius:10px;display:flex;align-items:center;justify-content:center;font-size:18px">⌨️</div>
          <span style="font-weight:800;font-size:20px;color:#e2e2f0">DevSpace</span>
        </div>
        <h2 style="color:#e2e2f0;margin:0 0 8px;font-size:22px">Verify your email</h2>
        <p style="color:#6e6e8f;font-size:14px;margin:0 0 28px">Enter this 6-digit code to complete your sign up:</p>
        <div style="background:#111118;border:1px solid #1e1e2e;border-radius:14px;padding:28px;text-align:center;margin-bottom:24px">
          <div style="font-size:44px;font-weight:900;letter-spacing:14px;color:#7c6af7;font-family:monospace">${otp}</div>
        </div>
        <p style="color:#6e6e8f;font-size:12px;margin:0">Expires in <strong style="color:#e2e2f0">10 minutes</strong>. If you didn't request this, ignore this email.</p>
      </div>
    `,
  })
}

// ── Step 1: Request OTP ───────────────────────────────────────────────────────
export const signupRequest = async (req, res, next) => {
  try {
    const { email } = req.body
    if (!email) return res.status(400).json({ error: 'Email required' })

    const { data: ex } = await supabaseAdmin.from('users').select('id').eq('email', email.toLowerCase()).single()
    if (ex) return res.status(409).json({ error: 'Email already registered' })

    const otp     = Math.floor(100000 + Math.random() * 900000).toString()
    const expires = new Date(Date.now() + 10 * 60 * 1000).toISOString()

    await supabaseAdmin.from('email_otps').upsert(
      { email: email.toLowerCase(), otp, expires_at: expires, used: false },
      { onConflict: 'email' }
    )

    await sendOTP(email.toLowerCase(), otp)

    return res.json({ message: 'Verification code sent to your email' })
  } catch (err) {
    console.error('[signup/request] error:', err.message)
    return res.status(500).json({ error: 'Failed to send verification email. Make sure SMTP_USER and SMTP_PASS are set in Render environment variables.' })
  }
}

// ── Step 2: Verify OTP + create account ──────────────────────────────────────
export const signup = async (req, res, next) => {
  try {
    const { name, email, password, otp } = req.body
    if (!name?.trim() || !email || !password) return res.status(400).json({ error: 'Name, email and password required' })
    if (password.length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters' })

    if (otp) {
      const { data: otpRecord } = await supabaseAdmin
        .from('email_otps').select('*')
        .eq('email', email.toLowerCase()).eq('used', false).single()

      if (!otpRecord) return res.status(400).json({ error: 'No pending verification. Please request a new code.' })
      if (new Date() > new Date(otpRecord.expires_at)) {
        await supabaseAdmin.from('email_otps').delete().eq('email', email.toLowerCase())
        return res.status(400).json({ error: 'Code expired. Please request a new one.' })
      }
      if (otpRecord.otp !== otp.trim()) return res.status(400).json({ error: 'Invalid code. Please try again.' })
      await supabaseAdmin.from('email_otps').update({ used: true }).eq('email', email.toLowerCase())
    }

    const { data: ex } = await supabaseAdmin.from('users').select('id').eq('email', email.toLowerCase()).single()
    if (ex) return res.status(409).json({ error: 'Email already registered' })

    const hash   = await bcrypt.hash(password, 12)
    const color  = COLORS[Math.floor(Math.random() * COLORS.length)]
    const avatar = AVATARS[Math.floor(Math.random() * AVATARS.length)]

    const { data: newUser, error } = await supabaseAdmin.from('users')
      .insert({ id: uuidv4(), name: name.trim(), email: email.toLowerCase(), password: hash, color, avatar, provider: 'email' })
      .select(SAFE).single()

    if (error) throw error

    return res.status(201).json({ token: signToken(newUser), refreshToken: signRefresh(newUser.id), user: newUser })
  } catch (err) { next(err) }
}

// ── Login ─────────────────────────────────────────────────────────────────────
export const login = async (req, res, next) => {
  try {
    const { email, password } = req.body
    const { data: user } = await supabaseAdmin.from('users').select('*').eq('email', email.toLowerCase()).single()
    if (!user) return res.status(401).json({ error: 'Invalid email or password' })
    if (user.provider !== 'email') return res.status(401).json({ error: `Please sign in with ${user.provider}` })
    const ok = await bcrypt.compare(password, user.password)
    if (!ok) return res.status(401).json({ error: 'Invalid email or password' })
    const safe = Object.fromEntries(SAFE.split(', ').map(k => [k, user[k]]))
    return res.json({ token: signToken(user), refreshToken: signRefresh(user.id), user: safe })
  } catch (err) { next(err) }
}

// ── Refresh token ─────────────────────────────────────────────────────────────
export const refresh = async (req, res, next) => {
  try {
    const { refreshToken } = req.body
    if (!refreshToken) return res.status(401).json({ error: 'No refresh token' })
    const decoded = jwt.verify(refreshToken, process.env.JWT_SECRET + '_refresh')
    const { data: user } = await supabaseAdmin.from('users').select(SAFE).eq('id', decoded.id).single()
    if (!user) return res.status(401).json({ error: 'User not found' })
    return res.json({ token: signToken(user), user })
  } catch (err) { next(err) }
}

// ── Get current user ──────────────────────────────────────────────────────────
export const getMe = async (req, res, next) => {
  try {
    const { data: user } = await supabaseAdmin.from('users').select(SAFE).eq('id', req.user.id).single()
    if (!user) return res.status(404).json({ error: 'User not found' })
    return res.json({ user })
  } catch (err) { next(err) }
}

// ── Update profile ────────────────────────────────────────────────────────────
export const updateProfile = async (req, res, next) => {
  try {
    const allowed = ['name','bio','phone','address','avatar_url','color']
    const updates = Object.fromEntries(Object.entries(req.body).filter(([k]) => allowed.includes(k)))
    if (!Object.keys(updates).length) return res.status(400).json({ error: 'No valid fields' })
    const { data: user, error } = await supabaseAdmin.from('users').update(updates).eq('id', req.user.id).select(SAFE).single()
    if (error) throw error
    return res.json({ user })
  } catch (err) { next(err) }
}