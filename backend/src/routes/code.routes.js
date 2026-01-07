import { Router } from 'express';
import { body } from 'express-validator';
import { authenticate } from '../middleware/auth.middleware.js';
import { codeLimiter } from '../middleware/rateLimit.middleware.js';
import { validate } from '../middleware/validate.middleware.js';
import { executeCode } from '../controllers/code.controller.js';

const router = Router();
router.post('/execute', authenticate, codeLimiter,
  [body('code').notEmpty(), body('language').optional().isIn(['javascript', 'python'])],
  validate, executeCode
);
export default router;
