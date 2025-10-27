const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const { authenticateToken } = require('../middleware/auth');

// public routes
// Send OTP to email
router.post('/send-otp', authController.sendOTP);

// Verify OTP and login
router.post('/verify-otp', authController.verifyOTP);

// Resend OTP
router.post('/resend-otp', authController.resendOTP);

// Check if email exists
router.post('/check-email', authController.checkEmail);

// protected routes

// Get current user profile
router.get('/profile', authenticateToken, authController.getProfile);

// Update user profile
router.put('/profile', authenticateToken, authController.updateProfile);

// Logout
router.post('/logout', authenticateToken, authController.logout);

// Get login history
router.get('/login-history', authenticateToken, authController.getLoginHistory);

// Change password (placeholder for future)
router.post('/change-password', authenticateToken, authController.changePassword);

module.exports = router;