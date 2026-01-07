import 'dotenv/config';
import { createServer } from 'http';
import express from 'express';
import { Server } from 'socket.io';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import rateLimit from 'express-rate-limit';

import { connectDB } from './config/database.js';
import { connectRedis, pubClient, subClient } from './config/redis.js';
import { createAdapter } from '@socket.io/redis-adapter';
import { initSocketHandlers } from './sockets/index.js';
import logger from './config/logger.js';

// Route imports
import authRoutes from './routes/auth.routes.js';
import workspaceRoutes from './routes/workspace.routes.js';
import fileRoutes from './routes/file.routes.js';
import executeRoutes from './routes/execute.routes.js';
import userRoutes from './routes/user.routes.js';

const app = express();
const httpServer = createServer(app);

// ─── Middleware ────────────────────────────────────────────────────────────────

app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors({
  origin: process.env.CLIENT_URL || 'http://localhost:3000',
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
}));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(morgan('dev', { stream: { write: (msg) => logger.http(msg.trim()) } }));

// Global rate limiter
app.use(rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000,
  max: parseInt(process.env.RATE_LIMIT_MAX) || 100,
  message: { error: 'Too many requests, please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
}));

// ─── Routes ───────────────────────────────────────────────────────────────────

app.use('/api/auth', authRoutes);
app.use('/api/workspaces', workspaceRoutes);
app.use('/api/workspaces', fileRoutes);
app.use('/api/execute', executeRoutes);
app.use('/api/users', userRoutes);

// Health check
app.get('/health', (req, res) => res.json({ status: 'ok', timestamp: new Date().toISOString(), uptime: process.uptime() }));

// 404 handler
app.use((req, res) => res.status(404).json({ error: `Route ${req.method} ${req.path} not found` }));

// Global error handler
app.use((err, req, res, next) => {
  logger.error(`${err.status || 500} — ${err.message}`);
  res.status(err.status || 500).json({
    error: process.env.NODE_ENV === 'production' ? 'Internal server error' : err.message,
    ...(process.env.NODE_ENV !== 'production' && { stack: err.stack }),
  });
});

// ─── Socket.io ────────────────────────────────────────────────────────────────

const io = new Server(httpServer, {
  cors: {
    origin: process.env.CLIENT_URL || 'http://localhost:3000',
    credentials: true,
  },
  transports: ['websocket', 'polling'],
  pingInterval: 10000,
  pingTimeout: 5000,
});

// ─── Bootstrap ────────────────────────────────────────────────────────────────

const bootstrap = async () => {
  try {
    // Connect to PostgreSQL
    await connectDB();
    logger.info('✅ PostgreSQL connected');

    // Connect to Redis
    await connectRedis();
    logger.info('✅ Redis connected');

    // Attach Redis adapter for horizontal Socket.io scaling
    io.adapter(createAdapter(pubClient, subClient));
    logger.info('✅ Socket.io Redis adapter attached');

    // Initialize all socket event handlers
    initSocketHandlers(io);
    logger.info('✅ Socket handlers initialized');

    const PORT = process.env.PORT || 3001;
    httpServer.listen(PORT, () => {
      logger.info(`🚀 Server running on port ${PORT} [${process.env.NODE_ENV || 'development'}]`);
    });
  } catch (err) {
    logger.error('❌ Failed to start server:', err);
    process.exit(1);
  }
};

// Graceful shutdown
const shutdown = async (signal) => {
  logger.info(`${signal} received. Shutting down gracefully...`);
  httpServer.close(() => {
    logger.info('HTTP server closed');
    process.exit(0);
  });
};

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('unhandledRejection', (reason) => logger.error('Unhandled rejection:', reason));

bootstrap();

export { io };
