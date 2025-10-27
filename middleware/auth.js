const jwt = require('jsonwebtoken');

// jwt authentication middleware
const authenticateToken = (req, res, next) => {
    try {
        // Get token from header
        const authHeader = req.headers['authorization'];
        const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

        if (!token) {
            return res.status(401).json({
                success: false,
                message: 'Access token is required'
            });
        }

        // Verify token
        jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
            if (err) {
                if (err.name === 'TokenExpiredError') {
                    return res.status(401).json({
                        success: false,
                        message: 'Token has expired. Please login again.'
                    });
                }

                return res.status(403).json({
                    success: false,
                    message: 'Invalid token'
                });
            }

            // Attach user info to request
            req.user = user;
            next();
        });

    } catch (error) {
        console.error('Authentication error:', error);
        return res.status(500).json({
            success: false,
            message: 'Authentication failed',
            error: error.message
        });
    }
};

// role based authorisation middleware
const authorizeRoles = (...allowedRoles) => {
    return (req, res, next) => {
        if (!req.user || !req.user.roleName) {
            return res.status(403).json({
                success: false,
                message: 'User role not found'
            });
        }

        if (!allowedRoles.includes(req.user.roleName)) {
            return res.status(403).json({
                success: false,
                message: 'You do not have permission to access this resource'
            });
        }

        next();
    };
};

// check if user is active
const checkActiveUser = async (req, res, next) => {
    try {
        const db = require('../config/database');

        const [users] = await db.query(
            'SELECT status FROM sp_user_master WHERE user_id = ?',
            [req.user.userId]
        );

        if (users.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'User not found'
            });
        }

        if (users[0].status !== 'Active') {
            return res.status(403).json({
                success: false,
                message: 'Your account is inactive. Please contact administrator.'
            });
        }

        next();

    } catch (error) {
        console.error('Error checking user status:', error);
        return res.status(500).json({
            success: false,
            message: 'Failed to verify user status',
            error: error.message
        });
    }
};

module.exports = {
    authenticateToken,
    authorizeRoles,
    checkActiveUser
};