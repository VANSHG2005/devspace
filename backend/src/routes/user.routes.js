// user.routes.js
import { Router } from 'express';
import { authenticate } from '../middleware/auth.middleware.js';
import { db } from '../config/database.js';

const router = Router();

router.use(authenticate);

// Search users (for invite suggestions)
router.get('/search', async (req, res, next) => {
  try {
    const { q } = req.query;
    if (!q || q.length < 2) return res.json({ users: [] });
    const { rows } = await db.query(
      `SELECT id, name, email, color FROM users
       WHERE (name ILIKE $1 OR email ILIKE $1) AND id != $2
       LIMIT 10`,
      [`%${q}%`, req.user.id]
    );
    res.json({ users: rows });
  } catch (err) {
    next(err);
  }
});

// Get user by ID
router.get('/:id', async (req, res, next) => {
  try {
    const { rows } = await db.query(
      'SELECT id, name, email, color, avatar_url, created_at FROM users WHERE id = $1',
      [req.params.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'User not found' });
    res.json({ user: rows[0] });
  } catch (err) {
    next(err);
  }
});

export default router;
