import { Router } from 'express'
import { body } from 'express-validator'
import { authenticate } from '../middleware/auth.middleware.js'
import { codeLimiter } from '../middleware/rateLimit.middleware.js'
import { validate } from '../middleware/validate.middleware.js'
import { executeCode } from '../controllers/code.controller.js'

const SUPPORTED = [
  'javascript', 'js',
  'typescript', 'ts',
  'python', 'py',
  'c', 'cpp', 'c++',
  'java',
  'go',
  'rust', 'rs',
  'nodejs', 'node',
  'express',
  'flask',
  'django',
  'html',
  'react', 'react-ts',
  'nextjs', 'vue', 'svelte', 'tailwind',
]

const router = Router()
router.post('/execute', authenticate, codeLimiter,
  [
    body('code').notEmpty().withMessage('Code is required'),
    body('language').optional().isIn(SUPPORTED).withMessage(`Unsupported language`),
  ],
  validate, executeCode
)
export default router
