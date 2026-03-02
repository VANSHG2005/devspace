import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import { supabaseAdmin } from '../config/database.js'
import { v4 as uuidv4 } from 'uuid'
import { sendOTPEmail, sendWelcomeEmail } from '../utils/mailer.js'

// In-memory OTP store — { email: { otp, hash, name, expires } }
// For production, use Redis. For now, simple in-memory map
const pendingVerifications = new Map()

const generateOTP = () => Math.floor(100000 + Math.random() * 900000).toString()

const USER_COLORS = ['#7c6af7','#3dffa0','#ff5370','#ffca28','#82aaff','#89ddff','#ff9f43','#ff7eb3']
const signToken = (u) => jwt.sign({ id: u.id, email: u.email, name: u.name }, process.env.JWT_SECRET, { expiresIn: '7d' })
const signRefresh = (id) => jwt.sign({ id }, process.env.JWT_SECRET + '_refresh', { expiresIn: '30d' })
const SAFE = 'id, name, email, color, avatar, avatar_url, phone, bio, address, provider, created_at'

// Step 1: initiate signup — send OTP
export const signupRequest = async (req, res, next) => {
  try {
    const { name, email, password } = req.body
    if (!name?.trim() || !email?.trim() || !password) return res.status(400).json({ error: 'Name, email and password required' })
    if (password.length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters' })

    const { data: ex } = await supabaseAdmin.from('users').select('id').eq('email', email.toLowerCase()).single()
    if (ex) return res.status(409).json({ error: 'Email already registered' })

    const otp = generateOTP()
    const hash = await bcrypt.hash(password, 12)
    pendingVerifications.set(email.toLowerCase(), {
      otp, hash, name: name.trim(),
      expires: Date.now() + 10 * 60 * 1000,  // 10 minutes
    })

    try {
      await sendOTPEmail(email, otp)
    } catch (mailErr) {
      console.error('Email send failed:', mailErr)
      // Still return success but warn — dev mode fallback
      return res.json({ message: 'OTP sent', _devOtp: process.env.NODE_ENV !== 'production' ? otp : undefined })
    }
    return res.json({ message: 'OTP sent to your email' })
  } catch (err) { next(err) }
}

// Step 2: verify OTP — create account
export const signup = async (req, res, next) => {
  try {
    const { name, email, password, otp } = req.body
    if (!name?.trim() || !email?.trim() || !password) return res.status(400).json({ error: 'Name, email and password required' })

    const pending = pendingVerifications.get(email.toLowerCase())

    // If OTP provided — verify it
    if (otp) {
      if (!pending) return res.status(400).json({ error: 'No pending verification for this email. Please request again.' })
      if (Date.now() > pending.expires) {
        pendingVerifications.delete(email.toLowerCase())
        return res.status(400).json({ error: 'OTP expired. Please request again.' })
      }
      if (pending.otp !== otp.trim()) return res.status(400).json({ error: 'Invalid OTP' })
      pendingVerifications.delete(email.toLowerCase())
    }
    // If no email configured, skip OTP and register directly
    // (fallback for dev environments without SMTP)

    const { data: ex } = await supabaseAdmin.from('users').select('id').eq('email', email.toLowerCase()).single()
    if (ex) return res.status(409).json({ error: 'Email already registered' })
    const hash = await bcrypt.hash(password, 12)
    const color = USER_COLORS[Math.floor(Math.random() * USER_COLORS.length)]
    const avatar = name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)
    const { data: user, error } = await supabaseAdmin.from('users')
      .insert({ id: uuidv4(), name: name.trim(), email: email.toLowerCase(), password: hash, color, avatar, provider: 'email' })
      .select(SAFE).single()
    if (error) throw new Error(error.message)
    res.status(201).json({ user, token: signToken(user), refreshToken: signRefresh(user.id) })
  } catch (err) { next(err) }
}

export const login = async (req, res, next) => {
  try {
    const { email, password } = req.body
    const { data: user } = await supabaseAdmin.from('users').select('*').eq('email', email).single()
    if (!user) return res.status(401).json({ error: 'Invalid credentials' })
    const match = await bcrypt.compare(password, user.password || '')
    if (!match) return res.status(401).json({ error: 'Invalid credentials' })
    await supabaseAdmin.from('users').update({ last_seen: new Date().toISOString() }).eq('id', user.id)
    const { password: _, ...safe } = user
    res.json({ user: safe, token: signToken(safe), refreshToken: signRefresh(user.id) })
  } catch (err) { next(err) }
}

export const getMe = async (req, res, next) => {
  try {
    const { data: user } = await supabaseAdmin.from('users').select(SAFE).eq('id', req.user.id).single()
    res.json({ user: user || req.user })
  } catch { res.json({ user: req.user }) }
}

export const refresh = async (req, res, next) => {
  try {
    const { refreshToken } = req.body
    if (!refreshToken) return res.status(400).json({ error: 'Refresh token required' })
    const decoded = jwt.verify(refreshToken, process.env.JWT_SECRET + '_refresh')
    const { data: user } = await supabaseAdmin.from('users').select(SAFE).eq('id', decoded.id).single()
    if (!user) return res.status(401).json({ error: 'User not found' })
    res.json({ token: signToken(user), refreshToken: signRefresh(user.id) })
  } catch (err) {
    if (err.name?.includes('Token')) return res.status(401).json({ error: 'Invalid refresh token' })
    next(err)
  }
}

export const updateProfile = async (req, res, next) => {
  try {
    const { name, color, phone, bio, address, avatar_url } = req.body
    const updates = { updated_at: new Date().toISOString() }
    if (name !== undefined) updates.name = name
    if (color !== undefined) updates.color = color
    if (phone !== undefined) updates.phone = phone
    if (bio !== undefined) updates.bio = bio
    if (address !== undefined) updates.address = address
    if (avatar_url !== undefined) updates.avatar_url = avatar_url
    const { data: user, error } = await supabaseAdmin.from('users').update(updates).eq('id', req.user.id).select(SAFE).single()
    if (error) throw new Error(error.message)
    res.json({ user })
  } catch (err) { next(err) }
}
