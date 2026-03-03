import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import { v4 as uuidv4 } from 'uuid'
import { supabaseAdmin } from '../config/database.js'

const signToken   = (u) => jwt.sign({ id:u.id, email:u.email, name:u.name }, process.env.JWT_SECRET, { expiresIn:'7d' })
const signRefresh = (id) => jwt.sign({ id }, process.env.JWT_SECRET+'_refresh', { expiresIn:'30d' })

const COLORS = ['#7c6af7','#ff7eb3','#3dffa0','#ff9d4d','#4dd9ff','#ff6b6b','#c9b1ff','#64ffda']
const AVATARS = ['🦊','🐯','🐼','🦁','🐸','🦋','🦄','🐧','🎯','🚀','⚡','🎨']
const SAFE = 'id, name, email, color, avatar, avatar_url, phone, bio, address, provider, created_at'

// ── Supabase OTP ─────────────────────────────────────────────────────────────
// Uses Supabase's built-in email OTP — no SMTP config needed
// Enable: Supabase Dashboard → Auth → Providers → Email → "Enable Email OTP"

export const signupRequest = async (req, res, next) => {
  try {
    const { email } = req.body
    if (!email) return res.status(400).json({ error: 'Email required' })

    // Check if email already registered in our users table
    const { data: ex } = await supabaseAdmin.from('users').select('id').eq('email', email.toLowerCase()).single()
    if (ex) return res.status(409).json({ error: 'Email already registered' })

    // Generate OTP and store in Supabase
    const otp = Math.floor(100000 + Math.random() * 900000).toString()
    const expires = new Date(Date.now() + 10 * 60 * 1000).toISOString()

    await supabaseAdmin.from('email_otps').upsert({
      email: email.toLowerCase(), otp, expires_at: expires, used: false
    }, { onConflict: 'email' })

    // Send OTP email via nodemailer (set SMTP_* env vars in Render/Vercel)
    const { sendOTPEmail } = await import('../utils/mailer.js')
    await sendOTPEmail(email.toLowerCase(), otp)

    return res.json({ message: 'Verification code sent to your email' })
  } catch (err) { next(err) }
}

export const signup = async (req, res, next) => {
  try {
    const { name, email, password, otp } = req.body
    if (!name?.trim() || !email || !password) return res.status(400).json({ error: 'Name, email and password required' })
    if (password.length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters' })

    // Verify OTP if provided
    if (otp) {
      const { data: otpRecord } = await supabaseAdmin
        .from('email_otps')
        .select('*')
        .eq('email', email.toLowerCase())
        .eq('used', false)
        .single()

      if (!otpRecord) return res.status(400).json({ error: 'No pending verification. Please request a new code.' })
      if (new Date() > new Date(otpRecord.expires_at)) {
        await supabaseAdmin.from('email_otps').delete().eq('email', email.toLowerCase())
        return res.status(400).json({ error: 'Code expired. Please request a new one.' })
      }
      if (otpRecord.otp !== otp.trim()) return res.status(400).json({ error: 'Invalid code. Please try again.' })

      // Mark OTP as used
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

    const token = signToken(newUser)
    const refreshToken = signRefresh(newUser.id)
    const safe = newUser
    return res.status(201).json({ token, refreshToken, user: safe })
  } catch (err) { next(err) }
}

export const login = async (req, res, next) => {
  try {
    const { email, password } = req.body
    const { data: user } = await supabaseAdmin.from('users').select('*').eq('email', email.toLowerCase()).single()
    if (!user) return res.status(401).json({ error: 'Invalid email or password' })
    if (user.provider !== 'email') return res.status(401).json({ error: `Please sign in with ${user.provider}` })
    const ok = await bcrypt.compare(password, user.password)
    if (!ok) return res.status(401).json({ error: 'Invalid email or password' })
    const token = signToken(user)
    const refreshToken = signRefresh(user.id)
    const safe = Object.fromEntries(SAFE.split(', ').map(k => [k, user[k]]))
    return res.json({ token, refreshToken, user: safe })
  } catch (err) { next(err) }
}

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

export const getMe = async (req, res, next) => {
  try {
    const { data: user } = await supabaseAdmin.from('users').select(SAFE).eq('id', req.user.id).single()
    if (!user) return res.status(404).json({ error: 'User not found' })
    return res.json({ user })
  } catch (err) { next(err) }
}

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