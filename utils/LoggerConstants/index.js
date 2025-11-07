// Utilities for creating audit log objects used throughout the app

const createLogger = ({
  user_id,
  user_name,
  full_name,
  role_id,
  module_name,
  action_type,
  field_name = '-',
  old_value = '-',
  new_value = '-',
  ip_address,
  ipAddress,
  remark,
} = {}) => {
  // Accept either user_name or full_name (fall back to email or '-')
  const finalUserName =
    user_name ||
    full_name ||
    (typeof remark === 'string' && remark.includes('@') ? remark : '-') ||
    '-';

  // timestamp in 'YYYY-MM-DD HH:mm:ss' format
  const timestamp = new Date().toISOString().replace('T', ' ').substring(0, 19);

  return {
    user_id,
    user_name: finalUserName,
    role_id,
    module_name,
    action_type,
    field_name,
    old_value,
    new_value,
    timestamp,
    ip_address: ip_address || ipAddress || '-',
    remark,
  };
};

const authLoggerObj = {
  OTP_SENT: (user) => {
    return createLogger({
      ...user,
      module_name: 'AUTHENTICATION',
      action_type: 'Login',
      remark: `One-Time Password (OTP) sent to ${user.email_address || '-'}.`,
    });
  },
  OTP_RESENT: (user) => {
    return createLogger({
      ...user,
      module_name: 'AUTHENTICATION',
      action_type: 'Login',
      remark: `One-Time Password (OTP) resent to ${user.email_address || '-'}.`,
    });
  },
  LOGIN_SUCCESS: (user) => {
    return createLogger({
      ...user,
      action_type: 'Login',
      module_name: 'AUTHENTICATION',
      remark: `Login successful using One-Time Password (OTP) for ${
        user.email_address || '-'
      }.`,
    });
  },
  LOGOUT: (user) => {
    return createLogger({
      ...user,
      action_type: 'Logout',
      module_name: 'AUTHENTICATION',
      remark: `User logged out successfully.`,
    });
  },
};

const userLoggerObj = {
  USER_CREATED: (user, newUser) => {
    return createLogger({
      ...user,
      action_type: 'Create',
      field_name: 'user_id',
      old_value: '-',
      new_value: '-',
      remark: `New user created successfully with: ${
        newUser.email_address || '-'
      }.`,
    });
  },
  USER_UPDATED: (user, updatedFields) => {
    return createLogger({
      ...user,
      action_type: 'Update',
      field_name: Object.keys(updatedFields).join(', ') || '-',
      old_value: Object.values(updatedFields).join(', ') || '-',
      new_value: Object.values(updatedFields).join(', ') || '-',
      remark: 'User details updated successfully.',
    });
  },
  USER_DELETED: (user) => {
    return createLogger({
      ...user,
      action_type: 'Delete',
      field_name: 'user_id',
      old_value: user.user_id || '-',
      new_value: '-',
      remark: 'User deleted successfully.',
    });
  },
};

module.exports = {
  authLoggerObj,
  userLoggerObj,
  createLogger,
};
