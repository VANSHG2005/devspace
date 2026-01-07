import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import { supabaseAdmin } from '../config/database.js'
import { v4 as uuidv4 } from 'uuid'

const USER_COLORS = ['#7c6af7','#3dffa0','#ff5370','#ffca28','#82aaff','#89ddff','#ff9f43','#ff7eb3']
const signToken = (u) => jwt.sign({ id: u.id, email: u.email, name: u.name }, process.env.JWT_SECRET, { expiresIn: '7d' })
const signRefresh = (id) => jwt.sign({ id }, process.env.JWT_SECRET + '_refresh', { expiresIn: '30d' })
const SAFE = 'id, name, email, color, avatar, avatar_url, phone, bio, address, provider, created_at'

export const signup = async (req, res, next) => {
  try {
    const { name, email, password } = req.body
    const { data: ex } = await supabaseAdmin.from('users').select('id').eq('email', email).single()
    if (ex) return res.status(409).json({ error: 'Email already registered' })
    const hash = await bcrypt.hash(password, 12)
    const color = USER_COLORS[Math.floor(Math.random() * USER_COLORS.length)]
    const avatar = name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)
    const { data: user, error } = await supabaseAdmin.from('users')
      .insert({ id: uuidv4(), name, email, password: hash, color, avatar, provider: 'email' })
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
