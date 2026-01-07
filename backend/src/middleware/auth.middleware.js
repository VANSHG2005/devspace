import jwt from 'jsonwebtoken';
import { supabaseAdmin } from '../config/database.js';

/**
 * Authenticate JWT — attaches req.user from Supabase users table
 */
export const authenticate = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer '))
      return res.status(401).json({ error: 'No authentication token provided' });

    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    const { data: user, error } = await supabaseAdmin
      .from('users')
      .select('id, name, email, color, avatar')
      .eq('id', decoded.id)
      .single();

    if (error || !user) return res.status(401).json({ error: 'User not found' });
    req.user = user;
    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError')
      return res.status(401).json({ error: 'Token expired', code: 'TOKEN_EXPIRED' });
    if (err.name === 'JsonWebTokenError')
      return res.status(401).json({ error: 'Invalid token' });
    next(err);
  }
};

/**
 * Check workspace role (owner / editor / viewer)
 */
export const requireWorkspaceAccess = (minRole = 'viewer') => async (req, res, next) => {
  const roles = ['viewer', 'editor', 'owner'];
  const workspaceId = req.params.id || req.params.workspaceId || req.body.workspaceId;
  try {
    const { data, error } = await supabaseAdmin
      .from('workspace_members')
      .select('role')
      .eq('workspace_id', workspaceId)
      .eq('user_id', req.user.id)
      .single();

    if (error || !data)
      return res.status(403).json({ error: 'You are not a member of this workspace' });

    if (roles.indexOf(data.role) < roles.indexOf(minRole))
      return res.status(403).json({ error: `Requires ${minRole} role or higher` });

    req.userRole = data.role;
    next();
  } catch (err) { next(err); }
};
