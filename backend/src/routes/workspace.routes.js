import { Router } from 'express';
import { body } from 'express-validator';
import { authenticate } from '../middleware/auth.middleware.js';
import { validate } from '../middleware/validate.middleware.js';
import { apiLimiter } from '../middleware/rateLimit.middleware.js';
import {
  createWorkspace, getWorkspaces, getWorkspace,
  getWorkspaceFiles, createFile, getMembers, inviteMember,
  getAnalytics, deleteWorkspace, renameWorkspace, getWorkspaceInfo
} from '../controllers/workspace.controller.js';

const router = Router();
router.use(authenticate, apiLimiter);

router.get('/', getWorkspaces);
router.post('/', [body('name').trim().notEmpty().isLength({ min: 1, max: 200 })], validate, createWorkspace);
router.get('/:id', getWorkspace);
router.delete('/:id', deleteWorkspace);
router.patch('/:id/rename', [body('name').trim().notEmpty()], validate, renameWorkspace);
router.get('/:id/info', getWorkspaceInfo);
router.get('/:id/files', getWorkspaceFiles);
router.post('/:id/files', [body('name').trim().notEmpty()], validate, createFile);
router.get('/:id/members', getMembers);
router.post('/:id/invite', [body('email').isEmail().normalizeEmail()], validate, inviteMember);
router.get('/:id/analytics', getAnalytics);

export default router;
// routes: PATCH /:id/rename, GET /:id/info
