// const db = require('../../config/database');
// const { LOG_MODULES } = require('../../utils/constants');
// const downloadExcel = require('../../utils/downloadExcel');
// const {
//   mapStudyResponses,
//   mapResponsesToQuestions,
// } = require('../../utils/mapStudyResponse');
// const auditlogsControllers = require('../auditlogs/auditlogs.controller');

// const studyResponseController = {
//   summary: async (req, res) => {
//     try {
//       // Fetch study summary from the database
//       const [statsRows] = await db.query(`
//         SELECT
//           COUNT(*) AS totalSubmissions,
//           SUM(CASE WHEN status = 'draft' THEN 1 ELSE 0 END) AS totalDrafts,
//           SUM(CASE WHEN status = 'submitted' THEN 1 ELSE 0 END) AS totalCompleted
//         FROM study_response
//       `);

//       // Get total sites (separate query)
//       const [totalSitesRows] = await db.query(
//         `SELECT COUNT(*) AS totalSites FROM sp_site_master`
//       );

//       // Safely extract the single-row stats and attach totalSites
//       const statsRow =
//         statsRows && statsRows[0]
//           ? statsRows[0]
//           : {
//               totalSubmissions: 0,
//               totalDrafts: 0,
//               totalCompleted: 0,
//             };

//       statsRow.totalSites =
//         totalSitesRows && totalSitesRows[0] && totalSitesRows[0].totalSites
//           ? Number(totalSitesRows[0].totalSites)
//           : 0;

//       const stats = {
//         totalSubmissions: Number(statsRow.totalSubmissions) || 0,
//         totalDrafts: Number(statsRow.totalDrafts) || 0,
//         totalCompleted: Number(statsRow.totalCompleted) || 0,
//         totalSites: statsRow.totalSites,
//       };

//       const [graphRows] = await db.query(`
//         WITH RECURSIVE date_range AS (
//           SELECT CURDATE() - INTERVAL 6 DAY AS date
//           UNION ALL
//           SELECT DATE_ADD(date, INTERVAL 1 DAY)
//           FROM date_range
//           WHERE DATE_ADD(date, INTERVAL 1 DAY) <= CURDATE()
//         )
//         SELECT
//           d.date,
//           COALESCE(SUM(CASE WHEN s.status = 'draft' THEN 1 ELSE 0 END), 0) AS drafts,
//           COALESCE(SUM(CASE WHEN s.status = 'submitted' THEN 1 ELSE 0 END), 0) AS submitted,
//           COALESCE(COUNT(s.response_id), 0) AS total
//         FROM date_range d
//         LEFT JOIN study_response s
//           ON (
//             (s.status = 'draft' AND DATE(s.created_at) = d.date)
//             OR
//             (s.status = 'submitted' AND DATE(s.submitted_at) = d.date)
//           )
//         GROUP BY d.date
//         ORDER BY d.date
//       `);

//       // Normalize/format graph data (ensure date is a string YYYY-MM-DD)
//       const graphData = (graphRows || []).map((r) => {
//         let dateVal = r.date;
//         // MySQL driver can return Date objects or strings depending on config.
//         if (dateVal instanceof Date) {
//           dateVal = dateVal.toISOString().split('T')[0];
//         } else if (typeof dateVal === 'string' && dateVal.includes(' ')) {
//           // If the driver returns a datetime-like string, keep only the date part
//           dateVal = dateVal.split(' ')[0];
//         }
//         return {
//           date: dateVal,
//           drafts: Number(r.drafts) || 0,
//           submitted: Number(r.submitted) || 0,
//           total: Number(r.total) || 0,
//         };
//       });

//       return res.status(200).json({
//         success: true,
//         data: { stats, graphData },
//       });
//     } catch (error) {
//       console.error('Error fetching study summary:', error);
//       return res.status(500).json({
//         success: false,
//         message: 'Failed to fetch study summary',
//       });
//     }
//   },

//   recentStudySubmissions: async (req, res) => {
//     try {
//       const [rows] = await db.query(`
//        SELECT
//   sr.submitted_at,
//   u.full_name,
//   u.email_address AS email,
//   u.contact_number,
//   s.site_name,
//   st.study_title
// FROM study_response sr
// LEFT JOIN sp_user_master u ON sr.user_id = u.user_id
// LEFT JOIN sp_studies st ON sr.study_id = st.study_id
// LEFT JOIN sp_site_master s ON s.site_id =  u.site_id
// WHERE sr.status = 'submitted'
// ORDER BY sr.submitted_at DESC;
//       `);

//       return res.status(200).json({
//         success: true,
//         data: rows,
//       });
//     } catch (error) {
//       console.error('Error fetching recent study submissions:', error);
//       return res.status(500).json({
//         success: false,
//         message: 'Failed to fetch recent study submissions',
//       });
//     }
//   },
//   totalStudyReports: async (req, res) => {
//     try {
//       const [data] = await db.query(`
//         SELECT COUNT(*) AS total,
//         SUM(CASE WHEN status = 'draft' THEN 1 ELSE 0 END) AS totalDrafts,
//         SUM(CASE WHEN status = 'submitted' THEN 1 ELSE 0 END) AS totalCompleted
//         FROM study_response;
//       `);
//       return res.status(200).json({
//         success: true,
//         data: data[0],
//       });
//     } catch (error) {
//       console.error('Error fetching total study reports:', error);
//       return res.status(500).json({
//         success: false,
//         message: 'Failed to fetch total study reports',
//       });
//     }
//   },

//   exportStudyData: async (req, res) => {
//     let status = req.body.type; // 'draft' or 'submitted'
//     if (status !== 'draft' && status !== 'submitted') {
//       return res.status(400).json({
//         success: false,
//         message: 'Invalid status type',
//       });
//     }
//     try {
//       const [rows] = await db.query(
//         `
//         SELECT
//           sr.submitted_at AS 'Submitted At',
//           u.full_name AS 'Full Name',
//           u.email_address AS 'Email',
//           u.contact_number AS 'Contact Number',
//           s.site_name AS 'Site Name',
//           st.study_title AS 'Study Title',
//           sr.response_data AS 'Response Data',
//           st.study_definition AS 'Study Definition'
//         FROM study_response sr
//         LEFT JOIN sp_user_master u ON sr.user_id = u.user_id
//         LEFT JOIN sp_studies st ON sr.study_id = st.study_id
//         LEFT JOIN sp_site_master s ON s.site_id =  u.site_id
//         WHERE sr.status = ?;
//       `,
//         [status]
//       );
//       console.log(rows[0]['Study Definition'], rows[0].response_data);
//       let actualAllResponsesDefinition = [];
//       rows[0]['Study Definition']?.sections?.map((section) =>
//         actualAllResponsesDefinition.push(...section)
//       );
//       const mapResponse = mapResponsesToQuestions(
//         rows[0]['Study Definition']?.study?.sections.flatMap(
//           (section) => section.questions
//         ),
//         rows[0]['Response Data']
//       );
//       rows[0]['Response Data'] = mapResponse;

//       downloadExcel(rows, 'study_data_export', res);
//       console.log('Study data exported successfully.', req.user);
//       // audit log - OTP_SENT
//       await auditlogsControllers.setAuditLogs(req, {
//         email: req.user ? req.user.email : 'Unknown',
//         module_name: LOG_MODULES.STUDY_MANAGEMENT,
//         action_type: 'export',
//         remark: `User exported ${status} study data.`,
//       });

//       return;
//     } catch (error) {
//       console.error('Error exporting study data:', error);
//       return res.status(500).json({
//         success: false,
//         message: 'Failed to export study data',
//       });
//     }
//   },
// };

// module.exports = studyResponseController;
// ==============================================================================================================

// const db = require('../../config/database');
// const { LOG_MODULES } = require('../../utils/constants');
// const ExcelJS = require('exceljs'); // Make sure to install: npm install exceljs
// const auditlogsControllers = require('../auditlogs/auditlogs.controller');

// const studyResponseController = {
//   summary: async (req, res) => {
//     try {
//       // Fetch study summary from the database
//       const [statsRows] = await db.query(`
//         SELECT
//           COUNT(*) AS totalSubmissions,
//           SUM(CASE WHEN status = 'draft' THEN 1 ELSE 0 END) AS totalDrafts,
//           SUM(CASE WHEN status = 'submitted' THEN 1 ELSE 0 END) AS totalCompleted
//         FROM study_response
//       `);

//       // Get total sites (separate query)
//       const [totalSitesRows] = await db.query(
//         `SELECT COUNT(*) AS totalSites FROM sp_site_master`
//       );

//       // Safely extract the single-row stats and attach totalSites
//       const statsRow =
//         statsRows && statsRows[0]
//           ? statsRows[0]
//           : {
//               totalSubmissions: 0,
//               totalDrafts: 0,
//               totalCompleted: 0,
//             };

//       statsRow.totalSites =
//         totalSitesRows && totalSitesRows[0] && totalSitesRows[0].totalSites
//           ? Number(totalSitesRows[0].totalSites)
//           : 0;

//       const stats = {
//         totalSubmissions: Number(statsRow.totalSubmissions) || 0,
//         totalDrafts: Number(statsRow.totalDrafts) || 0,
//         totalCompleted: Number(statsRow.totalCompleted) || 0,
//         totalSites: statsRow.totalSites,
//       };

//       const [graphRows] = await db.query(`
//         WITH RECURSIVE date_range AS (
//           SELECT CURDATE() - INTERVAL 6 DAY AS date
//           UNION ALL
//           SELECT DATE_ADD(date, INTERVAL 1 DAY)
//           FROM date_range
//           WHERE DATE_ADD(date, INTERVAL 1 DAY) <= CURDATE()
//         )
//         SELECT
//           d.date,
//           COALESCE(SUM(CASE WHEN s.status = 'draft' THEN 1 ELSE 0 END), 0) AS drafts,
//           COALESCE(SUM(CASE WHEN s.status = 'submitted' THEN 1 ELSE 0 END), 0) AS submitted,
//           COALESCE(COUNT(s.response_id), 0) AS total
//         FROM date_range d
//         LEFT JOIN study_response s
//           ON (
//             (s.status = 'draft' AND DATE(s.created_at) = d.date)
//             OR
//             (s.status = 'submitted' AND DATE(s.submitted_at) = d.date)
//           )
//         GROUP BY d.date
//         ORDER BY d.date
//       `);

//       // Normalize/format graph data (ensure date is a string YYYY-MM-DD)
//       const graphData = (graphRows || []).map((r) => {
//         let dateVal = r.date;
//         // MySQL driver can return Date objects or strings depending on config.
//         if (dateVal instanceof Date) {
//           dateVal = dateVal.toISOString().split('T')[0];
//         } else if (typeof dateVal === 'string' && dateVal.includes(' ')) {
//           // If the driver returns a datetime-like string, keep only the date part
//           dateVal = dateVal.split(' ')[0];
//         }
//         return {
//           date: dateVal,
//           drafts: Number(r.drafts) || 0,
//           submitted: Number(r.submitted) || 0,
//           total: Number(r.total) || 0,
//         };
//       });

//       return res.status(200).json({
//         success: true,
//         data: { stats, graphData },
//       });
//     } catch (error) {
//       console.error('Error fetching study summary:', error);
//       return res.status(500).json({
//         success: false,
//         message: 'Failed to fetch study summary',
//       });
//     }
//   },

//   recentStudySubmissions: async (req, res) => {
//     try {
//       const [rows] = await db.query(`
//         SELECT
//           sr.submitted_at,
//           u.full_name,
//           u.email_address AS email,
//           u.contact_number,
//           s.site_name,
//           st.study_title
//         FROM study_response sr
//         LEFT JOIN sp_user_master u ON sr.user_id = u.user_id
//         LEFT JOIN sp_studies st ON sr.study_id = st.study_id
//         LEFT JOIN sp_site_master s ON s.site_id = u.site_id
//         WHERE sr.status = 'submitted'
//         ORDER BY sr.submitted_at DESC;
//       `);

//       return res.status(200).json({
//         success: true,
//         data: rows,
//       });
//     } catch (error) {
//       console.error('Error fetching recent study submissions:', error);
//       return res.status(500).json({
//         success: false,
//         message: 'Failed to fetch recent study submissions',
//       });
//     }
//   },

//   totalStudyReports: async (req, res) => {
//     try {
//       const [data] = await db.query(`
//         SELECT COUNT(*) AS total,
//         SUM(CASE WHEN status = 'draft' THEN 1 ELSE 0 END) AS totalDrafts,
//         SUM(CASE WHEN status = 'submitted' THEN 1 ELSE 0 END) AS totalCompleted
//         FROM study_response;
//       `);
//       return res.status(200).json({
//         success: true,
//         data: data[0],
//       });
//     } catch (error) {
//       console.error('Error fetching total study reports:', error);
//       return res.status(500).json({
//         success: false,
//         message: 'Failed to fetch total study reports',
//       });
//     }
//   },

//   exportStudyData: async (req, res) => {
//     let status = req.body.type; // 'draft' or 'submitted'
//     if (status !== 'draft' && status !== 'submitted') {
//       return res.status(400).json({
//         success: false,
//         message: 'Invalid status type',
//       });
//     }

//     try {
//       const [rows] = await db.query(
//         `
//         SELECT
//           sr.submitted_at AS 'Submitted At',
//           u.full_name AS 'Full Name',
//           u.email_address AS 'Email',
//           u.contact_number AS 'Contact Number',
//           s.site_name AS 'Site Name',
//           st.study_title AS 'Study Title',
//           sr.response_data AS 'Response Data',
//           st.study_definition AS 'Study Definition'
//         FROM study_response sr
//         LEFT JOIN sp_user_master u ON sr.user_id = u.user_id
//         LEFT JOIN sp_studies st ON sr.study_id = st.study_id
//         LEFT JOIN sp_site_master s ON s.site_id = u.site_id
//         WHERE sr.status = ?;
//       `,
//         [status]
//       );

//       if (rows.length === 0) {
//         return res.status(404).json({
//           success: false,
//           message: `No ${status} study responses found`,
//         });
//       }

//       // Create Excel workbook
//       const workbook = new ExcelJS.Workbook();

//       // Add metadata
//       workbook.creator = req.user ? req.user.email : 'System';
//       workbook.lastModifiedBy = req.user ? req.user.email : 'System';
//       workbook.created = new Date();
//       workbook.modified = new Date();

//       // Create Summary Sheet
//       const summarySheet = workbook.addWorksheet('Summary');
//       summarySheet.columns = [
//         { header: 'Field', key: 'field', width: 25 },
//         { header: 'Value', key: 'value', width: 50 },
//       ];

//       // Style summary headers
//       summarySheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFF' } };
//       summarySheet.getRow(1).fill = {
//         type: 'pattern',
//         pattern: 'solid',
//         fgColor: { argb: '4472C4' },
//       };

//       // Add summary data
//       summarySheet.addRow({
//         field: 'Study Title',
//         value: rows[0]['Study Title'] || 'N/A',
//       });
//       summarySheet.addRow({
//         field: 'Export Type',
//         value: status.toUpperCase(),
//       });
//       summarySheet.addRow({
//         field: 'Export Date',
//         value: new Date().toLocaleString(),
//       });
//       summarySheet.addRow({ field: 'Total Responses', value: rows.length });

//       // Create Individual Response Sheets
//       rows.forEach((row, index) => {
//         const participantName = row['Full Name'] || `Participant_${index + 1}`;
//         const sheetName = `${index + 1}_${participantName}`
//           .substring(0, 31)
//           .replace(/[\\\/\?\*\[\]]/g, '_');
//         const responseSheet = workbook.addWorksheet(sheetName);

//         // Parse data
//         const studyDefinition =
//           typeof row['Study Definition'] === 'string'
//             ? JSON.parse(row['Study Definition'])
//             : row['Study Definition'];

//         const responseData =
//           typeof row['Response Data'] === 'string'
//             ? JSON.parse(row['Response Data'])
//             : row['Response Data'];

//         // Add formatted Q&A
//         addFormattedQAToSheet(
//           responseSheet,
//           studyDefinition,
//           responseData,
//           row
//         );
//       });

//       // Create All Responses Sheet (Matrix View)
//       const allResponsesSheet = workbook.addWorksheet('All Responses Matrix');
//       createMatrixView(allResponsesSheet, rows);

//       // Set response headers
//       res.setHeader(
//         'Content-Type',
//         'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
//       );
//       res.setHeader(
//         'Content-Disposition',
//         `attachment; filename=study_export_${status}_${Date.now()}.xlsx`
//       );

//       // Write to response
//       await workbook.xlsx.write(res);
//       res.end();

//       console.log('Study data exported successfully.', req.user);

//       // Audit log
//       await auditlogsControllers.setAuditLogs(req, {
//         email: req.user ? req.user.email : 'Unknown',
//         module_name: LOG_MODULES.STUDY_MANAGEMENT,
//         action_type: 'export',
//         remark: `User exported ${status} study data for ${rows.length} responses.`,
//       });
//     } catch (error) {
//       console.error('Error exporting study data:', error);
//       return res.status(500).json({
//         success: false,
//         message: 'Failed to export study data',
//       });
//     }
//   },
// };

// // Helper function to add formatted Q&A to sheet
// function addFormattedQAToSheet(
//   sheet,
//   studyDefinition,
//   responseData,
//   participantInfo
// ) {
//   // Set column widths
//   sheet.columns = [
//     { header: 'Question', key: 'question', width: 70 },
//     { header: 'Answer', key: 'answer', width: 50 },
//   ];

//   // Add participant header information
//   const headerStyle = {
//     font: { bold: true, size: 12 },
//     fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'E0E0E0' } },
//   };

//   sheet.addRow(['PARTICIPANT INFORMATION', '']).font = { bold: true, size: 14 };
//   sheet.addRow(['Full Name', participantInfo['Full Name'] || 'N/A']);
//   sheet.addRow(['Email', participantInfo['Email'] || 'N/A']);
//   sheet.addRow(['Contact Number', participantInfo['Contact Number'] || 'N/A']);
//   sheet.addRow(['Site Name', participantInfo['Site Name'] || 'N/A']);
//   sheet.addRow([
//     'Status',
//     participantInfo['Submitted At'] ? 'Submitted' : 'Draft',
//   ]);
//   sheet.addRow([
//     'Submitted At',
//     participantInfo['Submitted At'] || 'Not Submitted',
//   ]);
//   sheet.addRow(['', '']); // Empty row for spacing

//   // Style participant info rows
//   for (let i = 1; i <= 7; i++) {
//     if (i === 1) {
//       sheet.getRow(i).font = { bold: true, size: 14 };
//       sheet.getRow(i).fill = {
//         type: 'pattern',
//         pattern: 'solid',
//         fgColor: { argb: '4472C4' },
//       };
//     } else if (i <= 7) {
//       sheet.getRow(i).getCell(1).font = { bold: true };
//     }
//   }

//   // Add main headers
//   const headerRow = sheet.addRow(['Question', 'Answer']);
//   headerRow.font = { bold: true, color: { argb: 'FFFFFF' } };
//   headerRow.fill = {
//     type: 'pattern',
//     pattern: 'solid',
//     fgColor: { argb: '4472C4' },
//   };

//   // Process sections and questions
//   const sections =
//     studyDefinition.study?.sections || studyDefinition.sections || [];

//   sections.forEach((section, sectionIndex) => {
//     // Add section header
//     const sectionRow = sheet.addRow([
//       `SECTION ${sectionIndex + 1}: ${section.title}`,
//       '',
//     ]);
//     sectionRow.font = { bold: true, italic: true };
//     sectionRow.fill = {
//       type: 'pattern',
//       pattern: 'solid',
//       fgColor: { argb: 'F0F0F0' },
//     };

//     // Add questions and answers
//     section.questions.forEach((question) => {
//       const answer = responseData[question.id];
//       const formattedAnswer = formatAnswerForDisplay(question, answer);

//       const row = sheet.addRow([question.text, formattedAnswer]);

//       // Highlight unanswered questions
//       if (!answer || (Array.isArray(answer) && answer.length === 0)) {
//         row.getCell(2).fill = {
//           type: 'pattern',
//           pattern: 'solid',
//           fgColor: { argb: 'FFE0E0' }, // Light red for unanswered
//         };
//         row.getCell(2).font = { italic: true, color: { argb: 'CC0000' } };
//       }

//       // Wrap text for better readability
//       row.getCell(1).alignment = { wrapText: true, vertical: 'top' };
//       row.getCell(2).alignment = { wrapText: true, vertical: 'top' };
//     });

//     // Add empty row between sections
//     sheet.addRow(['', '']);
//   });

//   // Add completion summary at the end
//   const totalQuestions = sections.reduce(
//     (sum, section) => sum + section.questions.length,
//     0
//   );
//   const answeredQuestions = sections.reduce((sum, section) => {
//     return (
//       sum +
//       section.questions.filter((q) => {
//         const answer = responseData[q.id];
//         return (
//           answer !== null &&
//           answer !== undefined &&
//           (Array.isArray(answer) ? answer.length > 0 : answer !== '')
//         );
//       }).length
//     );
//   }, 0);

//   const completionRow = sheet.addRow([
//     'COMPLETION STATUS',
//     `${answeredQuestions}/${totalQuestions} questions answered (${Math.round(
//       (answeredQuestions / totalQuestions) * 100
//     )}%)`,
//   ]);
//   completionRow.font = { bold: true };
//   completionRow.fill = {
//     type: 'pattern',
//     pattern: 'solid',
//     fgColor: { argb: 'D0D0D0' },
//   };
// }

// // Helper function to format answers for display
// function formatAnswerForDisplay(question, answer) {
//   if (answer === null || answer === undefined || answer === '') {
//     return 'Not Answered';
//   }

//   switch (question.type) {
//     case 'checkbox':
//       if (Array.isArray(answer)) {
//         if (answer.length === 0) return 'None selected';
//         return answer.map((item, index) => `${index + 1}. ${item}`).join('\n');
//       }
//       return answer ? '✓ Checked' : '✗ Unchecked';

//     case 'radio':
//       return String(answer);

//     case 'number':
//       return String(answer);

//     case 'text':
//       return String(answer);

//     case 'rating':
//       const max = question.scale?.max || 5;
//       const stars = '★'.repeat(answer) + '☆'.repeat(max - answer);
//       return `${answer} / ${max} ${stars}`;

//     default:
//       if (Array.isArray(answer)) {
//         return answer.join(', ');
//       }
//       return String(answer);
//   }
// }

// // Helper function to create matrix view
// function createMatrixView(sheet, rows) {
//   if (rows.length === 0) return;

//   // Parse the first row to get all questions
//   const firstDefinition =
//     typeof rows[0]['Study Definition'] === 'string'
//       ? JSON.parse(rows[0]['Study Definition'])
//       : rows[0]['Study Definition'];

//   const sections =
//     firstDefinition.study?.sections || firstDefinition.sections || [];

//   // Create headers
//   const headers = [
//     'Participant Name',
//     'Email',
//     'Contact',
//     'Site',
//     'Status',
//     'Submitted At',
//   ];

//   // Create a map of questions
//   const questionMap = new Map();
//   const questionHeaders = [];

//   sections.forEach((section) => {
//     section.questions.forEach((question) => {
//       const headerText = `${section.title.substring(
//         0,
//         20
//       )} - ${question.text.substring(0, 40)}...`;
//       headers.push(headerText);
//       questionHeaders.push({
//         id: question.id,
//         text: question.text,
//         type: question.type,
//         section: section.title,
//       });
//       questionMap.set(question.id, headers.length - 1);
//     });
//   });

//   // Set columns with auto width
//   sheet.columns = headers.map((header, index) => ({
//     header: header,
//     key: `col${index}`,
//     width: index < 6 ? 20 : 30,
//   }));

//   // Style header row
//   const headerRow = sheet.getRow(1);
//   headerRow.font = { bold: true, color: { argb: 'FFFFFF' } };
//   headerRow.fill = {
//     type: 'pattern',
//     pattern: 'solid',
//     fgColor: { argb: '4472C4' },
//   };
//   headerRow.alignment = {
//     vertical: 'middle',
//     horizontal: 'center',
//     wrapText: true,
//   };
//   headerRow.height = 30;

//   // Add data rows
//   rows.forEach((row, rowIndex) => {
//     const responseData =
//       typeof row['Response Data'] === 'string'
//         ? JSON.parse(row['Response Data'])
//         : row['Response Data'];

//     const dataRow = [
//       row['Full Name'] || 'N/A',
//       row['Email'] || 'N/A',
//       row['Contact Number'] || 'N/A',
//       row['Site Name'] || 'N/A',
//       row['Submitted At'] ? 'Submitted' : 'Draft',
//       row['Submitted At'] || 'Not Submitted',
//     ];

//     // Add answers for each question
//     questionHeaders.forEach((qHeader) => {
//       const answer = responseData[qHeader.id];
//       dataRow.push(formatAnswerForDisplay(qHeader, answer));
//     });

//     const excelRow = sheet.addRow(dataRow);

//     // Alternate row colors
//     if (rowIndex % 2 === 0) {
//       excelRow.fill = {
//         type: 'pattern',
//         pattern: 'solid',
//         fgColor: { argb: 'F5F5F5' },
//       };
//     }

//     // Wrap text in cells
//     excelRow.alignment = { wrapText: true, vertical: 'top' };
//   });

//   // Add borders to all cells
//   sheet.eachRow((row, rowNumber) => {
//     row.eachCell((cell) => {
//       cell.border = {
//         top: { style: 'thin' },
//         left: { style: 'thin' },
//         bottom: { style: 'thin' },
//         right: { style: 'thin' },
//       };
//     });
//   });
// }

// module.exports = studyResponseController;

const db = require('../../config/database');
const { LOG_MODULES } = require('../../utils/constants');
const ExcelJS = require('exceljs'); // npm install exceljs
const auditlogsControllers = require('../auditlogs/auditlogs.controller');

const studyResponseController = {
  summary: async (req, res) => {
    try {
      // Fetch study summary from the database
      const [statsRows] = await db.query(`
        SELECT 
          COUNT(*) AS totalSubmissions,
          SUM(CASE WHEN status = 'draft' THEN 1 ELSE 0 END) AS totalDrafts,
          SUM(CASE WHEN status = 'submitted' THEN 1 ELSE 0 END) AS totalCompleted
        FROM study_response
      `);

      // Get total sites (separate query)
      const [totalSitesRows] = await db.query(
        `SELECT COUNT(*) AS totalSites FROM sp_site_master`
      );

      // Safely extract the single-row stats and attach totalSites
      const statsRow =
        statsRows && statsRows[0]
          ? statsRows[0]
          : {
              totalSubmissions: 0,
              totalDrafts: 0,
              totalCompleted: 0,
            };

      statsRow.totalSites =
        totalSitesRows && totalSitesRows[0] && totalSitesRows[0].totalSites
          ? Number(totalSitesRows[0].totalSites)
          : 0;

      const stats = {
        totalSubmissions: Number(statsRow.totalSubmissions) || 0,
        totalDrafts: Number(statsRow.totalDrafts) || 0,
        totalCompleted: Number(statsRow.totalCompleted) || 0,
        totalSites: statsRow.totalSites,
      };

      const [graphRows] = await db.query(`
        WITH RECURSIVE date_range AS (
          SELECT CURDATE() - INTERVAL 6 DAY AS date
          UNION ALL
          SELECT DATE_ADD(date, INTERVAL 1 DAY)
          FROM date_range
          WHERE DATE_ADD(date, INTERVAL 1 DAY) <= CURDATE()
        )
        SELECT 
          d.date,
          COALESCE(SUM(CASE WHEN s.status = 'draft' THEN 1 ELSE 0 END), 0) AS drafts,
          COALESCE(SUM(CASE WHEN s.status = 'submitted' THEN 1 ELSE 0 END), 0) AS submitted,
          COALESCE(COUNT(s.response_id), 0) AS total
        FROM date_range d
        LEFT JOIN study_response s 
          ON (
            (s.status = 'draft' AND DATE(s.created_at) = d.date)
            OR
            (s.status = 'submitted' AND DATE(s.submitted_at) = d.date)
          )
        GROUP BY d.date
        ORDER BY d.date
      `);

      // Normalize/format graph data (ensure date is a string YYYY-MM-DD)
      const graphData = (graphRows || []).map((r) => {
        let dateVal = r.date;
        // MySQL driver can return Date objects or strings depending on config.
        if (dateVal instanceof Date) {
          dateVal = dateVal.toISOString().split('T')[0];
        } else if (typeof dateVal === 'string' && dateVal.includes(' ')) {
          // If the driver returns a datetime-like string, keep only the date part
          dateVal = dateVal.split(' ')[0];
        }
        return {
          date: dateVal,
          drafts: Number(r.drafts) || 0,
          submitted: Number(r.submitted) || 0,
          total: Number(r.total) || 0,
        };
      });

      return res.status(200).json({
        success: true,
        data: { stats, graphData },
      });
    } catch (error) {
      console.error('Error fetching study summary:', error);
      return res.status(500).json({
        success: false,
        message: 'Failed to fetch study summary',
      });
    }
  },

  recentStudySubmissions: async (req, res) => {
    try {
      const [rows] = await db.query(`
        SELECT
          sr.submitted_at,
          u.full_name,
          u.email_address AS email,
          u.contact_number,
          s.site_name,
          st.study_title
        FROM study_response sr
        LEFT JOIN sp_user_master u ON sr.user_id = u.user_id
        LEFT JOIN sp_studies st ON sr.study_id = st.study_id
        LEFT JOIN sp_site_master s ON s.site_id = u.site_id
        WHERE sr.status = 'submitted'
        ORDER BY sr.submitted_at DESC;
      `);

      return res.status(200).json({
        success: true,
        data: rows,
      });
    } catch (error) {
      console.error('Error fetching recent study submissions:', error);
      return res.status(500).json({
        success: false,
        message: 'Failed to fetch recent study submissions',
      });
    }
  },

  totalStudyReports: async (req, res) => {
    try {
      const [data] = await db.query(`
        SELECT COUNT(*) AS total,
        SUM(CASE WHEN status = 'draft' THEN 1 ELSE 0 END) AS totalDrafts,
        SUM(CASE WHEN status = 'submitted' THEN 1 ELSE 0 END) AS totalCompleted
        FROM study_response;
      `);
      return res.status(200).json({
        success: true,
        data: data[0],
      });
    } catch (error) {
      console.error('Error fetching total study reports:', error);
      return res.status(500).json({
        success: false,
        message: 'Failed to fetch total study reports',
      });
    }
  },

  exportStudyData: async (req, res) => {
    let status = req.body.type; // 'draft' or 'submitted'
    const studyId = req.body.studyId; // Optional: specific study filter

    if (status !== 'draft' && status !== 'submitted') {
      return res.status(400).json({
        success: false,
        message: 'Invalid status type',
      });
    }

    try {
      // Build query with optional study filter
      let query = `
        SELECT
          sr.response_id,
          sr.study_id,
          sr.submitted_at AS 'Submitted At',
          u.full_name AS 'Full Name',
          u.email_address AS 'Email',
          u.contact_number AS 'Contact Number',
          s.site_name AS 'Site Name',
          st.study_title AS 'Study Title',
          st.study_number AS 'Study Number',
          sr.response_data AS 'Response Data',
          st.study_definition AS 'Study Definition'
        FROM study_response sr
        LEFT JOIN sp_user_master u ON sr.user_id = u.user_id
        LEFT JOIN sp_studies st ON sr.study_id = st.study_id
        LEFT JOIN sp_site_master s ON s.site_id = u.site_id
        WHERE sr.status = ?
      `;

      const queryParams = [status];

      if (studyId) {
        query += ' AND sr.study_id = ?';
        queryParams.push(studyId);
      }

      query += ' ORDER BY st.study_id, sr.submitted_at DESC';

      const [rows] = await db.query(query, queryParams);

      if (rows.length === 0) {
        return res.status(404).json({
          success: false,
          message: `No ${status} study responses found`,
        });
      }

      // Group responses by study
      const studiesMap = groupResponsesByStudy(rows);

      // Create Excel workbook
      const workbook = new ExcelJS.Workbook();

      // Add metadata
      workbook.creator = req.user ? req.user.email : 'System';
      workbook.lastModifiedBy = req.user ? req.user.email : 'System';
      workbook.created = new Date();
      workbook.modified = new Date();

      // Create Summary Sheet
      createSummarySheet(workbook, studiesMap, status);

      // Create sheets for each study
      studiesMap.forEach((studyData, studyId) => {
        createStudySheets(workbook, studyData);
      });

      // Create Combined All Responses Sheet (if multiple studies)
      if (studiesMap.size > 1) {
        createCombinedSheet(workbook, studiesMap);
      }

      // Set response headers
      res.setHeader(
        'Content-Type',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      );
      res.setHeader(
        'Content-Disposition',
        `attachment; filename=study_export_${status}_${Date.now()}.xlsx`
      );

      // Write to response
      await workbook.xlsx.write(res);
      res.end();

      console.log('Study data exported successfully.', req.user);

      // Audit log
      await auditlogsControllers.setAuditLogs(req, {
        email: req.user ? req.user.email : 'Unknown',
        module_name: LOG_MODULES.STUDY_MANAGEMENT,
        action_type: 'export',
        remark: `User exported ${status} study data for ${rows.length} responses across ${studiesMap.size} studies.`,
      });
    } catch (error) {
      console.error('Error exporting study data:', error);
      return res.status(500).json({
        success: false,
        message: 'Failed to export study data',
      });
    }
  },
};

// Helper function to group responses by study
function groupResponsesByStudy(rows) {
  const studiesMap = new Map();

  rows.forEach((row) => {
    const studyId = row.study_id;

    if (!studiesMap.has(studyId)) {
      // Parse study definition once per study
      const studyDefinition =
        typeof row['Study Definition'] === 'string'
          ? JSON.parse(row['Study Definition'])
          : row['Study Definition'];

      studiesMap.set(studyId, {
        studyId: studyId,
        studyTitle: row['Study Title'],
        studyNumber: row['Study Number'],
        studyDefinition: studyDefinition,
        responses: [],
      });
    }

    studiesMap.get(studyId).responses.push(row);
  });

  return studiesMap;
}

// Create summary sheet with all studies overview
function createSummarySheet(workbook, studiesMap, status) {
  const summarySheet = workbook.addWorksheet('Summary');

  summarySheet.columns = [
    { header: 'Field', key: 'field', width: 30 },
    { header: 'Value', key: 'value', width: 60 },
  ];

  // Style headers
  const headerRow = summarySheet.getRow(1);
  headerRow.font = { bold: true, color: { argb: 'FFFFFF' } };
  headerRow.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: '4472C4' },
  };

  // Add summary data
  summarySheet.addRow({ field: 'Export Type', value: status.toUpperCase() });
  summarySheet.addRow({
    field: 'Export Date',
    value: new Date().toLocaleString(),
  });
  summarySheet.addRow({ field: 'Total Studies', value: studiesMap.size });
  summarySheet.addRow({ field: '', value: '' }); // Empty row

  // Add study-wise breakdown
  const studyBreakdownRow = summarySheet.addRow({
    field: 'STUDY BREAKDOWN',
    value: '',
  });
  studyBreakdownRow.font = { bold: true };

  let totalResponses = 0;
  studiesMap.forEach((studyData) => {
    totalResponses += studyData.responses.length;
    summarySheet.addRow({
      field: studyData.studyTitle,
      value: `${studyData.responses.length} responses (Study #${studyData.studyNumber})`,
    });
  });

  summarySheet.addRow({ field: '', value: '' }); // Empty row
  const totalRow = summarySheet.addRow({
    field: 'TOTAL RESPONSES',
    value: totalResponses,
  });
  totalRow.font = { bold: true };
}

// Create sheets for each study
function createStudySheets(workbook, studyData) {
  const studyTitle = studyData.studyTitle || 'Unknown Study';
  const safeStudyTitle = studyTitle
    .substring(0, 20)
    .replace(/[\\\/\?\*\[\]]/g, '_');

  // Create a divider sheet for the study
  const studyDividerSheet = workbook.addWorksheet(`Study_${safeStudyTitle}`);
  createStudyDividerSheet(studyDividerSheet, studyData);

  // Create individual response sheets for this study
  studyData.responses.forEach((response, index) => {
    const participantName = response['Full Name'] || `Participant_${index + 1}`;
    const sheetName = `${safeStudyTitle}_${index + 1}`
      .substring(0, 31)
      .replace(/[\\\/\?\*\[\]]/g, '_');
    const responseSheet = workbook.addWorksheet(sheetName);

    const responseData =
      typeof response['Response Data'] === 'string'
        ? JSON.parse(response['Response Data'])
        : response['Response Data'];

    addFormattedQAToSheet(
      responseSheet,
      studyData.studyDefinition,
      responseData,
      response,
      studyData.studyTitle
    );
  });

  // Create matrix view for this study
  const matrixSheetName = `${safeStudyTitle}_Matrix`.substring(0, 31);
  const matrixSheet = workbook.addWorksheet(matrixSheetName);
  createStudyMatrixView(matrixSheet, studyData);
}

// Create study divider sheet
function createStudyDividerSheet(sheet, studyData) {
  sheet.columns = [
    { header: 'Study Information', key: 'field', width: 30 },
    { header: 'Details', key: 'value', width: 60 },
  ];

  // Style header
  const headerRow = sheet.getRow(1);
  headerRow.font = { bold: true, size: 14, color: { argb: 'FFFFFF' } };
  headerRow.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: '4472C4' },
  };
  headerRow.height = 25;

  // Add study information
  sheet.addRow({ field: 'Study Title', value: studyData.studyTitle });
  sheet.addRow({ field: 'Study Number', value: studyData.studyNumber });
  sheet.addRow({ field: 'Total Responses', value: studyData.responses.length });
  sheet.addRow({ field: '', value: '' });

  // Add section breakdown
  const sections =
    studyData.studyDefinition.study?.sections ||
    studyData.studyDefinition.sections ||
    [];
  const sectionHeaderRow = sheet.addRow({ field: 'SECTIONS', value: '' });
  sectionHeaderRow.font = { bold: true };

  sections.forEach((section, index) => {
    sheet.addRow({
      field: `Section ${index + 1}`,
      value: `${section.title} (${section.questions.length} questions)`,
    });
  });

  sheet.addRow({ field: '', value: '' });
  const participantHeaderRow = sheet.addRow({
    field: 'PARTICIPANTS',
    value: '',
  });
  participantHeaderRow.font = { bold: true };

  // List participants
  studyData.responses.forEach((response, index) => {
    sheet.addRow({
      field: `Participant ${index + 1}`,
      value: `${response['Full Name']} (${response['Email']}) - ${
        response['Submitted At'] ? 'Submitted' : 'Draft'
      }`,
    });
  });
}

// Add formatted Q&A to sheet with study context
function addFormattedQAToSheet(
  sheet,
  studyDefinition,
  responseData,
  participantInfo,
  studyTitle
) {
  // Set column widths
  sheet.columns = [
    { header: 'Question', key: 'question', width: 70 },
    { header: 'Answer', key: 'answer', width: 50 },
  ];

  // Add study and participant header information
  const studyHeaderRow = sheet.addRow(['STUDY INFORMATION', '']);
  studyHeaderRow.font = { bold: true, size: 14 };
  sheet.addRow(['Study Title', studyTitle]);
  sheet.addRow(['', '']); // Empty row

  const participantHeaderRow = sheet.addRow(['PARTICIPANT INFORMATION', '']);
  participantHeaderRow.font = { bold: true, size: 14 };
  sheet.addRow(['Full Name', participantInfo['Full Name'] || 'N/A']);
  sheet.addRow(['Email', participantInfo['Email'] || 'N/A']);
  sheet.addRow(['Contact Number', participantInfo['Contact Number'] || 'N/A']);
  sheet.addRow(['Site Name', participantInfo['Site Name'] || 'N/A']);
  sheet.addRow([
    'Status',
    participantInfo['Submitted At'] ? 'Submitted' : 'Draft',
  ]);
  sheet.addRow([
    'Submitted At',
    participantInfo['Submitted At'] || 'Not Submitted',
  ]);
  sheet.addRow(['', '']); // Empty row

  // Style header rows
  sheet.getRow(1).fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: '4472C4' },
  };
  sheet.getRow(4).fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: '4472C4' },
  };

  // Add main headers
  const headerRow = sheet.addRow(['Question', 'Answer']);
  headerRow.font = { bold: true, color: { argb: 'FFFFFF' } };
  headerRow.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: '4472C4' },
  };

  // Process sections and questions
  const sections =
    studyDefinition.study?.sections || studyDefinition.sections || [];
  let totalQuestions = 0;
  let answeredQuestions = 0;

  sections.forEach((section, sectionIndex) => {
    // Add section header
    const sectionRow = sheet.addRow([
      `SECTION ${sectionIndex + 1}: ${section.title}`,
      '',
    ]);
    sectionRow.font = { bold: true, italic: true };
    sectionRow.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'F0F0F0' },
    };

    // Add questions and answers
    section.questions.forEach((question) => {
      totalQuestions++;
      const answer = responseData[question.id];
      const formattedAnswer = formatAnswerForDisplay(question, answer);

      if (
        answer !== null &&
        answer !== undefined &&
        (Array.isArray(answer) ? answer.length > 0 : answer !== '')
      ) {
        answeredQuestions++;
      }

      const row = sheet.addRow([question.text, formattedAnswer]);

      // Highlight unanswered questions
      if (!answer || (Array.isArray(answer) && answer.length === 0)) {
        row.getCell(2).fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FFE0E0' },
        };
        row.getCell(2).font = { italic: true, color: { argb: 'CC0000' } };
      }

      // Wrap text
      row.getCell(1).alignment = { wrapText: true, vertical: 'top' };
      row.getCell(2).alignment = { wrapText: true, vertical: 'top' };
    });

    sheet.addRow(['', '']);
  });

  // Add completion summary
  const completionRow = sheet.addRow([
    'COMPLETION STATUS',
    `${answeredQuestions}/${totalQuestions} questions answered (${Math.round(
      (answeredQuestions / totalQuestions) * 100
    )}%)`,
  ]);
  completionRow.font = { bold: true };
  completionRow.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'D0D0D0' },
  };
}

// Create matrix view for a specific study
function createStudyMatrixView(sheet, studyData) {
  const sections =
    studyData.studyDefinition.study?.sections ||
    studyData.studyDefinition.sections ||
    [];

  // Create headers
  const headers = [
    'Participant Name',
    'Email',
    'Contact',
    'Site',
    'Status',
    'Submitted At',
  ];

  // Add question headers
  const questionHeaders = [];
  sections.forEach((section) => {
    section.questions.forEach((question) => {
      const headerText =
        question.text.length > 50
          ? `${question.text.substring(0, 47)}...`
          : question.text;
      headers.push(headerText);
      questionHeaders.push({
        id: question.id,
        text: question.text,
        type: question.type,
        section: section.title,
      });
    });
  });

  // Set columns
  sheet.columns = headers.map((header, index) => ({
    header: header,
    key: `col${index}`,
    width: index < 6 ? 20 : 35,
  }));

  // Style header row
  const headerRow = sheet.getRow(1);
  headerRow.font = { bold: true, color: { argb: 'FFFFFF' } };
  headerRow.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: '4472C4' },
  };
  headerRow.alignment = {
    vertical: 'middle',
    horizontal: 'center',
    wrapText: true,
  };
  headerRow.height = 40;

  // Add data rows
  studyData.responses.forEach((response, rowIndex) => {
    const responseData =
      typeof response['Response Data'] === 'string'
        ? JSON.parse(response['Response Data'])
        : response['Response Data'];

    const dataRow = [
      response['Full Name'] || 'N/A',
      response['Email'] || 'N/A',
      response['Contact Number'] || 'N/A',
      response['Site Name'] || 'N/A',
      response['Submitted At'] ? 'Submitted' : 'Draft',
      response['Submitted At'] || 'Not Submitted',
    ];

    // Add answers
    questionHeaders.forEach((qHeader) => {
      const answer = responseData[qHeader.id];
      dataRow.push(formatAnswerForDisplay(qHeader, answer));
    });

    const excelRow = sheet.addRow(dataRow);

    // Alternate row colors
    if (rowIndex % 2 === 0) {
      excelRow.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'F5F5F5' },
      };
    }

    excelRow.alignment = { wrapText: true, vertical: 'top' };
  });

  // Add borders
  sheet.eachRow((row, rowNumber) => {
    row.eachCell((cell) => {
      cell.border = {
        top: { style: 'thin' },
        left: { style: 'thin' },
        bottom: { style: 'thin' },
        right: { style: 'thin' },
      };
    });
  });
}

// Create combined sheet for all studies
function createCombinedSheet(workbook, studiesMap) {
  const combinedSheet = workbook.addWorksheet('All Studies Combined');

  const headers = [
    'Study Title',
    'Study Number',
    'Participant Name',
    'Email',
    'Contact',
    'Site',
    'Status',
    'Submitted At',
    'Completion %',
  ];

  combinedSheet.columns = headers.map((header) => ({
    header: header,
    key: header.toLowerCase().replace(/ /g, '_'),
    width: 20,
  }));

  // Style header
  const headerRow = combinedSheet.getRow(1);
  headerRow.font = { bold: true, color: { argb: 'FFFFFF' } };
  headerRow.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: '4472C4' },
  };

  // Add data from all studies
  studiesMap.forEach((studyData) => {
    const sections =
      studyData.studyDefinition.study?.sections ||
      studyData.studyDefinition.sections ||
      [];
    const totalQuestions = sections.reduce(
      (sum, section) => sum + section.questions.length,
      0
    );

    studyData.responses.forEach((response) => {
      const responseData =
        typeof response['Response Data'] === 'string'
          ? JSON.parse(response['Response Data'])
          : response['Response Data'];

      // Calculate completion
      let answeredQuestions = 0;
      sections.forEach((section) => {
        section.questions.forEach((question) => {
          const answer = responseData[question.id];
          if (
            answer !== null &&
            answer !== undefined &&
            (Array.isArray(answer) ? answer.length > 0 : answer !== '')
          ) {
            answeredQuestions++;
          }
        });
      });

      const completionPercentage =
        totalQuestions > 0
          ? Math.round((answeredQuestions / totalQuestions) * 100)
          : 0;

      combinedSheet.addRow({
        study_title: studyData.studyTitle,
        study_number: studyData.studyNumber,
        participant_name: response['Full Name'] || 'N/A',
        email: response['Email'] || 'N/A',
        contact: response['Contact Number'] || 'N/A',
        site: response['Site Name'] || 'N/A',
        status: response['Submitted At'] ? 'Submitted' : 'Draft',
        submitted_at: response['Submitted At'] || 'Not Submitted',
        'completion_%': `${completionPercentage}%`,
      });
    });
  });

  // Add borders
  combinedSheet.eachRow((row, rowNumber) => {
    row.eachCell((cell) => {
      cell.border = {
        top: { style: 'thin' },
        left: { style: 'thin' },
        bottom: { style: 'thin' },
        right: { style: 'thin' },
      };
    });
  });
}

// Helper function to format answers
function formatAnswerForDisplay(question, answer) {
  if (answer === null || answer === undefined || answer === '') {
    return 'Not Answered';
  }

  switch (question.type) {
    case 'checkbox':
      if (Array.isArray(answer)) {
        if (answer.length === 0) return 'None selected';
        return answer.map((item, index) => `${index + 1}. ${item}`).join('\n');
      }
      return answer ? 'Checked' : 'Not Checked';

    case 'radio':
      return String(answer);

    case 'number':
      return String(answer);

    case 'text':
      return String(answer);

    case 'rating':
      const max = question.scale?.max || 5;
      return `${answer} / ${max}`;

    default:
      if (Array.isArray(answer)) {
        return answer.join(', ');
      }
      return String(answer);
  }
}

module.exports = studyResponseController;
