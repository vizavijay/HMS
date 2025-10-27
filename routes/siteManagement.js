const express = require('express');
const router = express.Router();
const db = require('../config/database');
const { authenticateToken } = require('../middleware/auth');

// All routes require authentication
router.use(authenticateToken);

// all active sites for dropdown
router.get('/dropdown/list', async (req, res) => {
    try {
        const query = `
            SELECT 
                site_id,
                site_name,
                site_code,
                status
            FROM sp_site_master
            WHERE status = 'Active'
            ORDER BY site_name ASC
        `;

        const [sites] = await db.query(query);

        res.json({
            success: true,
            data: sites
        });

    } catch (error) {
        console.error('Error fetching sites dropdown:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch sites',
            error: error.message
        });
    }
});

module.exports = router;