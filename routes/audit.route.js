const express = require('express');
const { authenticateToken } = require('../middleware/auth');
const auditlogsControllers = require('../controllers/auditlogs/auditlogs.controller');
const auditRouter = express.Router();

auditRouter.post(
  '/download',
  authenticateToken,
  auditlogsControllers.downloadReportxlsx
);
auditRouter.post('/get-audit-logs', auditlogsControllers.getAuditLogs);
auditRouter.post('/get-audit-details', auditlogsControllers.getAuditLogDetails);

module.exports = auditRouter;
