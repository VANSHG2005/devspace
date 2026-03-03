import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import { v4 as uuidv4 } from 'uuid'
import { supabaseAdmin, supabase } from '../config/database.js'

const signToken   = (u) => jwt.sign({ id:u.id, email:u.email, name:u.name }, process.env.JWT_SECRET, { expiresIn:'7d' })
const signRefresh = (id) => jwt.sign({ id }, process.env.JWT_SECRET+'_refresh', { expiresIn:'30d' })

const COLORS  = ['#7c6af7','#ff7eb3','#3dffa0','#ff9d4d','#4dd9ff','#ff6b6b','#c9b1ff','#64ffda']
const AVATARS = ['🦊','🐯','🐼','🦁','🐸','🦋','🦄','🐧','🎯','🚀','⚡','🎨']
const SAFE    = 'id, name, email, color, avatar, avatar_url, phone, bio, address, provider, created_at'

// ── Step 1: Send OTP via Supabase email ───────────────────────────────────────
// Supabase sends the email using SMTP configured in Supabase Dashboard → Auth → SMTP
export const signupRequest = async (req, res, next) => {
  try {
    const { email } = req.body
    if (!email) return res.status(400).json({ error: 'Email required' })

    // Check already registered
    const { data: ex } = await supabaseAdmin.from('users').select('id').eq('email', email.toLowerCase()).single()
    if (ex) return res.status(409).json({ error: 'Email already registered' })

    // Use Supabase signInWithOtp — sends a 6-digit code via Supabase's configured SMTP
    // This uses the "Magic Link" / OTP email template from Supabase Dashboard → Auth → Email Templates
    const { error } = await supabase.auth.signInWithOtp({
      email: email.toLowerCase(),
      options: {
        shouldCreateUser: true,   // creates a temp Supabase auth user to send the OTP
        data: { signup_flow: true }
      }
    })

    if (error) {
      console.error('[signup/request] Supabase OTP error:', error.message)
      return res.status(500).json({ error: 'Failed to send verification email: ' + error.message })
    }

    return res.json({ message: 'Verification code sent to your email' })
  } catch (err) { next(err) }
}

// ── Step 2: Verify OTP via Supabase + create our user ────────────────────────
export const signup = async (req, res, next) => {
  try {
    const { name, email, password, otp } = req.body
    if (!name?.trim() || !email || !password) return res.status(400).json({ error: 'Name, email and password required' })
    if (password.length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters' })

    if (otp) {
      // Verify OTP with Supabase
      const { data, error } = await supabase.auth.verifyOtp({
        email: email.toLowerCase(),
        token: otp.trim(),
        type: 'email',
      })

      if (error) {
        console.error('[signup] Supabase verifyOtp error:', error.message)
        return res.status(400).json({ error: 'Invalid or expired code. Please try again.' })
      }
    }

    // Check already registered in our users table
    const { data: ex } = await supabaseAdmin.from('users').select('id').eq('email', email.toLowerCase()).single()
    if (ex) return res.status(409).json({ error: 'Email already registered' })

    const hash   = await bcrypt.hash(password, 12)
    const color  = COLORS[Math.floor(Math.random() * COLORS.length)]
    const avatar = AVATARS[Math.floor(Math.random() * AVATARS.length)]

    const { data: newUser, error: insertError } = await supabaseAdmin.from('users')
      .insert({ id: uuidv4(), name: name.trim(), email: email.toLowerCase(), password: hash, color, avatar, provider: 'email' })
      .select(SAFE).single()

    if (insertError) throw insertError

    return res.status(201).json({ token: signToken(newUser), refreshToken: signRefresh(newUser.id), user: newUser })
  } catch (err) { next(err) }
}

// ── Login ─────────────────────────────────────────────────────────────────────
export const login = async (req, res, next) => {
  try {
    const { email, password } = req.body
    const { data: user } = await supabaseAdmin.from('users').select('*').eq('email', email.toLowerCase()).single()
    if (!user) return res.status(401).json({ error: 'No account found with this email. Please sign up first.' })
    if (user.provider !== 'email') return res.status(401).json({ error: `This account uses ${user.provider} sign-in. Please use that instead.` })
    const ok = await bcrypt.compare(password, user.password)
    if (!ok) return res.status(401).json({ error: 'Incorrect password. Please try again.' })
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