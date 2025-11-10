const downloadExcel = require('../../utils/downloadExcel');
const db = require('../../config/database');
const { formatDiffData } = require('../../utils/formatDiff');
const {
  getUserWithRoleDetailsByEmail,
  getUserByEmail,
} = require('../../models/sp_user_master/userMaster.model');
const { getIpAddress } = require('../../utils/helpers');
const { LOG_MODULES } = require('../../utils/constants');

/**
 * Controllers for handling audit logs functionality
 * @namespace auditlogsControllers
 */

/**
 * Sets audit logs for user actions
 * @async
 * @function setAuditLogs
 * @param {Object} req - Express request object
 * @param {Object} params - Parameters object
 * @param {string} params.email - User's email address
 * @param {string} params.fieldName - Name of the field being modified
 * @param {string} params.module_name - Name of the module being modified [e.g., 'USER_MANAGEMENT', 'Authentication']
 * @param {string} params.action_type - Type of action being performed [e.g., 'Create', 'Update', 'Delete', 'Login', 'Logout']
 * @param {*} params.oldValue - Previous value of the field
 * @param {*} params.newValue - New value of the field
 * @param {string} params.remark - Additional remarks about the action
 * @returns {Promise<void>}
 */

/**
 * Retrieves paginated audit logs
 * @async
 * @function getAuditLogs
 * @param {Object} req - Express request object
 * @param {Object} req.body - Request body
 * @param {number} [req.body.page=1] - Page number for pagination
 * @param {number} [req.body.limit=10] - Number of records per page
 * @param {Object} res - Express response object
 * @returns {Promise<Object>} Paginated audit logs with metadata
 */

/**
 * Downloads audit logs as Excel file
 * @async
 * @function downloadReportxlsx
 * @param {Object} req - Express request object
 * @param {Object} req.user - Authenticated user object
 * @param {number} req.user.user_id - User ID of the authenticated user
 * @param {Object} res - Express response object
 * @returns {Promise<Object>} Excel file download response
 */

/**
 * Retrieves detailed information for a specific audit log
 * @async
 * @function getAuditLogDetails
 * @param {Object} req - Express request object
 * @param {Object} req.body - Request body
 * @param {number} req.body.audit_id - ID of the audit log to retrieve
 * @param {Object} res - Express response object
 * @returns {Promise<Object>} Detailed audit log information with differences
 */

const auditlogsControllers = {
  setAuditLogs: async (
    req,
    { module_name, action_type, email, fieldName, oldValue, newValue, remark }
  ) => {
    try {
      email = req.user ? req.user.email : email;
      let user = await getUserByEmail(email);
      console.log('Audit log user:', user);
      if (!user || user.length === 0) {
        return;
      }
      console.log('Preparing to log audit trail for user:', user);

      let loggerData = {
        user_id: user[0].user_id,
        role_id: user[0].role_id,
        action_type: action_type || '',
        module_name: module_name || '',
        field_name: fieldName || '',
        old_value: oldValue || '',
        new_value: newValue || '',
        timestamp: new Date().toISOString().replace('T', ' ').substring(0, 19),
        ip_address: getIpAddress(req) || '',
        remark: remark || '',
      };

      console.log('Logging audit trail:', loggerData);

      await db.query(
        `INSERT INTO sp_audit_trail (user_id, role_id, module_name, action_type, field_name, old_value, new_value, ip_address, timestamp, remark)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          loggerData.user_id,
          loggerData.role_id,
          loggerData.module_name,
          loggerData.action_type,
          loggerData.field_name,
          JSON.stringify(loggerData.old_value || {}),
          JSON.stringify(loggerData.new_value || {}),
          loggerData.ip_address,
          loggerData.timestamp,
          loggerData.remark,
        ]
      );
      console.log('Audit log recorded successfully');
    } catch (error) {
      console.error('Error in setAuditLogs:', error);
    }
  },
  getAuditLogs: async (req, res) => {
    try {
      let { page = 1, limit = 10 } = req.body;
      page = parseInt(page, 10);
      limit = parseInt(limit, 10);
      const offset = (page - 1) * limit;
      const [totalCount] = await db.query(
        `SELECT COUNT(*) as count FROM sp_audit_trail`
      );
      const totalRecords = totalCount[0].count;

      const totalPages = Math.ceil(totalRecords / limit);
      const [auditLogs] = await db.query(
        `SELECT 
          a.audit_id,
          a.user_id,
          u.full_name,
          u.email_address,
          r.role_name,
          a.module_name,
          a.action_type,
          DATE_FORMAT(a.timestamp, '%Y-%m-%d %H:%i:%s') AS timestamp,
          a.ip_address,
          a.remark
        FROM sp_audit_trail a
        LEFT JOIN sp_user_master u ON a.user_id = u.user_id
        LEFT JOIN sp_role_master r ON a.role_id = r.role_id
        ORDER BY a.timestamp DESC
        LIMIT ? OFFSET ?
        `,
        [limit, offset]
      );

      if (!auditLogs || auditLogs.length === 0) {
        return res.status(404).json({
          success: false,
          message: 'No audit logs found',
        });
      }

      res.status(200).json({
        success: true,
        data: auditLogs,
        currentPage: page,
        totalPages: totalPages,
        totalRecords: totalRecords,
        limit: limit,
      });
    } catch (error) {
      console.error('Error in getAuditLogs:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to retrieve audit logs',
      });
    }
  },

  downloadReportxlsx: async (req, res) => {
    try {
      const [auditLogs] = await db.query(
        `
      SELECT 
        a.audit_id AS 'Audit ID',
        a.user_id AS 'User ID',
        u.full_name AS 'User Name',
        u.email_address AS 'Email',
        r.role_name AS 'Role Name',
        a.module_name AS 'Module',
        a.action_type AS 'Action',
        a.field_name AS 'Field Name',
        a.old_value AS 'Old Value',
        a.new_value AS 'New Value',
        DATE_FORMAT(a.timestamp, '%Y-%m-%d %H:%i:%s') AS 'Timestamp',
        a.ip_address AS 'IP Address',
        a.remark AS 'Remark'
      FROM sp_audit_trail a
      LEFT JOIN sp_user_master u ON a.user_id = u.user_id
      LEFT JOIN sp_role_master r ON a.role_id = r.role_id
      ORDER BY a.timestamp ASC
      `
      );

      const { email } = req.user;
      console.log(req.user);
      if (!auditLogs || auditLogs.length === 0) {
        return res.status(404).json({
          success: false,
          message: 'No audit logs found',
        });
      }
      const fileName = `My_Audit_Logs_${
        new Date().toISOString().split('T')[0]
      }`;
      downloadExcel(auditLogs, fileName, res);
      // audit logs exported
      await auditlogsControllers.setAuditLogs(req, {
        email,
        module_name: LOG_MODULES.AUDIT_TRAIL,
        action_type: 'export',
        remark: `User exported all Audit logs.`,
      });
    } catch (error) {
      console.error('Error in downloadReportxlsx:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to download audit logs',
      });
    }
  },

  getAuditLogDetails: async (req, res) => {
    /*
    expected response format:
    {
      user_name,
      role,
      module,
      action_type,
      timestamp,
      remark,
      diff:[{field_name:"", old_value:"", new_value:""},{field_name:"", old_value:"", new_value:""},{field_name:"", old_value:"", new_value:""}]
    }
    */

    try {
      const { audit_id } = req.body;

      const ignoreDiffActionTypes = [
        'CREATE',
        'DELETE',
        'LOGIN',
        'LOGOUT',
        'EMAIL',
      ];
      const ignoreModule_type = ['User Management', 'Role Management'];

      const [auditLog] = await db.query(
        `
        SELECT 
          a.audit_id,
          a.user_id,
          u.full_name,
          u.email_address,
          r.role_name,
          a.old_value,
          a.new_value,
          a.module_name,
          a.action_type,
          DATE_FORMAT(a.timestamp, '%Y-%m-%d %H:%i:%s') AS timestamp,
          a.ip_address,
          a.remark
        FROM sp_audit_trail a
        LEFT JOIN sp_user_master u ON a.user_id = u.user_id
        LEFT JOIN sp_role_master r ON a.role_id = r.role_id
        WHERE a.audit_id = ?
        `,
        [audit_id]
      );
      const module_name = auditLog[0].module_name;
      const action_type = auditLog[0].action_type.toUpperCase();
      console.log('Module and Action Type:', module_name, action_type);
      // if (
      //   !ignoreModule_type.includes(module_name) &&
      //   action_type !== 'CREATE'
      // ) {
      console.log('Generating diff for audit log:', audit_id);
      let diff = [];
      diff = ignoreDiffActionTypes.includes(action_type)
        ? []
        : formatDiffData(auditLog[0].old_value, auditLog[0].new_value);
      auditLog[0].diff = diff;
      delete auditLog[0].old_value; // remove raw old/new values
      delete auditLog[0].new_value; // remove raw old/new values
      // }

      if (!auditLog || auditLog.length === 0) {
        return res.status(404).json({
          success: false,
          message: 'Audit log not found',
        });
      }

      res.status(200).json({
        success: true,
        data: auditLog[0],
      });
    } catch (error) {
      console.error('Error in getAuditLogDetails:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to retrieve audit log details',
      });
    }
  },
};

module.exports = auditlogsControllers;
