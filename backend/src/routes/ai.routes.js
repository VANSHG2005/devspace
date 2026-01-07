import { Router } from 'express';
import { body } from 'express-validator';
import { authenticate } from '../middleware/auth.middleware.js';
import { validate } from '../middleware/validate.middleware.js';
import { codeLimiter } from '../middleware/rateLimit.middleware.js';
import { assistWithCode } from '../controllers/ai.controller.js';

const router = Router();
router.post('/assist', authenticate, codeLimiter,
  [body('prompt').notEmpty().withMessage('Prompt is required')],
  validate, assistWithCode
);
export default router;
