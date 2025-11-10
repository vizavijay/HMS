const express = require('express');
const router = express.Router();
const db = require('../config/database');
const { authenticateToken } = require('../middleware/auth');

router.use(authenticateToken);

router.post('/create', async (req, res) => {
  const {
    subject_initials,
    study_id,
    site_id,
    enrollment_date,
    enrollment_status,
  } = req.body;

  // Basic validation
  if (!subject_initials || !study_id || !site_id) {
    return res.status(400).json({
      success: false,
      message: 'Missing required fields: subject_initials, study_id or site_id',
    });
  }

  try {
    // Use promise-based pool (db is mysql2 promise pool)
    const [result] = await db.query(
      'INSERT INTO std_subjects(subject_initials, study_id, site_id, enrollment_date, enrollment_status) VALUES (?, ?, ?, ?, ?);',
      [subject_initials, study_id, site_id, enrollment_date, enrollment_status]
    );

    return res.status(201).json({
      success: true,
      message: 'Subject created successfully',
    });
  } catch (err) {
    // Log the full error internally, but return a safe message to the client
    console.error('Error creating subject:', err);
    // Distinguish common DB errors if possible
    if (err && err.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({
        success: false,
        message: 'Duplicate entry',
        error: err.message,
      });
    }

    return res.status(500).json({
      success: false,
      message: 'Failed to create subject',
      error: err && err.message ? err.message : 'Internal server error',
    });
  }
});

// Export router
module.exports = router;
