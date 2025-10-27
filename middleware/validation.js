const { body, validationResult } = require('express-validator');

const validateCROLogin = [
    body('email').isEmail().normalizeEmail().withMessage('Valid email is required')
];

const validateOTP = [
    body('email').isEmail().normalizeEmail().withMessage('Valid email is required'),
    body('otp').isLength({ min: 6, max: 6 }).isNumeric().withMessage('OTP must be 6 digits')
];

const handleValidationErrors = (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({
            success: false,
            errors: errors.array().map(err => err.msg)
        });
    }
    next();
};

module.exports = {
    validateCROLogin,
    validateOTP,
    handleValidationErrors
};