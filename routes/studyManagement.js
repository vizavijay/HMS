const express = require('express');
const router = express.Router();
const db = require('../config/database');
const { authenticateToken } = require('../middleware/auth');

router.use(authenticateToken);

router.get('/dropdown/list', async (req, res) => {
    try {
        const query = `
            SELECT 
                study_id,
                study_title,
                study_number,
                status
            FROM sp_studies
            WHERE status = 'active'
            ORDER BY study_title ASC
        `;

        const [studies] = await db.query(query);

        res.json({
            success: true,
            data: studies
        });

    } catch (error) {
        console.error('Error fetching studies dropdown:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch studies',
            error: error.message
        });
    }
});

module.exports = router;    