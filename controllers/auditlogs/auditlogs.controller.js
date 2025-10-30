const downloadExcel = require("../../utils/downloadExcel");
const db = require("../../config/database");

const auditlogsControllers = {
  downloadReportxlsx: async (req, res) => {
    try {
      const { userId } = req.user;

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
        DATE_FORMAT(a.timestamp, '%Y-%m-%d %H:%i:%s') AS 'Timestamp',
        a.ip_address AS 'IP Address'
      FROM sp_audit_trail a
      LEFT JOIN sp_user_master u ON a.user_id = u.user_id
      LEFT JOIN sp_role_master r ON a.role_id = r.role_id
      WHERE a.user_id = ?
      ORDER BY a.timestamp DESC
      `,
        [userId]
      );

      if (auditLogs.length === 0) {
        return res.status(404).json({
          success: false,
          message: 'No audit logs found'
        });
      }

      const fileName = `My_Audit_Logs_${new Date().toISOString().split('T')[0]}`;
      downloadExcel(auditLogs, fileName, res);

    } catch (error) {
      console.error('Error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to download audit logs'
      });
    }
  },
};

module.exports = auditlogsControllers;