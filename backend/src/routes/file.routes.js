import { Router } from 'express';
import { authenticate } from '../middleware/auth.middleware.js';
import { apiLimiter } from '../middleware/rateLimit.middleware.js';
import { getFile, updateFile, deleteFile, getVersions, saveVersion } from '../controllers/file.controller.js';

const router = Router();
router.use(authenticate, apiLimiter);

router.get('/:id', getFile);
router.put('/:id', updateFile);
router.delete('/:id', deleteFile);
router.get('/:id/versions', getVersions);
router.post('/:id/versions', saveVersion);

export default router;
// rename already handled by PUT /:id with { name } body - no change needed
