require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const db = require('./config/database');

const app = express();

// middleware
app.use(
  helmet({
    crossOriginResourcePolicy: false, // prevents interference with CORS
  })
);

// CORS configuration - allow origins via env or fallback
const allowedOrigins = (
  process.env.CORS_ORIGINS || 'http://localhost:3000,https://sclinedc.co.in'
)
  .split(',')
  .map((s) => s.trim());

const corsOptions = {
  origin: function (origin, callback) {
    // allow requests with no origin (mobile apps, curl)
    if (!origin) return callback(null, true);
    if (allowedOrigins.indexOf(origin) !== -1) {
      return callback(null, true);
    } else {
      return callback(new Error('CORS policy: origin not allowed'), false);
    }
  },
  credentials: true,
  optionsSuccessStatus: 200,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
};
app.use(cors(corsOptions));

app.use(express.json()); // Parse JSON bodies
app.use(express.urlencoded({ extended: true })); // Parse URL-encoded bodies
app.use(morgan('dev')); // Logging

// import routes - ensure filenames match your repo
const authRoutes = require('./routes/authRoutes');
const userRoutes = require('./routes/userManagement');
const roleRoutes = require('./routes/roleManagement');
const studyRoutes = require('./routes/studyManagement');
const siteRoutes = require('./routes/siteManagement');
const surveyRoutes = require('./routes/StudyRoutes');
const auditRouter = require('./routes/audit.route'); // ensure file is named audit.routes.js

// attach db to request if you prefer that pattern (optional)
app.use((req, res, next) => {
  req.db = db;
  next();
});

// Health check
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'OK', message: 'Success health check' });
});

// Register routes
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/roles', roleRoutes);
app.use('/api/studies', studyRoutes);
app.use('/api/sites', siteRoutes);
app.use('/api/survey', surveyRoutes);
app.use('/api/audit', auditRouter);

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: 'Route not found',
  });
});

// Global error handler
app.use((err, req, res, next) => {
  console.error('Global error:', err);
  const status = err.status || 500;
  res.status(status).json({
    success: false,
    message: err.message || 'Internal server error',
    error: process.env.NODE_ENV === 'development' ? err : {},
  });
});

const PORT = parseInt(process.env.PORT, 10) || 5000;
const server = app.listen(PORT, () => {
  console.log(`\n${'='.repeat(50)}`);
  console.log(`  Server is running on port ${PORT}`);
  console.log(`Health check: http://localhost:${PORT}/health`);
  console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(
    `Email configured: ${process.env.EMAIL_FROM || 'Not configured'}`
  );
  console.log(`  Database: ${process.env.DB_NAME || 'Not configured'}`);
  console.log(` JWT Expiry: ${process.env.JWT_EXPIRES_IN || '24h'}`);
  console.log(`  OTP Expiry: ${process.env.OTP_EXPIRY_MINUTES || 10} minutes`);
  console.log(`${'='.repeat(50)}\n`);
});

// Graceful shutdown helper
const shutdown = async (reason, code = 0) => {
  console.error('Shutting down due to:', reason);
  try {
    // close server (stop accepting new connections)
    server.close(() => {
      console.log('HTTP server closed.');
    });
    // close DB pool if available
    if (db && typeof db.close === 'function') {
      await db.close();
      console.log('Database pool closed.');
    } else if (db && db.pool && typeof db.pool.end === 'function') {
      await db.pool.end();
      console.log('Database pool ended.');
    }
  } catch (err) {
    console.error('Error during shutdown:', err);
  } finally {
    process.exit(code);
  }
};

// Handle unhandled promise rejections
process.on('unhandledRejection', (err) => {
  console.error('  Unhandled Promise Rejection:', err);
  shutdown(err || 'unhandledRejection', 1);
});

// Handle uncaught exceptions
process.on('uncaughtException', (err) => {
  console.error('  Uncaught Exception:', err);
  shutdown(err || 'uncaughtException', 1);
});

module.exports = app;
