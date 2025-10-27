
const db = require('../config/database');
const jwt = require('jsonwebtoken');
const nodemailer = require('nodemailer');
const crypto = require('crypto');
const { Resend } = require('resend');

const resend = new Resend(process.env.RESEND_API_KEY);

// Configure email transporter
console.log(' Configuring Email Service...');
console.log('Host:', process.env.EMAIL_HOST);
console.log('Port:', process.env.EMAIL_PORT);
console.log('User:', process.env.EMAIL_USER);
console.log('Pass Length:', process.env.EMAIL_PASSWORD?.length);

const transporter = nodemailer.createTransport({
    host: process.env.EMAIL_HOST,
    port: parseInt(process.env.EMAIL_PORT),
    secure: false,
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASSWORD
    }
});

// Verify email configuration
transporter.verify((error, success) => {
    if (error) {
        console.error(' Email configuration error:', error.message);
    } else {
        console.log(' Email service ready');
    }
});

// Store OTPs temporarily
const otpStore = new Map();

// Get OTP expiry
const OTP_EXPIRY_MS = (parseInt(process.env.OTP_EXPIRY_MINUTES) || 10) * 60 * 1000;

const sendOTP = async (req, res) => {
    try {
        const { email_address } = req.body;

        console.log(' Send OTP request for:', email_address);

        if (!email_address) {
            return res.status(400).json({
                success: false,
                message: 'Email address is required'
            });
        }

        // Check if user exists
        const [users] = await db.query(
            'SELECT user_id, email_address, full_name, status FROM sp_user_master WHERE email_address = ?',
            [email_address]
        );

        if (users.length === 0) {
            console.log(' User not found:', email_address);
            return res.status(404).json({
                success: false,
                message: 'User not found'
            });
        }

        const user = users[0];

        // Check if user is active
        if (user.status !== 'Active') {
            console.log(' User not active:', email_address);
            return res.status(403).json({
                success: false,
                message: 'User account is not active'
            });
        }

        // Generate 6-digit OTP
        const otp = crypto.randomInt(100000, 999999).toString();
        // Store OTP
        otpStore.set(email_address, {
            otp,
            userId: user.user_id,
            expiresAt: Date.now() + OTP_EXPIRY_MS
        });

        // Try to send email (but don't fail if it doesn't work)
        try {
            const mailOptions = {
                from: process.env.EMAIL_FROM,
                to: email_address,
                subject: 'Your Login OTP - Hypertension Management Study',
                html: `
                    <!DOCTYPE html>
                    <html>
                    <head>
                        <meta charset="UTF-8">
                        <meta name="viewport" content="width=device-width, initial-scale=1.0">
                        <style>
                            body {
                                font-family: Arial, sans-serif;
                                line-height: 1.6;
                                color: #333;
                                margin: 0;
                                padding: 0;
                                background-color: #f5f5f5;
                            }
                            .email-wrapper {
                                width: 100%;
                                padding: 20px 0;
                                background-color: #f5f5f5;
                            }
                            .container {
                                max-width: 600px;
                                margin: 0 auto;
                                background-color: #ffffff;
                                border-radius: 8px;
                                overflow: hidden;
                                box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
                            }
                            .header {
                                background: linear-gradient(135deg, #10b981 0%, #059669 100%);
                                color: white;
                                padding: 30px 20px;
                                text-align: center;
                            }
                            .header h2 {
                                margin: 0;
                                font-size: 24px;
                            }
                            .header h3 {
                                margin: 10px 0 0 0;
                                font-size: 16px;
                                font-weight: normal;
                            }
                            .content {
                                background-color: #ffffff;
                                padding: 30px;
                            }
                            .content p {
                                margin: 15px 0;
                            }
                            .otp-box {
                                background-color: #f0f8ff;
                                border: 2px solid #0078d4;
                                border-radius: 8px;
                                padding: 20px;
                                text-align: center;
                                margin: 20px 0;
                                font-size: 32px;
                                font-weight: bold;
                                letter-spacing: 8px;
                                color: #0078d4;
                            }
                            .footer {
                                background: linear-gradient(135deg, #10b981 0%, #059669 100%);
                                padding: 30px 20px;
                                text-align: center;
                                color: #ffffff;
                                font-size: 13px;
                            }
                            .footer p {
                                margin: 8px 0;
                                line-height: 1.5;
                            }
                            .footer a {
                                color: #ffffff;
                                text-decoration: underline;
                            }
                        </style>
                    </head>
                    <body>
                        <div class="email-wrapper">
                            <div class="container">
                                <div class="header">
                                    <h2>SclinEDC</h2>
                                    <h3>Hypertension Management Study</h3>
                                </div>
                                <div class="content">
                                    <p>Dear <strong>${user.full_name}</strong>,</p>
                                    
                                    <p>Your One-Time Password (OTP) for verifying your account is:</p>
                                    
                                    <div class="otp-box">
                                        ${otp}
                                    </div>
                                    
                                    <p>This code is valid for <strong>${process.env.OTP_EXPIRY_MINUTES || 10} minutes</strong>. Please do not share this OTP with anyone for security reasons.</p>
                                    
                                    <p>If you did not request this code, please ignore this email or contact our support team immediately.</p>
                                    
                                    <p>Thank you,<br>
                                    <br>
                                    <strong>Best Regards,</strong><br>
                                    The SclinEDC Team</p>
                                </div>
                                <div class="footer">
                                    <p><strong>© 2025 SclinEDC. All rights reserved.</strong></p>
                                    <p>This is an automated email. Please do not reply.</p>
                                    <p>For support, contact us at <a href="mailto:support@sclinedc.co.in">support@sclinedc.co.in</a></p>
                                </div>
                            </div>
                        </div>
                    </body>
                    </html>
                `
            };

            //await transporter.sendMail(mailOptions);
           await resend.emails.send({
  from: mailOptions.from,
  to: mailOptions.to,
  subject: mailOptions.subject,
  html: mailOptions.html
});
            console.log('Email sent successfully to:', email_address);
        } catch (emailError) {
            console.error(' Email failed (but OTP is in console):', emailError.message);

        }

        // Log to audit trail
        await db.query(`
            INSERT INTO sp_audit_trail (
                user_id, role_id, module_name, action_type,
                record_id, old_value, new_value, ip_address
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `, [user.user_id, null, 'Authentication', 'Email', user.user_id, null, JSON.stringify({ action: 'OTP_SENT' }), req.ip]);

        res.json({
            success: true,
            message: 'OTP sent successfully. Check console for OTP code.'
        });

    } catch (error) {
        console.error(' Error in sendOTP:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to send OTP',
            error: error.message
        });
    }
};

const verifyOTP = async (req, res) => {
    try {
        const { email_address, otp } = req.body;


        if (!email_address || !otp) {
            console.log(' Missing email or OTP');
            return res.status(400).json({
                success: false,
                message: 'Email and OTP are required'
            });
        }

        // Get stored OTP
        const storedData = otpStore.get(email_address);

        console.log(' Stored OTP Data:', storedData);

        if (!storedData) {
            console.log('  No OTP found in store for:', email_address);
            console.log('📦 Current OTP Store:', Array.from(otpStore.keys()));
            return res.status(400).json({
                success: false,
                message: 'No OTP found. Please request a new OTP.'
            });
        }

        // Check if OTP is expired
        const now = Date.now();
        const expiresAt = storedData.expiresAt;
        const timeLeft = Math.floor((expiresAt - now) / 1000);

        console.log(' Time Check:');
        console.log('   Current Time:', new Date(now).toISOString());
        console.log('   Expires At:', new Date(expiresAt).toISOString());
        console.log('   Time Left:', timeLeft, 'seconds');

        if (now > expiresAt) {
            otpStore.delete(email_address);
            console.log('  OTP EXPIRED');
            return res.status(400).json({
                success: false,
                message: 'OTP has expired. Please request a new one.'
            });
        }

        // Verify OTP - Compare as strings
        const storedOTP = String(storedData.otp);
        const receivedOTP = String(otp).trim();


        if (storedOTP !== receivedOTP) {
            return res.status(400).json({
                success: false,
                message: 'Invalid OTP. Please try again.'
            });
        }


        const [users] = await db.query(`
    SELECT 
        u.user_id,
        u.full_name,
        u.email_address,
        u.contact_number,
        u.status,
        r.role_id,
        r.role_name,
        r.role_description,
        st.study_id,
        st.study_title,
        st.study_number,
        si.site_id,
        si.site_name,
        si.site_code
    FROM sp_user_master u
    LEFT JOIN sp_role_master r ON u.role_id = r.role_id
    LEFT JOIN sp_studies st ON u.study_id = st.study_id
    LEFT JOIN sp_site_master si ON u.site_id = si.site_id
    WHERE u.user_id = ?
`, [storedData.userId]);

        if (users.length === 0) {
            console.log(' User not found with ID:', storedData.userId);
            return res.status(404).json({
                success: false,
                message: 'User not found'
            });
        }

        const user = users[0];

        // Remove OTP from store
        otpStore.delete(email_address);
        console.log('🗑️  OTP removed from store');

        // Generate JWT token
        const token = jwt.sign(
            {
                userId: user.user_id,
                email: user.email_address,
                roleId: user.role_id,
                roleName: user.role_name,
                studyId: user.study_id,
                siteId: user.site_id
            },
            process.env.JWT_SECRET,
            { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
        );


        // Log to audit trail
        try {
            await db.query(`
        INSERT INTO sp_audit_trail (
            user_id, role_id, module_name, action_type,
            record_id, old_value, new_value, ip_address
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `, [
                user.user_id,
                user.role_id,
                'Authentication',
                'Login',
                user.user_id,
                null,
                JSON.stringify({ status: 'SUCCESS' }),
                req.ip
            ]);
        } catch (auditError) {
            console.warn('  Audit log failed (non-critical):', auditError.message);
        }

        res.json({
            success: true,
            message: 'Login successful',
            token,
            user: {
                userId: user.user_id,
                fullName: user.full_name,
                email: user.email_address,
                contactNumber: user.contact_number,
                status: user.status,
                role: {
                    roleId: user.role_id,
                    roleName: user.role_name,
                    roleDescription: user.role_description
                },
                study: user.study_id ? {
                    studyId: user.study_id,
                    studyTitle: user.study_title,
                    studyNumber: user.study_number
                } : null,
                site: user.site_id ? {
                    siteId: user.site_id,
                    siteName: user.site_name,
                    siteCode: user.site_code
                } : null
            }
        });

    } catch (error) {
        console.error(' ERROR IN VERIFY OTP:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to verify OTP',
            error: error.message
        });
    }
};


const resendOTP = async (req, res) => {
    try {
        const { email_address } = req.body;
        console.log(' Resend OTP request for:', email_address);

        // Remove old OTP
        otpStore.delete(email_address);

        // Call sendOTP
        return sendOTP(req, res);
    } catch (error) {
        console.error('Error resending OTP:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to resend OTP',
            error: error.message
        });
    }
};

const getProfile = async (req, res) => {
    try {
        const userId = req.user.userId;

        const [users] = await db.query(`
            SELECT 
                u.user_id,
                u.full_name,
                u.email_address,
                u.contact_number,
                u.status,
                r.role_name,
                st.study_name,
                si.site_name
            FROM sp_user_master u
            LEFT JOIN sp_role_master r ON u.role_id = r.role_id
            LEFT JOIN sp_studies st ON u.study_id = st.study_id
            LEFT JOIN sp_site_master si ON u.site_id = si.site_id
            WHERE u.user_id = ?
        `, [userId]);

        if (users.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'User not found'
            });
        }

        res.json({
            success: true,
            data: users[0]
        });
    } catch (error) {
        console.error('Error fetching profile:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch profile',
            error: error.message
        });
    }
};

const updateProfile = async (req, res) => {
    try {
        const userId = req.user.userId;
        const { full_name, contact_number } = req.body;

        const updates = [];
        const values = [];

        if (full_name) {
            updates.push('full_name = ?');
            values.push(full_name);
        }
        if (contact_number) {
            updates.push('contact_number = ?');
            values.push(contact_number);
        }

        if (updates.length === 0) {
            return res.status(400).json({
                success: false,
                message: 'No fields to update'
            });
        }

        updates.push('updated_by = ?');
        values.push(userId);

        await db.query(
            `UPDATE sp_user_master SET ${updates.join(', ')} WHERE user_id = ?`,
            [...values, userId]
        );

        res.json({
            success: true,
            message: 'Profile updated successfully'
        });
    } catch (error) {
        console.error('Error updating profile:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to update profile',
            error: error.message
        });
    }
};

const logout = async (req, res) => {
    try {
        res.json({
            success: true,
            message: 'Logged out successfully'
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Failed to logout'
        });
    }
};

const checkEmail = async (req, res) => {
    try {
        const { email_address } = req.body;

        const [users] = await db.query(
            'SELECT user_id, status FROM sp_user_master WHERE email_address = ?',
            [email_address]
        );

        res.json({
            success: true,
            exists: users.length > 0,
            status: users.length > 0 ? users[0].status : null
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Failed to check email'
        });
    }
};

const getLoginHistory = async (req, res) => {
    try {
        const userId = req.user.userId;

        const [history] = await db.query(`
            SELECT audit_id, action_type, timestamp, ip_address
            FROM sp_audit_trail
            WHERE user_id = ? AND module_name = 'Authentication'
            ORDER BY timestamp DESC
            LIMIT 20
        `, [userId]);

        res.json({
            success: true,
            data: history
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Failed to fetch history'
        });
    }
};

const changePassword = async (req, res) => {
    res.status(501).json({
        success: false,
        message: 'Not implemented. System uses OTP authentication.'
    });
};

module.exports = {
    sendOTP,
    verifyOTP,
    resendOTP,
    getProfile,
    updateProfile,
    logout,
    checkEmail,
    getLoginHistory,
    changePassword
};