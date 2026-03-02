import { Router } from 'express'
import { body } from 'express-validator'
import { signup, signupRequest, login, getMe, refresh, updateProfile } from '../controllers/auth.controller.js'
import { authenticate } from '../middleware/auth.middleware.js'
import { validate } from '../middleware/validate.middleware.js'
import { authLimiter } from '../middleware/rateLimit.middleware.js'

const router = Router()

router.post('/signup/request', authLimiter,
  [body('name').trim().notEmpty(), body('email').isEmail().normalizeEmail(), body('password').isLength({min:6})],
  validate, signupRequest)

router.post('/signup', authLimiter,
  [body('name').trim().notEmpty().isLength({min:2,max:100}), body('email').isEmail().normalizeEmail(), body('password').isLength({min:6})],
  validate, signup)

router.post('/login', authLimiter,
  [body('email').isEmail().normalizeEmail(), body('password').notEmpty()],
  validate, login)

router.post('/refresh', refresh)
router.get('/me', authenticate, getMe)
router.patch('/profile', authenticate, updateProfile)
router.put('/profile', authenticate, updateProfile)  // alias

export default router
