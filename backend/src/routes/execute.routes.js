// execute.routes.js
import { Router } from 'express';
import { executeCode } from '../controllers/execute.controller.js';
import { authenticate } from '../middleware/auth.middleware.js';
import rateLimit from 'express-rate-limit';

const executeLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 20,
  message: { error: 'Too many execution requests' },
});

const router = Router();
router.post('/', authenticate, executeLimiter, executeCode);
export default router;
