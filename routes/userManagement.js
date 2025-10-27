const express = require('express');
const router = express.Router();
const db = require('../config/database');
const { sendWelcomeEmail } = require('../config/email');
const { authenticateToken } = require('../middleware/auth');

// All routes require authentication
router.use(authenticateToken);

// get all users with pagination , search and filters
router.post('/list', async (req, res) => {
    try {
        const {
            page = 1,
            limit = 10,
            search = '',
            role_id = null,
            status = null,
            study_id = null,
            site_id = null
        } = req.body;

        const offset = (page - 1) * limit;

        // Build WHERE clause dynamically
        let whereConditions = [];
        let queryParams = [];

        if (search) {
            whereConditions.push(`(
                u.email_address LIKE ? OR 
                u.full_name LIKE ? OR
                u.contact_number LIKE ?
            )`);
            const searchTerm = `%${search}%`;
            queryParams.push(searchTerm, searchTerm, searchTerm);
        }

        if (role_id) {
            whereConditions.push('u.role_id = ?');
            queryParams.push(role_id);
        }

        if (status) {
            whereConditions.push('u.status = ?');
            queryParams.push(status);
        }

        if (study_id) {
            whereConditions.push('u.study_id = ?');
            queryParams.push(study_id);
        }

        if (site_id) {
            whereConditions.push('u.site_id = ?');
            queryParams.push(site_id);
        }

        const whereClause = whereConditions.length > 0
            ? `WHERE ${whereConditions.join(' AND ')}`
            : '';

        // Get total count
        const countQuery = `
            SELECT COUNT(*) as total 
            FROM sp_user_master u
            ${whereClause}
        `;

        const [countResult] = await db.query(countQuery, queryParams);
        const totalRecords = countResult[0].total;
        const totalPages = Math.ceil(totalRecords / limit);

        const dataQuery = `
            SELECT 
                u.user_id,
                u.full_name,
                u.email_address,
                u.contact_number,
                u.status,
                u.created_at,
                u.updated_at,
                r.role_id,
                r.role_name,
                st.study_id,
                st.study_title,
                st.study_number,
                si.site_id,
                si.site_name,
                si.site_code,
                creator.full_name as created_by_name,
                updater.full_name as updated_by_name
            FROM sp_user_master u
            LEFT JOIN sp_role_master r ON u.role_id = r.role_id
            LEFT JOIN sp_studies st ON u.study_id = st.study_id
            LEFT JOIN sp_site_master si ON u.site_id = si.site_id
            LEFT JOIN sp_user_master creator ON u.created_by = creator.user_id
            LEFT JOIN sp_user_master updater ON u.updated_by = updater.user_id
            ${whereClause}
            ORDER BY u.created_at DESC
            LIMIT ? OFFSET ?
        `;

        const dataParams = [...queryParams, limit, offset];
        const [users] = await db.query(dataQuery, dataParams);

        res.json({
            success: true,
            data: users,
            pagination: {
                currentPage: page,
                totalPages,
                totalRecords,
                limit
            }
        });

    } catch (error) {
        console.error('Error fetching users:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch users',
            error: error.message
        });
    }
});

// get user by id
router.get('/:user_id', async (req, res) => {
    try {
        const { user_id } = req.params;

        const query = `
            SELECT 
                u.user_id,
                u.full_name,
                u.email_address,
                u.contact_number,
                u.status,
                u.created_at,
                u.updated_at,
                r.role_id,
                r.role_name,
                r.role_description,
                st.study_id,
                st.study_title,
                st.study_number,
                si.site_id,
                si.site_name,
                si.site_code
            FROM sp_user_master u
            LEFT JOIN sp_role_master r ON u.role_id = r.role_id
            LEFT JOIN sp_studies st ON u.study_id = st.study_id
            LEFT JOIN sp_site_master si ON u.site_id = si.site_id
            WHERE u.user_id = ?
        `;

        const [users] = await db.query(query, [user_id]);

        if (users.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'User not found'
            });
        }

        res.json({
            success: true,
            data: users[0]
        });

    } catch (error) {
        console.error('Error fetching user:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch user',
            error: error.message
        });
    }
});

router.post('/create', async (req, res) => {
    try {
        const {
            full_name,
            email_address,
            contact_number,
            role_id,
            study_id = null,
            site_id = null,
            status = 'Active',
            created_by
        } = req.body;

        console.log('\n📝 === USER CREATION STARTED ===');
        console.log('Request body:', JSON.stringify(req.body, null, 2));

        // Validation
        if (!full_name || !email_address || !contact_number || !role_id) {
            return res.status(400).json({
                success: false,
                message: 'Full name, email, contact number, and role are required'
            });
        }

        // Email validation
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email_address)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid email format'
            });
        }

        // Phone validation (basic)
        const phoneRegex = /^[0-9+\-\s()]{10,20}$/;
        if (!phoneRegex.test(contact_number)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid contact number format'
            });
        }

        // Check if email already exists
        const [existingEmail] = await db.query(
            'SELECT user_id FROM sp_user_master WHERE email_address = ?',
            [email_address]
        );

        if (existingEmail.length > 0) {
            return res.status(409).json({
                success: false,
                message: 'User with this email already exists'
            });
        }

        // Check if contact number already exists
        const [existingPhone] = await db.query(
            'SELECT user_id FROM sp_user_master WHERE contact_number = ?',
            [contact_number]
        );

        if (existingPhone.length > 0) {
            return res.status(409).json({
                success: false,
                message: 'User with this contact number already exists'
            });
        }

        // Insert new user
        const insertQuery = `
            INSERT INTO sp_user_master (
                full_name, email_address, contact_number, 
                role_id, study_id, site_id, status, created_by
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `;

        const [result] = await db.query(insertQuery, [
            full_name,
            email_address,
            contact_number,
            role_id,
            study_id,
            site_id,
            status,
            created_by
        ]);

        console.log(`  User created with ID: ${result.insertId}`);

        // Fetch the newly created user with joined data
        console.log('📊 Fetching user details with JOIN...');

        const [newUser] = await db.query(`
            SELECT 
                u.user_id,
                u.full_name,
                u.email_address,
                u.contact_number,
                u.status,
                r.role_name,
                st.study_title,
                si.site_name
            FROM sp_user_master u
            LEFT JOIN sp_role_master r ON u.role_id = r.role_id
            LEFT JOIN sp_studies st ON u.study_id = st.study_id
            LEFT JOIN sp_site_master si ON u.site_id = si.site_id
            WHERE u.user_id = ?
        `, [result.insertId]);

        //   DEBUG: Show what database returned
        console.log('\n🔍 === DATABASE QUERY RESULT ===');
        console.log('Query returned', newUser.length, 'rows');
        if (newUser.length > 0) {
            console.log('newUser[0]:', JSON.stringify(newUser[0], null, 2));
        } else {
            console.log('  No user data returned!');
        }

        // Log to audit trail
        await db.query(`
            INSERT INTO sp_audit_trail (
                user_id, role_id, module_name, action_type, 
                record_id, old_value, new_value, ip_address
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `, [
            created_by,
            null,
            'User Management',
            'Create',
            result.insertId,
            null,
            JSON.stringify(newUser[0]),
            req.ip
        ]);

        //   EXTRACT ROLE AND SITE NAMES
        const roleName = newUser[0]?.role_name || 'Not Assigned';
        const siteName = newUser[0]?.site_name || 'Not Assigned';

        console.log('\n📧 === EMAIL PREPARATION ===');
        console.log('Recipient Email:', email_address);
        console.log('Recipient Name:', full_name);
        console.log('Role Name:', roleName);
        console.log('Site Name:', siteName);
        console.log('===========================\n');

        //   SEND WELCOME EMAIL TO NEW USER
        console.log(`📧 Sending welcome email to: ${email_address}`);

        sendWelcomeEmail(email_address, full_name, roleName, siteName)
            .then(() => {
                console.log(`  Welcome email sent successfully to: ${email_address}`);
            })
            .catch(err => {
                console.error(`  Failed to send welcome email to ${email_address}`);
                console.error('Error:', err.message);
                console.error('Stack:', err.stack);
            });

        console.log('=== USER CREATION COMPLETED ===\n');

        // Return success response
        res.status(201).json({
            success: true,
            message: 'User created successfully',
            data: newUser[0]
        });

    } catch (error) {

        res.status(500).json({
            success: false,
            message: 'Failed to create user',
            error: error.message
        });
    }
});
// update user
router.put('/:user_id', async (req, res) => {
    try {
        const { user_id } = req.params;
        const {
            full_name,
            email_address,
            contact_number,
            role_id,
            study_id,
            site_id,
            status,
            updated_by
        } = req.body;

        // Get old user data for audit
        const [oldUser] = await db.query(
            'SELECT * FROM sp_user_master WHERE user_id = ?',
            [user_id]
        );

        if (oldUser.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'User not found'
            });
        }

        // Check if email is being changed and if it already exists
        if (email_address && email_address !== oldUser[0].email_address) {
            const [existingEmail] = await db.query(
                'SELECT user_id FROM sp_user_master WHERE email_address = ? AND user_id != ?',
                [email_address, user_id]
            );

            if (existingEmail.length > 0) {
                return res.status(409).json({
                    success: false,
                    message: 'Email already exists'
                });
            }
        }

        // Check if contact number is being changed and if it already exists
        if (contact_number && contact_number !== oldUser[0].contact_number) {
            const [existingPhone] = await db.query(
                'SELECT user_id FROM sp_user_master WHERE contact_number = ? AND user_id != ?',
                [contact_number, user_id]
            );

            if (existingPhone.length > 0) {
                return res.status(409).json({
                    success: false,
                    message: 'Contact number already exists'
                });
            }
        }

        // Build update query dynamically
        const updates = [];
        const values = [];

        if (full_name !== undefined) {
            updates.push('full_name = ?');
            values.push(full_name);
        }
        if (email_address !== undefined) {
            updates.push('email_address = ?');
            values.push(email_address);
        }
        if (contact_number !== undefined) {
            updates.push('contact_number = ?');
            values.push(contact_number);
        }
        if (role_id !== undefined) {
            updates.push('role_id = ?');
            values.push(role_id);
        }
        if (study_id !== undefined) {
            updates.push('study_id = ?');
            values.push(study_id);
        }
        if (site_id !== undefined) {
            updates.push('site_id = ?');
            values.push(site_id);
        }
        if (status !== undefined) {
            updates.push('status = ?');
            values.push(status);
        }
        if (updated_by !== undefined) {
            updates.push('updated_by = ?');
            values.push(updated_by);
        }

        if (updates.length === 0) {
            return res.status(400).json({
                success: false,
                message: 'No fields to update'
            });
        }

        const updateQuery = `
            UPDATE sp_user_master 
            SET ${updates.join(', ')}
            WHERE user_id = ?
        `;

        await db.query(updateQuery, [...values, user_id]);

        const [updatedUser] = await db.query(`
            SELECT 
                u.user_id,
                u.full_name,
                u.email_address,
                u.contact_number,
                u.status,
                r.role_name,
                st.study_title,
                si.site_name
            FROM sp_user_master u
            LEFT JOIN sp_role_master r ON u.role_id = r.role_id
            LEFT JOIN sp_studies st ON u.study_id = st.study_id
            LEFT JOIN sp_site_master si ON u.site_id = si.site_id
            WHERE u.user_id = ?
        `, [user_id]);

        // Log to audit trail
        await db.query(`
            INSERT INTO sp_audit_trail (
                user_id, role_id, module_name, action_type,
                record_id, old_value, new_value, ip_address
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `, [
            updated_by,
            null,
            'User Management',
            'Update',
            user_id,
            JSON.stringify(oldUser[0]),
            JSON.stringify(updatedUser[0]),
            req.ip
        ]);

        res.json({
            success: true,
            message: 'User updated successfully',
            data: updatedUser[0]
        });

    } catch (error) {
        console.error('Error updating user:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to update user',
            error: error.message
        });
    }
});


router.delete('/:user_id', async (req, res) => {
    try {
        const { user_id } = req.params;
        const { deleted_by } = req.body;

        // Get user before deletion for audit
        const [user] = await db.query(
            'SELECT * FROM sp_user_master WHERE user_id = ?',
            [user_id]
        );

        if (user.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'User not found'
            });
        }

        // Log to audit trail BEFORE deleting
        await db.query(`
            INSERT INTO sp_audit_trail (
                user_id, role_id, module_name, action_type,
                record_id, old_value, new_value, ip_address
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `, [
            deleted_by,
            null,
            'User Management',
            'Delete',
            user_id,
            JSON.stringify(user[0]),
            null,
            req.ip
        ]);

        // Hard delete - actually remove the record
        await db.query(
            'DELETE FROM sp_user_master WHERE user_id = ?',
            [user_id]
        );

        res.json({
            success: true,
            message: 'User deleted successfully'
        });

    } catch (error) {
        console.error('Error deleting user:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to delete user',
            error: error.message
        });
    }
});

// get user activity history
router.get('/:user_id/history', async (req, res) => {
    try {
        const { user_id } = req.params;
        const { page = 1, limit = 20 } = req.query;
        const offset = (page - 1) * limit;

        const query = `
            SELECT 
                at.audit_id,
                at.action_type,
                at.module_name,
                at.timestamp,
                at.ip_address,
                at.old_value,
                at.new_value,
                u.full_name as performed_by
            FROM sp_audit_trail at
            LEFT JOIN sp_user_master u ON at.user_id = u.user_id
            WHERE at.record_id = ? AND at.module_name = 'User Management'
            ORDER BY at.timestamp DESC
            LIMIT ? OFFSET ?
        `;

        const [history] = await db.query(query, [user_id, parseInt(limit), offset]);

        // Get total count
        const [countResult] = await db.query(
            `SELECT COUNT(*) as total 
             FROM sp_audit_trail 
             WHERE record_id = ? AND module_name = 'User Management'`,
            [user_id]
        );

        res.json({
            success: true,
            data: history,
            pagination: {
                currentPage: parseInt(page),
                totalRecords: countResult[0].total,
                limit: parseInt(limit)
            }
        });

    } catch (error) {
        console.error('Error fetching user history:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch user history',
            error: error.message
        });
    }
});

// import users
router.post('/bulk-import', async (req, res) => {
    try {
        const { users, created_by } = req.body;

        if (!Array.isArray(users) || users.length === 0) {
            return res.status(400).json({
                success: false,
                message: 'Users array is required'
            });
        }

        const results = {
            success: [],
            failed: []
        };

        for (const user of users) {
            try {
                const { full_name, email_address, contact_number, role_id, study_id, site_id } = user;

                // Check if user already exists
                const [existing] = await db.query(
                    'SELECT user_id FROM sp_user_master WHERE email_address = ? OR contact_number = ?',
                    [email_address, contact_number]
                );

                if (existing.length > 0) {
                    results.failed.push({
                        email_address,
                        reason: 'Email or contact number already exists'
                    });
                    continue;
                }

                // Insert user
                const [result] = await db.query(`
                    INSERT INTO sp_user_master (
                        full_name, email_address, contact_number,
                        role_id, study_id, site_id, created_by
                    ) VALUES (?, ?, ?, ?, ?, ?, ?)
                `, [full_name, email_address, contact_number, role_id, study_id, site_id, created_by]);

                results.success.push({
                    user_id: result.insertId,
                    email_address
                });

            } catch (error) {
                results.failed.push({
                    email_address: user.email_address,
                    reason: error.message
                });
            }
        }

        res.json({
            success: true,
            message: `Imported ${results.success.length} users, ${results.failed.length} failed`,
            data: results
        });

    } catch (error) {
        console.error('Error bulk importing users:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to import users',
            error: error.message
        });
    }
});

// get users by role
router.get('/by-role/:role_id', async (req, res) => {
    try {
        const { role_id } = req.params;

        const query = `
            SELECT 
                u.user_id,
                u.full_name,
                u.email_address,
                u.contact_number,
                u.status,
                si.site_name,
                st.study_title
            FROM sp_user_master u
            LEFT JOIN sp_site_master si ON u.site_id = si.site_id
            LEFT JOIN sp_studies st ON u.study_id = st.study_id
            WHERE u.role_id = ? AND u.status = 'Active'
            ORDER BY u.full_name ASC
        `;

        const [users] = await db.query(query, [role_id]);

        res.json({
            success: true,
            data: users
        });

    } catch (error) {
        console.error('Error fetching users by role:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch users',
            error: error.message
        });
    }
});

module.exports = router;