/**
 * routes/studyRoutes.js
 *
 * Refactored from the original single-file implementation to:
 * - Extract small helper functions for clarity and reuse
 * - Fix bugs (e.g. reading response_data for audit logs)
 * - Improve stored-procedure result handling
 * - Keep email sending asynchronous and non-blocking
 * - Improve validation and error messages
 *
 * Notes:
 * - This file still expects a `req.db` instance (mysql2-like) set by middleware.
 * - `setAuditLogs` and `sendSurveySubmissionEmail` are used from external controllers/config.
 */

const express = require('express');
const router = express.Router();

const { sendSurveySubmissionEmail } = require('../config/email');
const {
  setAuditLogs,
} = require('../controllers/auditlogs/auditlogs.controller');
const { authenticateToken } = require('../middleware/auth');
const auditlogsControllers = require('../controllers/auditlogs/auditlogs.controller');
const { LOG_MODULES } = require('../utils/constants');

/**
 * Helper: run a query using req.db, returning the first-level rows.
 * This wraps the mysql2 .query result shapes (which can vary).
 */
async function runQuery(db, sql, params = []) {
  const result = await db.query(sql, params);
  // mysql2 can return either [rows, fields] or [[rows], ...] for CALL
  return result && result[0] ? result[0] : result;
}

/**
 * Get the latest response (if any) for a user & study.
 * Returns null if not found.
 */
async function getLatestResponse(db, userId, studyId) {
  const [rows] = await db.query(
    `SELECT response_id, response_data, status, submitted_at, last_updated_at
     FROM study_response
     WHERE user_id = ? AND study_id = ?
     ORDER BY last_updated_at DESC
     LIMIT 1`,
    [userId, studyId]
  );
  return rows && rows.length > 0 ? rows[0] : null;
}

/**
 * Fetch study definition:
 * - If user already submitted -> fetch from sp_studies (bypass stored proc)
 * - Otherwise -> call stored procedure get_study_for_user(studyId, userId)
 *
 * Returns study definition object, or throws an Error when not found / unauthorized.
 */
async function fetchStudyDefinition(db, studyId, userId, isSubmitted) {
  if (isSubmitted) {
    const [rows] = await db.query(
      `SELECT * FROM sp_studies WHERE study_id = ?`,
      [studyId]
    );
    if (!rows || rows.length === 0) {
      throw new Error('Study not found or inactive');
    }
    return rows[0];
  } else {
    // CALL returns an array of resultsets; the first element is usually the desired rows.
    const result = await db.query('CALL get_study_for_user(?, ?)', [
      studyId,
      userId,
    ]);
    // result === [ [rows], [fields], ... ] (depending on mysql2)
    const rows =
      Array.isArray(result) && Array.isArray(result[0]) ? result[0] : result;
    if (!rows || rows.length === 0) {
      throw new Error('Study not found or user not authorized');
    }
    // When stored procedure returns several rows, we assume the first row contains study_definition
    return rows[0];
  }
}

/**
 * Safe JSON parse helper for response_data fields which may be strings.
 */
function parseResponseData(value) {
  if (value == null) return null;
  if (typeof value === 'object') return value;
  try {
    return JSON.parse(value);
  } catch {
    // If parsing fails, return raw value (string)
    return value;
  }
}

/* =========================
   ROUTES
   ========================= */

/**
 * GET /study/:userId/:studyId
 * Returns study_definition, latest draft_response (if any), and status
 */

router.use(authenticateToken);

router.get('/study/:userId/:studyId', async (req, res) => {
  const { userId, studyId } = req.params;
  console.log('Fetching study for user:', userId, 'study:', studyId);
  if (!userId || !studyId) {
    return res
      .status(400)
      .json({ success: false, message: 'Missing userId or studyId in params' });
  }

  try {
    // 1) Check latest response status/draft
    const latest = await getLatestResponse(req.db, userId, studyId);
    const responseStatus = latest ? latest.status : null;
    const draftResponse = latest
      ? parseResponseData(latest.response_data)
      : null;

    // 2) Fetch study definition (bypass stored proc when already submitted)
    const isSubmitted = responseStatus === 'submitted';
    const studyDefinition = await fetchStudyDefinition(
      req.db,
      studyId,
      userId,
      isSubmitted
    );

    return res.status(200).json({
      success: true,
      data: {
        study_definition: studyDefinition,
        draft_response: draftResponse,
        status: responseStatus,
      },
    });
  } catch (err) {
    // log internal details but return a generic message
    console.error('Error in GET /study:', err);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch study data',
      error: err.message,
    });
  }
});

/**
 * POST /submit-survey
 * Body: { userId, studyId, responseData }
 *
 * Behaviour:
 * - Prevent duplicate submissions if a 'submitted' row exists
 * - Update existing draft -> submitted, or create new submitted row
 * - Send confirmation email asynchronously (non-blocking)
 */
router.post('/submit-survey', async (req, res) => {
  const { userId, studyId, responseData } = req.body;

  if (!userId || !studyId || responseData == null) {
    return res.status(400).json({
      success: false,
      message: 'Missing required fields: userId, studyId, or responseData',
    });
  }

  try {
    const latest = await getLatestResponse(req.db, userId, studyId);

    if (latest && latest.status === 'submitted') {
      return res.status(409).json({
        success: false,
        message:
          'Survey has already been submitted. Duplicate submissions are not allowed.',
        alreadySubmitted: true,
      });
    }

    let responseId;
    if (latest) {
      // update existing row
      const updateSql = `
        UPDATE study_response
        SET response_data = ?, status = 'submitted', submitted_at = NOW(), last_updated_at = NOW()
        WHERE response_id = ?
      `;
      await req.db.query(updateSql, [
        JSON.stringify(responseData),
        latest.response_id,
      ]);
      responseId = latest.response_id;

      // Audit: log update (old_value available from latest.response_data)

      await auditlogsControllers.setAuditLogs(req, {
        user_id: userId,
        module_name: LOG_MODULES.STUDY_MANAGEMENT,
        action_type: 'Create',
        remark: 'Survey  submitted successfully',
      });
    } else {
      // insert new submission
      const insertSql = `
        INSERT INTO study_response (study_id, user_id, response_data, status, submitted_at, last_updated_at)
        VALUES (?, ?, ?, 'submitted', NOW(), NOW())
      `;
      const [result] = await req.db.query(insertSql, [
        studyId,
        userId,
        JSON.stringify(responseData),
      ]);
      responseId = result.insertId;
    }

    // send confirmation email asynchronously; do not await
    (async () => {
      try {
        const [userRows] = await req.db.query(
          'SELECT email_address, full_name FROM sp_user_master WHERE user_id = ?',
          [userId]
        );
        const [studyRows] = await req.db.query(
          'SELECT study_title, study_number FROM sp_studies WHERE study_id = ?',
          [studyId]
        );

        if (
          userRows &&
          userRows.length > 0 &&
          studyRows &&
          studyRows.length > 0
        ) {
          const userEmail = userRows[0].email_address;
          const fullName = userRows[0].full_name;
          const studyTitle = studyRows[0].study_title || 'Clinical Study';
          const studyNumber = studyRows[0].study_number || 'N/A';

          await sendSurveySubmissionEmail(
            userEmail,
            fullName,
            studyNumber,
            studyTitle
          );
          // console.log left out to avoid noisy logs in production environments
        } else {
          console.warn(
            'User or Study info not found; skipping submission email'
          );
        }
      } catch (emailErr) {
        console.error(
          'Failed to send confirmation email (non-fatal):',
          emailErr && emailErr.message
        );
      }
    })();

    return res.status(latest ? 200 : 201).json({
      success: true,
      message: 'Survey submitted successfully',
      responseId,
    });
  } catch (err) {
    console.error('Error in POST /submit-survey:', err);
    return res.status(500).json({
      success: false,
      message: 'Failed to submit survey',
      error: err.message,
    });
  }
});

/**
 * POST /save-draft
 * Body: { userId, studyId, responseData }
 *
 * - Prevent saving drafts if already submitted
 * - Update existing draft or insert new draft
 * - Create audit log for updates (if possible)
 */
router.post('/save-draft', async (req, res) => {
  const { userId, studyId, responseData } = req.body;

  if (!userId || !studyId || responseData == null) {
    return res
      .status(400)
      .json({ success: false, message: 'Missing required fields' });
  }

  try {
    // Select response including response_data so we can use it for audit logging
    const [existingRows] = await req.db.query(
      'SELECT response_id, response_data, status FROM study_response WHERE user_id = ? AND study_id = ? ORDER BY last_updated_at DESC LIMIT 1',
      [userId, studyId]
    );
    const existing =
      existingRows && existingRows.length > 0 ? existingRows[0] : null;

    if (existing && existing.status === 'submitted') {
      return res.status(409).json({
        success: false,
        message: 'Survey already submitted. Cannot save draft.',
        alreadySubmitted: true,
      });
    }

    if (existing) {
      // Update existing draft
      await req.db.query(
        'UPDATE study_response SET response_data = ?, last_updated_at = NOW() WHERE response_id = ?',
        [JSON.stringify(responseData), existing.response_id]
      );

      // Audit log (best effort)
      // update the existing log here
      await auditlogsControllers.setAuditLogs(req, {
        email: req.user ? req.user.email : 'Unknown',
        module_name: LOG_MODULES.STUDY_MANAGEMENT,
        oldValue: existing.response_data,
        newValue: responseData,
        action_type: 'Update',
        remark: 'Draft updated successfully',
      });

      // try {
      //   await setAuditLogs({
      //     user_id: userId,
      //     study_id: studyId,
      //     action: 'UPDATE',
      //     old_value: existing.response_data
      //       ? JSON.stringify(parseResponseData(existing.response_data))
      //       : null,
      //     new_value: JSON.stringify(responseData),
      //     remark: 'Draft updated successfully',
      //   });
      // } catch (auditErr) {
      //   console.warn(
      //     'Audit log failed (non-fatal):',
      //     auditErr && auditErr.message
      //   );
      // }

      return res.status(200).json({
        success: true,
        message: 'Draft updated successfully',
        responseId: existing.response_id,
      });
    } else {
      // Insert new draft row
      const insertSql = `
        INSERT INTO study_response (study_id, user_id, response_data, status, last_updated_at)
        VALUES (?, ?, ?, 'draft', NOW())
      `;
      const [result] = await req.db.query(insertSql, [
        studyId,
        userId,
        JSON.stringify(responseData),
      ]);
      await auditlogsControllers.setAuditLogs(req, {
        email: req.user ? req.user.email : 'Unknown',
        module_name: LOG_MODULES.STUDY_MANAGEMENT,
        oldValue: existing.response_data,
        newValue: responseData,
        action_type: 'Create',
        remark: 'Study Submission created successfully',
      });
      return res.status(201).json({
        success: true,
        message: 'Draft saved successfully',
        responseId: result.insertId,
      });
    }
  } catch (err) {
    console.error('Error in POST /save-draft:', err);
    return res.status(500).json({
      success: false,
      message: 'Failed to save draft',
      error: err.message,
    });
  }
});

/**
 * GET /user-responses/:userId/:studyId
 * Returns the latest response (if any) for a user & study.
 */
router.get('/user-responses/:userId/:studyId', async (req, res) => {
  const { userId, studyId } = req.params;
  if (!userId || !studyId) {
    return res
      .status(400)
      .json({ success: false, message: 'Missing userId or studyId in params' });
  }

  try {
    const latest = await getLatestResponse(req.db, userId, studyId);

    if (!latest) {
      return res.status(200).json({
        success: true,
        data: null,
        hasResponses: false,
      });
    }

    return res.status(200).json({
      success: true,
      data: {
        responseId: latest.response_id,
        responseData: parseResponseData(latest.response_data),
        status: latest.status,
        submittedAt: latest.submitted_at,
        lastUpdatedAt: latest.last_updated_at,
      },
      hasResponses: true,
    });
  } catch (err) {
    console.error('Error in GET /user-responses:', err);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch user responses',
      error: err.message,
    });
  }
});

/**
 * GET /health
 */
router.get('/health', (_req, res) => {
  res.status(200).json({
    success: true,
    message: 'API is running',
    timestamp: new Date().toISOString(),
  });
});

module.exports = router;
