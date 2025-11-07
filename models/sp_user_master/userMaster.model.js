const db = require('../../config/database');

const getUserByEmail = async (email) => {
  const [rows] = await db.query(
    'SELECT user_id, full_name, email_address, role_id FROM sp_user_master WHERE email_address = ?',
    [email]
  );
  console.log('getUserByEmail rows:', rows, email);
  return rows;
};

const getUserById = async (userId) => {
  const [rows] = await db.query(
    'SELECT user_id, full_name, email_address FROM sp_user_master WHERE user_id = ?',
    [userId]
  );
  return rows;
};

const getUserWithRoleDetailsById = async (userId) => {
  const [rows] = await db.query(
    `SELECT
        u.user_id,
        u.full_name,
        u.email_address,
        r.role_id,
        r.role_name,
        r.role_description
    FROM sp_user_master u
    LEFT JOIN sp_role_master r ON u.role_id = r.role_id
    WHERE u.user_id = ?`,
    [userId]
  );
  return rows;
};

const getUserWithRoleDetailsByEmail = async (email) => {
  const [rows] = await db.query(
    `SELECT
        u.user_id,
        r.role_id,
        r.role_name,
    FROM sp_user_master u
    LEFT JOIN sp_role_master r ON u.role_id = r.role_id
    WHERE u.email_address = ?`,
    [email]
  );
  return rows;
};

module.exports = {
  getUserByEmail,
  getUserById,
  getUserWithRoleDetailsById,
  getUserWithRoleDetailsByEmail,
};
