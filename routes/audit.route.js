const express = require('express');
const ExcelJS = require('exceljs')
const db = require("./../config/database");
const { authenticateToken } = require('../middleware/auth');
const auditlogsControllers = require('../controllers/auditlogs/auditlogs.controller');
const auditRouter = express.Router();


auditRouter.post("/download", authenticateToken, auditlogsControllers.downloadReportxlsx);

module.exports = auditRouter;