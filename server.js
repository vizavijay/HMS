
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const db = require('./config/database');

const app = express();

//middleware
app.use(helmet({
  crossOriginResourcePolicy: false // prevents interference with CORS
}));

// CORS configuration
const corsOptions = {
     origin: ['http://localhost:3000', 'https://sclinedc.co.in', 'https://glenmark.nis-2025-27.sclinedc.co.in/'],
    credentials: true,
    optionsSuccessStatus: 200,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization']
};
app.use(cors(corsOptions));

app.use(express.json()); // Parse JSON bodies
app.use(express.urlencoded({ extended: true })); // Parse URL-encoded bodies
app.use(morgan('dev')); // Logging

//import routes
const authRoutes = require('./routes/authRoutes');
const userRoutes = require('./routes/userManagement');
const roleRoutes = require('./routes/roleManagement');
const studyRoutes = require('./routes/studyManagement');
const siteRoutes = require('./routes/siteManagement');
const surveyRoutes = require('./routes/StudyRoutes');

// register routes

app.use((req, res, next) => {
    req.db = db;
    next();
});

// Health check
app.get('/health', (req, res) => {
    res.json({
        success: true,
        message: 'Server is running',
        timestamp: new Date()
    });
});

// Authentication routes
app.use('/api/auth', authRoutes);

// User management routes
app.use('/api/users', userRoutes);

// Role management routes
app.use('/api/roles', roleRoutes);
// Study management routes
app.use('/api/studies', studyRoutes);

// Site management routes
app.use('/api/sites', siteRoutes);

// study routes
app.use('/api/survey', surveyRoutes);



// 404 handler
app.use((req, res) => {
    res.status(404).json({
        success: false,
        message: 'Route not found'
    });
});

// Global error handler
app.use((err, req, res, next) => {
    console.error('Global error:', err);

    res.status(err.status || 500).json({
        success: false,
        message: err.message || 'Internal server error',
        error: process.env.NODE_ENV === 'development' ? err : {}
    });
});


const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
    console.log(`\n${'='.repeat(50)}`);
    console.log(`  Server is running on port ${PORT}`);
    console.log(`Health check: http://localhost:${PORT}/health`);
    console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
    console.log(`Email configured: ${process.env.EMAIL_USER || 'Not configured'}`);
    console.log(`  Database: ${process.env.DB_NAME || 'Not configured'}`);
    console.log(` JWT Expiry: ${process.env.JWT_EXPIRES_IN || '24h'}`);
    console.log(`  OTP Expiry: ${process.env.OTP_EXPIRY_MINUTES || 10} minutes`);
    console.log(`${'='.repeat(50)}\n`);
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (err) => {
    console.error('  Unhandled Promise Rejection:', err);
    // Close server & exit process
    process.exit(1);
});

// Handle uncaught exceptions
process.on('uncaughtException', (err) => {
    console.error('  Uncaught Exception:', err);
    process.exit(1);
});


module.exports = app;

