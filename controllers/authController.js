const db = require('../config/database');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { Resend } = require('resend');
const auditlogsControllers = require('./auditlogs/auditlogs.controller');
const { authLoggerObj } = require('../utils/LoggerConstants');
const { getIpAddress } = require('../utils/helpers');
const resend = new Resend(process.env.RESEND_API_KEY || '');

const otpStore = new Map();
const OTP_EXPIRY_MS =
  (parseInt(process.env.OTP_EXPIRY_MINUTES, 10) || 10) * 60 * 1000;

/**
 * Internal helper that generates & stores OTP and attempts to email it.
 * Returns an object { success, message, statusCode? } but does not send HTTP responses.
 */
const sendOTPInternal = async (email_address) => {
  if (!email_address) {
    return {
      success: false,
      message: 'Email address is required',
      statusCode: 400,
    };
  }

  const [users] = await db.query(
    'SELECT user_id, email_address, full_name, status FROM sp_user_master WHERE email_address = ?',
    [email_address]
  );

  if (!users || users.length === 0) {
    return {
      success: false,
      message:
        'No account found with this email address. Please check and try again.',
      statusCode: 404,
    };
  }

  const user = users[0];

  if (user.status !== 'Active') {
    return {
      success: false,
      message: 'User account is not active',
      statusCode: 403,
    };
  }

  const otp = crypto.randomInt(100000, 999999).toString();
  otpStore.set(email_address, {
    otp,
    userId: user.user_id,
    expiresAt: Date.now() + OTP_EXPIRY_MS,
  });

  const html = `<!DOCTYPE html>
  <html>
  <head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <style>
      body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; background-color: #f5f5f5; margin:0; padding:0; }
      .container { max-width:600px; margin:20px auto; background:#fff; border-radius:8px; overflow:hidden; box-shadow:0 2px 8px rgba(0,0,0,0.1); }
      .header { background:linear-gradient(135deg,#10b981 0%,#059669 100%); color:#fff; padding:30px 20px; text-align:center; }
      .content { padding:30px; }
      .otp-box { background:#f0f8ff; border:2px solid #0078d4; border-radius:8px; padding:20px; text-align:center; margin:20px 0; font-size:32px; font-weight:bold; letter-spacing:8px; color:#0078d4; }
      .footer { background:linear-gradient(135deg,#10b981 0%,#059669 100%); padding:20px; text-align:center; color:#fff; font-size:13px; }
    </style>
  </head>
  <body>
    <div class="container">
      <div class="header">
        <h2>SclinEDC</h2>
        <h3>Hypertension Management Study</h3>
      </div>
      <div class="content">
        <p>Dear <strong>${user.full_name}</strong>,</p>
        <p>Your One-Time Password (OTP) for verifying your account is:</p>
        <div class="otp-box">${otp}</div>
        <p>This code is valid for <strong>${
          process.env.OTP_EXPIRY_MINUTES || 10
        } minutes</strong>. Please do not share this OTP with anyone for security reasons.</p>
        <p>If you did not request this code, please ignore this email or contact our support team immediately.</p>
        <p>Thank you,<br><strong>Best Regards,</strong><br>The SclinEDC Team</p>
      </div>
      <div class="footer">
        <p><strong>© ${new Date().getFullYear()} SclinEDC. All rights reserved.</strong></p>
        <p>This is an automated email. Please do not reply.</p>
        <p>For support, contact us at <a href="mailto:support@sclinedc.co.in" style="color:#fff; text-decoration:underline">support@sclinedc.co.in</a></p>
      </div>
    </div>
  </body>
  </html>`;

  try {
    // Use Resend (or fallback to console when API key missing)
    if (process.env.RESEND_API_KEY) {
      await resend.emails.send({
        from: process.env.EMAIL_FROM,
        to: email_address,
        subject: 'Your Login OTP - Hypertension Management Study',
        html,
      });
    } else {
      console.warn(
        'RESEND_API_KEY not set, skipping external email send. OTP in console for dev:',
        otp
      );
    }

    return { success: true, message: 'OTP sent successfully.' };
  } catch (emailError) {
    console.error(' Email failed (but OTP is stored):', emailError);
    return {
      success: true,
      message:
        'OTP generated and stored, but email sending failed (check logs).',
    };
  }
};

// Public endpoint
const sendOTP = async (req, res) => {
  try {
    const { email_address } = req.body;
    const result = await sendOTPInternal(email_address);

    if (result.statusCode) {
      return res
        .status(result.statusCode)
        .json({ success: false, message: result.message });
    }

    // audit log - OTP_SENT
    await auditlogsControllers.setAuditLogs(req, {
      email: email_address,
      module_name: 'AUTHENTICATION',
      action_type: 'Login',
      remark: `One-Time Password (OTP) sent to ${email_address || '-'}.`,
    });

    return res.json({ success: result.success, message: result.message });
  } catch (error) {
    console.error(' Error in sendOTP:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to send OTP',
      error: error.message,
    });
  }
};

const verifyOTP = async (req, res) => {
  try {
    const { email_address, otp } = req.body;
    if (!email_address || !otp) {
      return res
        .status(400)
        .json({ success: false, message: 'Email and OTP are required' });
    }

    const storedData = otpStore.get(email_address);
    if (!storedData) {
      return res.status(400).json({
        success: false,
        message:
          'Looks like your OTP is missing or expired. Please request a new one!',
      });
    }

    if (Date.now() > storedData.expiresAt) {
      otpStore.delete(email_address);
      return res.status(400).json({
        success: false,
        message: 'OTP has expired. Please request a new one.',
      });
    }

    if (String(storedData.otp) !== String(otp).trim()) {
      return res
        .status(400)
        .json({ success: false, message: 'Invalid OTP. Please try again.' });
    }

    const [users] = await db.query(
      `
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
      `,
      [storedData.userId]
    );

    if (!users || users.length === 0) {
      return res
        .status(404)
        .json({ success: false, message: 'User not found' });
    }

    const user = users[0];

    otpStore.delete(email_address);

    const token = jwt.sign(
      {
        userId: user.user_id,
        email: user.email_address,
        roleId: user.role_id,
        roleName: user.role_name,
        studyId: user.study_id,
        siteId: user.site_id,
      },
      process.env.JWT_SECRET || 'defaultsecret',
      { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
    );

    // audit log - LOGIN_SUCCESS
    await auditlogsControllers.setAuditLogs(req, {
      email: email_address,
      module_name: 'AUTHENTICATION',
      action_type: 'Login',
      remark: `User ${user.full_name || '-'} logged in successfully.`,
    });

    return res.json({
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
          roleDescription: user.role_description,
        },
        study: user.study_id
          ? {
              studyId: user.study_id,
              studyTitle: user.study_title,
              studyNumber: user.study_number,
            }
          : null,
        site: user.site_id
          ? {
              siteId: user.site_id,
              siteName: user.site_name,
              siteCode: user.site_code,
            }
          : null,
      },
    });
  } catch (error) {
    console.error(' ERROR IN VERIFY OTP:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to verify OTP',
      error: error.message,
    });
  }
};

const resendOTP = async (req, res) => {
  try {
    const { email_address } = req.body;
    otpStore.delete(email_address);

    const [users] = await db.query(
      `
      SELECT 
          u.user_id,
          u.full_name,
          u.email_address,
          u.status,
          r.role_id,
          r.role_name
      FROM sp_user_master u
      LEFT JOIN sp_role_master r ON u.role_id = r.role_id
      WHERE u.email_address = ?
      `,
      [email_address]
    );

    if (!users || users.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'No account found with this email address.',
      });
    }

    const user = users[0];

    const result = await sendOTPInternal(email_address);

    // Write OTP_RESENT audit log using single user object
    // audit log - OTP_RESENT
    await auditlogsControllers.setAuditLogs(req, {
      email: email_address,
      module_name: 'AUTHENTICATION',
      action_type: 'Login',
      remark: `One-Time Password (OTP) resent to ${email_address || '-'}.`,
    });

    if (result.statusCode) {
      return res
        .status(result.statusCode)
        .json({ success: false, message: result.message });
    }

    return res.status(200).json({
      success: true,
      message: result.message || 'OTP resent successfully.',
    });
  } catch (error) {
    console.error('Error resending OTP:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to resend OTP',
      error: error.message,
    });
  }
};

const getProfile = async (req, res) => {
  try {
    const userId = req.user.userId;
    const [users] = await db.query(
      `
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
        `,
      [userId]
    );

    if (!users || users.length === 0) {
      return res
        .status(404)
        .json({ success: false, message: 'User not found' });
    }
    return res.json({ success: true, data: users[0] });
  } catch (error) {
    console.error('Error fetching profile:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch profile',
      error: error.message,
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
      return res
        .status(400)
        .json({ success: false, message: 'No fields to update' });
    }

    updates.push('updated_by = ?');
    values.push(userId);

    await db.query(
      `UPDATE sp_user_master SET ${updates.join(', ')} WHERE user_id = ?`,
      [...values, userId]
    );

    return res.json({ success: true, message: 'Profile updated successfully' });
  } catch (error) {
    console.error('Error updating profile:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to update profile',
      error: error.message,
    });
  }
};

const logout = async (req, res) => {
  try {
    const userId = req.user.userId;
    const roleId = req.user.roleId;

    // fetch user's display name/email for audit (avoid undefined)
    const [rows] = await db.query(
      'SELECT full_name, email_address FROM sp_user_master WHERE user_id = ?',
      [userId]
    );
    const userInfo =
      rows && rows[0] ? rows[0] : { full_name: null, email_address: null };

    // audit log - logout
    await auditlogsControllers.setAuditLogs(req, {
      email: userInfo.email_address,
      module_name: 'AUTHENTICATION',
      action_type: 'Logout',
      remark: `User ${userInfo.full_name || '-'} logged out.`,
    });

    return res.json({ success: true, message: 'Logged out successfully' });
  } catch (error) {
    console.error(' ERROR IN LOGOUT:', error);
    return res
      .status(500)
      .json({ success: false, message: 'Logout failed', error: error.message });
  }
};

const checkEmail = async (req, res) => {
  try {
    const { email_address } = req.body;
    const [users] = await db.query(
      'SELECT user_id, status FROM sp_user_master WHERE email_address = ?',
      [email_address]
    );

    return res.json({
      success: true,
      exists: users.length > 0,
      status: users.length > 0 ? users[0].status : null,
    });
  } catch (error) {
    console.error('Error in checkEmail:', error);
    return res
      .status(500)
      .json({ success: false, message: 'Failed to check email' });
  }
};

const getLoginHistory = async (req, res) => {
  try {
    const userId = req.user.userId;
    const [history] = await db.query(
      `
            SELECT audit_id, action_type, timestamp, ip_address
            FROM sp_audit_trail
            WHERE user_id = ? AND module_name = 'AUTHENTICATION'
            ORDER BY timestamp DESC
            LIMIT 20
        `,
      [userId]
    );

    return res.json({ success: true, data: history });
  } catch (error) {
    console.error('Error in getLoginHistory:', error);
    return res
      .status(500)
      .json({ success: false, message: 'Failed to fetch history' });
  }
};

const changePassword = async (req, res) => {
  return res.status(501).json({
    success: false,
    message: 'Not implemented. System uses OTP authentication.',
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
  changePassword,
};
