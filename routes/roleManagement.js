const express = require('express');
const router = express.Router();
const db = require('../config/database');

// get all roles with pagination
router.post('/list', async (req, res) => {
    try {
        const {
            page = 1,
            limit = 10,
            search = '',
            status = null
        } = req.body;

        const offset = (page - 1) * limit;

        // Build WHERE clause
        let whereConditions = [];
        let queryParams = [];

        if (search) {
            whereConditions.push(`(
                role_name LIKE ? OR 
                role_description LIKE ?
            )`);
            const searchTerm = `%${search}%`;
            queryParams.push(searchTerm, searchTerm);
        }

        if (status) {
            whereConditions.push('status = ?');
            queryParams.push(status);
        }

        const whereClause = whereConditions.length > 0
            ? `WHERE ${whereConditions.join(' AND ')}`
            : '';

        // Get total count
        const countQuery = `
            SELECT COUNT(*) as total 
            FROM sp_role_master
            ${whereClause}
        `;

        const [countResult] = await db.query(countQuery, queryParams);
        const totalRecords = countResult[0].total;
        const totalPages = Math.ceil(totalRecords / limit);

        // Get paginated data with user count
        const dataQuery = `
            SELECT 
                r.role_id,
                r.role_name,
                r.role_description,
                r.status,
                r.created_at,
                r.updated_at,
                COUNT(u.user_id) as user_count,
                creator.full_name as created_by_name,
                updater.full_name as updated_by_name
            FROM sp_role_master r
            LEFT JOIN sp_user_master u ON r.role_id = u.role_id AND u.status = 'Active'
            LEFT JOIN sp_user_master creator ON r.created_by = creator.user_id
            LEFT JOIN sp_user_master updater ON r.updated_by = updater.user_id
            ${whereClause}
            GROUP BY r.role_id
            ORDER BY r.created_at DESC
            LIMIT ? OFFSET ?
        `;

        const dataParams = [...queryParams, limit, offset];
        const [roles] = await db.query(dataQuery, dataParams);

        res.json({
            success: true,
            data: roles,
            pagination: {
                currentPage: page,
                totalPages,
                totalRecords,
                limit
            }
        });

    } catch (error) {
        console.error('Error fetching roles:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch roles',
            error: error.message
        });
    }
});

// get role by id
router.get('/:role_id', async (req, res) => {
    try {
        const { role_id } = req.params;

        const query = `
            SELECT 
                r.role_id,
                r.role_name,
                r.role_description,
                r.status,
                r.created_at,
                r.updated_at,
                COUNT(u.user_id) as user_count
            FROM sp_role_master r
            LEFT JOIN sp_user_master u ON r.role_id = u.role_id AND u.status = 'Active'
            WHERE r.role_id = ?
            GROUP BY r.role_id
        `;

        const [roles] = await db.query(query, [role_id]);

        if (roles.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Role not found'
            });
        }

        res.json({
            success: true,
            data: roles[0]
        });

    } catch (error) {
        console.error('Error fetching role:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch role',
            error: error.message
        });
    }
});

// create new role
router.post('/create', async (req, res) => {
    try {
        const {
            role_name,
            role_description = '',
            status = 'Active',
            created_by
        } = req.body;

        // Validation
        if (!role_name) {
            return res.status(400).json({
                success: false,
                message: 'Role name is required'
            });
        }

        // Check if role name already exists
        const [existingRoles] = await db.query(
            'SELECT role_id FROM sp_role_master WHERE role_name = ?',
            [role_name]
        );

        if (existingRoles.length > 0) {
            return res.status(409).json({
                success: false,
                message: 'Role with this name already exists'
            });
        }

        // Insert new role
        const insertQuery = `
            INSERT INTO sp_role_master (
                role_name, role_description, status, created_by
            ) VALUES (?, ?, ?, ?)
        `;

        const [result] = await db.query(insertQuery, [
            role_name,
            role_description,
            status,
            created_by
        ]);

        // Get the created role
        const [newRole] = await db.query(`
            SELECT 
                role_id,
                role_name,
                role_description,
                status,
                created_at
            FROM sp_role_master
            WHERE role_id = ?
        `, [result.insertId]);

        // Log to audit trail
        await db.query(`
            INSERT INTO sp_audit_trail (
                user_id, role_id, module_name, action_type,
                record_id, old_value, new_value, ip_address
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `, [
            created_by,
            result.insertId,
            'Role Management',
            'Create',
            result.insertId,
            null,
            JSON.stringify(newRole[0]),
            req.ip
        ]);

        res.status(201).json({
            success: true,
            message: 'Role created successfully',
            data: newRole[0]
        });

    } catch (error) {
        console.error('Error creating role:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to create role',
            error: error.message
        });
    }
});

// update role
router.put('/:role_id', async (req, res) => {
    try {
        const { role_id } = req.params;
        const {
            role_name,
            role_description,
            status,
            updated_by
        } = req.body;

        // Get old role data for audit
        const [oldRole] = await db.query(
            'SELECT * FROM sp_role_master WHERE role_id = ?',
            [role_id]
        );

        if (oldRole.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Role not found'
            });
        }

        // Check if role name is being changed and if it already exists
        if (role_name && role_name !== oldRole[0].role_name) {
            const [existingRoles] = await db.query(
                'SELECT role_id FROM sp_role_master WHERE role_name = ? AND role_id != ?',
                [role_name, role_id]
            );

            if (existingRoles.length > 0) {
                return res.status(409).json({
                    success: false,
                    message: 'Role name already exists'
                });
            }
        }

        // Build update query dynamically
        const updates = [];
        const values = [];

        if (role_name !== undefined) {
            updates.push('role_name = ?');
            values.push(role_name);
        }
        if (role_description !== undefined) {
            updates.push('role_description = ?');
            values.push(role_description);
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
            UPDATE sp_role_master 
            SET ${updates.join(', ')}
            WHERE role_id = ?
        `;

        await db.query(updateQuery, [...values, role_id]);

        // Get updated role
        const [updatedRole] = await db.query(`
            SELECT 
                role_id,
                role_name,
                role_description,
                status,
                updated_at
            FROM sp_role_master
            WHERE role_id = ?
        `, [role_id]);

        // Log to audit trail
        await db.query(`
            INSERT INTO sp_audit_trail (
                user_id, role_id, module_name, action_type,
                record_id, old_value, new_value, ip_address
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `, [
            updated_by,
            role_id,
            'Role Management',
            'Update',
            role_id,
            JSON.stringify(oldRole[0]),
            JSON.stringify(updatedRole[0]),
            req.ip
        ]);

        res.json({
            success: true,
            message: 'Role updated successfully',
            data: updatedRole[0]
        });

    } catch (error) {
        console.error('Error updating role:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to update role',
            error: error.message
        });
    }
});

// delete role
router.delete('/:role_id', async (req, res) => {
    try {
        const { role_id } = req.params;
        const { deleted_by } = req.body;

        // Check if role exists
        const [role] = await db.query(
            'SELECT * FROM sp_role_master WHERE role_id = ?',
            [role_id]
        );

        if (role.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Role not found'
            });
        }

        // Check if role is assigned to any active users
        const [activeUsers] = await db.query(
            'SELECT COUNT(*) as count FROM sp_user_master WHERE role_id = ? AND status = "Active"',
            [role_id]
        );

        if (activeUsers[0].count > 0) {
            return res.status(400).json({
                success: false,
                message: `Cannot delete role. ${activeUsers[0].count} active user(s) are assigned to this role.`
            });
        }

        // Soft delete - set status to Inactive
        await db.query(
            'UPDATE sp_role_master SET status = ?, updated_by = ? WHERE role_id = ?',
            ['Inactive', deleted_by, role_id]
        );

        // Log to audit trail
        await db.query(`
            INSERT INTO sp_audit_trail (
                user_id, role_id, module_name, action_type,
                record_id, old_value, new_value, ip_address
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `, [
            deleted_by,
            role_id,
            'Role Management',
            'Delete',
            role_id,
            JSON.stringify(role[0]),
            JSON.stringify({ status: 'Inactive' }),
            req.ip
        ]);

        res.json({
            success: true,
            message: 'Role deleted successfully'
        });

    } catch (error) {
        console.error('Error deleting role:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to delete role',
            error: error.message
        });
    }
});
// get users by role
router.get('/:role_id/users', async (req, res) => {
    try {
        const { role_id } = req.params;
        const { page = 1, limit = 20 } = req.query;
        const offset = (page - 1) * limit;

        const query = `
            SELECT 
                u.user_id,
                u.full_name,
                u.email_address,
                u.contact_number,
                u.status,
                st.study_name,
                si.site_name,
                si.site_code
            FROM sp_user_master u
            LEFT JOIN sp_studies st ON u.study_id = st.study_id
            LEFT JOIN sp_site_master si ON u.site_id = si.site_id
            WHERE u.role_id = ?
            ORDER BY u.created_at DESC
            LIMIT ? OFFSET ?
        `;

        const [users] = await db.query(query, [role_id, parseInt(limit), offset]);

        // Get total count
        const [countResult] = await db.query(
            'SELECT COUNT(*) as total FROM sp_user_master WHERE role_id = ?',
            [role_id]
        );

        res.json({
            success: true,
            data: users,
            pagination: {
                currentPage: parseInt(page),
                totalRecords: countResult[0].total,
                limit: parseInt(limit)
            }
        });

    } catch (error) {
        console.error('Error fetching role users:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch role users',
            error: error.message
        });
    }
});

// get role history
router.get('/:role_id/history', async (req, res) => {
    try {
        const { role_id } = req.params;
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
            WHERE at.record_id = ? AND at.module_name = 'Role Management'
            ORDER BY at.timestamp DESC
            LIMIT ? OFFSET ?
        `;

        const [history] = await db.query(query, [role_id, parseInt(limit), offset]);

        // Get total count
        const [countResult] = await db.query(
            `SELECT COUNT(*) as total 
             FROM sp_audit_trail 
             WHERE record_id = ? AND module_name = 'Role Management'`,
            [role_id]
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
        console.error('Error fetching role history:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch role history',
            error: error.message
        });
    }
});

// get all active roles
router.get('/dropdown/list', async (req, res) => {
    try {
        const query = `
            SELECT 
                role_id,
                role_name,
                role_description
            FROM sp_role_master
            WHERE status = 'Active'
            ORDER BY role_name ASC
        `;

        const [roles] = await db.query(query);

        res.json({
            success: true,
            data: roles
        });

    } catch (error) {
        console.error('Error fetching roles dropdown:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch roles',
            error: error.message
        });
    }
});

module.exports = router;