import { body, param, validationResult } from 'express-validator';

/**
 * handleValidation — express middleware to return 400 if validation errors exist
 */
export const handleValidation = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      error: 'Validation failed',
      details: errors.array().map(e => ({ field: e.path, message: e.msg })),
    });
  }
  next();
};

// Auth validators
export const registerValidation = [
  body('name').trim().notEmpty().withMessage('Name is required').isLength({ max: 100 }).withMessage('Name too long'),
  body('email').isEmail().normalizeEmail().withMessage('Valid email required'),
  body('password').isLength({ min: 8 }).withMessage('Password must be at least 8 characters'),
  handleValidation,
];

export const loginValidation = [
  body('email').isEmail().normalizeEmail().withMessage('Valid email required'),
  body('password').notEmpty().withMessage('Password is required'),
  handleValidation,
];

// Workspace validators
export const workspaceValidation = [
  body('name').trim().notEmpty().withMessage('Workspace name is required').isLength({ max: 200 }).withMessage('Name too long'),
  handleValidation,
];

// File validators
export const fileValidation = [
  body('name').trim().notEmpty().withMessage('File name is required').isLength({ max: 255 }).withMessage('Name too long'),
  handleValidation,
];

// Message validators
export const messageValidation = [
  body('message').trim().notEmpty().withMessage('Message cannot be empty').isLength({ max: 5000 }).withMessage('Message too long'),
  handleValidation,
];

// ID param validator
export const validateId = (paramName = 'id') => [
  param(paramName).notEmpty().withMessage(`${paramName} is required`),
  handleValidation,
];
