// routes/studyRoutes.js
const express = require('express');
const router = express.Router();
const db = require('../config/database');
const { sendSurveySubmissionEmail } = require('../config/email');


router.get('/study/:userId/:studyId', async (req, res) => {
    const { userId, studyId } = req.params;

    try {
        console.log(`\n === FETCHING STUDY ===`);
        console.log(`User ID: ${userId}, Study ID: ${studyId}`);

        console.log('Step 1: Checking submission status...');
        const [responseRows] = await req.db.query(
            `SELECT response_data, status 
                FROM study_response 
                WHERE user_id = ? AND study_id = ? 
                ORDER BY last_updated_at DESC 
                LIMIT 1`,
            [userId, studyId]
        );

        const responseStatus = responseRows.length > 0 ? responseRows[0].status : null;
        const draftResponse = responseRows.length > 0 ? responseRows[0].response_data : null;

        console.log(` Submission status: ${responseStatus || 'Not started'}`);


        let studyDefinition;

        if (responseStatus === 'submitted') {
            // User already submitted - bypass stored procedure to avoid error
            console.log('Step 2: User submitted - fetching study directly (bypassing stored procedure)');

            const [studyRows] = await req.db.query(
                `SELECT * 
                    FROM sp_studies 
                    WHERE study_id = ?`,
                [studyId]
            );

            if (studyRows.length === 0) {
                throw new Error('Study not found or inactive');
            }

            studyDefinition = studyRows[0];
            console.log('  Study fetched directly from table');

        } else {
            // User has not submitted yet - use stored procedure normally
            console.log('Step 2: User not submitted - using stored procedure');

            const [studyRows] = await req.db.query(
                'CALL get_study_for_user(?, ?)',
                [studyId, userId]
            );

            if (!studyRows || studyRows.length === 0 || !studyRows[0]) {
                throw new Error('Study not found or user not authorized');
            }

            studyDefinition = studyRows[0];
            console.log('  Study fetched via stored procedure');
        }

        console.log('  Study data prepared successfully');
        console.log(`=== FETCH COMPLETE ===\n`);

        //   STEP 3: Return response with status
        return res.status(200).json({
            success: true,
            data: {
                study_definition: studyDefinition,
                draft_response: draftResponse,
                status: responseStatus
            }
        });

    } catch (error) {
        console.error('\n  === ERROR FETCHING STUDY ===');
        console.error('Error message:', error.message);
        console.error('Error stack:', error.stack);
        console.error('=== ERROR END ===\n');

        return res.status(500).json({
            success: false,
            message: 'Failed to fetch study data',
            error: error.message
        });
    }
});



router.post('/submit-survey', async (req, res) => {
    const { userId, studyId, responseData } = req.body;

    // Validation
    if (!userId || !studyId || !responseData) {
        return res.status(400).json({
            success: false,
            message: 'Missing required fields: userId, studyId, or responseData'
        });
    }

    try {
        console.log(`\n === SUBMITTING SURVEY ===`);
        console.log(`User: ${userId}, Study: ${studyId}`);

        //  Check if response already exists AND its status
        const [existing] = await req.db.query(
            'SELECT response_id, status FROM study_response WHERE user_id = ? AND study_id = ?',
            [userId, studyId]
        );

        //  PREVENT DUPLICATE SUBMISSIONS
        if (existing.length > 0 && existing[0].status === 'submitted') {
            console.log(' Survey already submitted, rejecting duplicate submission');
            return res.status(409).json({
                success: false,
                message: 'Survey has already been submitted. Duplicate submissions are not allowed.',
                alreadySubmitted: true
            });
        }

        let result;
        let responseId;

        if (existing.length > 0) {
            // Update existing draft to submitted
            console.log('Updating existing draft to submitted...');

            const updateQuery = `
                    UPDATE study_response 
                    SET response_data = ?,
                        status = 'submitted',
                        submitted_at = NOW(),
                        last_updated_at = NOW()
                    WHERE user_id = ? AND study_id = ?
                `;

            result = await req.db.query(updateQuery, [
                JSON.stringify(responseData),
                userId,
                studyId
            ]);

            responseId = existing[0].response_id;
            console.log(' Survey updated to submitted successfully');

        } else {
            // Insert new response
            console.log('Creating new submission...');

            const insertQuery = `
                    INSERT INTO study_response 
                    (study_id, user_id, response_data, status, submitted_at, last_updated_at)
                    VALUES (?, ?, ?, 'submitted', NOW(), NOW())
                `;

            result = await req.db.query(insertQuery, [
                studyId,
                userId,
                JSON.stringify(responseData)
            ]);

            responseId = result[0].insertId;
            console.log(' Survey submitted successfully');
        }

        //  SEND CONFIRMATION EMAIL
        console.log(' Fetching user and study info for email...');

        // try {
        //     // Get user info
        //     const [userRows] = await req.db.query(
        //         'SELECT email_address, full_name FROM sp_user_master WHERE user_id = ?',
        //         [userId]
        //     );

        //     // Get study info
        //     const [studyRows] = await req.db.query(
        //         'SELECT study_title, study_number FROM sp_studies WHERE study_id = ?',
        //         [studyId]
        //     );

        //     console.log(' User found:', userRows.length > 0 ? userRows[0].email_address : 'Not found');
        //     console.log(' Study found:', studyRows.length > 0 ? studyRows[0].study_title : 'Not found');

        //     if (userRows.length > 0 && studyRows.length > 0) {
        //         const userEmail = userRows[0].email_address;
        //         const fullName = userRows[0].full_name;
        //         const studyTitle = studyRows[0].study_title || 'Clinical Study';
        //         const studyNumber = studyRows[0].study_number || 'N/A';

        //         console.log(' Sending email to:', userEmail);

        //         // Send email asynchronously (don't block response)
        //         sendSurveySubmissionEmail(userEmail, fullName, studyTitle, studyNumber)
        //             .then((result) => {
        //                 console.log(' Confirmation email sent successfully');
        //             })
        //             .catch((error) => {
        //                 console.error(' Failed to send email:', error.message);
        //             });
        //     } else {
        //         console.warn(' User or study info not found, skipping email');
        //     }
        // } catch (emailError) {
        //     console.error(' Error preparing email:', emailError);
        //     // Don't fail the submission if email fails
        // }

        //  SEND CONFIRMATION EMAIL
        console.log(' Fetching user and study info for email...');

        try {
            // Get user info
            const [userRows] = await req.db.query(
                'SELECT email_address, full_name FROM sp_user_master WHERE user_id = ?',
                [userId]
            );

            // Get study info
            const [studyRows] = await req.db.query(
                'SELECT study_title, study_number FROM sp_studies WHERE study_id = ?',
                [studyId]
            );

            console.log(' User found:', userRows.length > 0 ? userRows[0].email_address : 'Not found');
            console.log(' Study found:', studyRows.length > 0 ? studyRows[0].study_title : 'Not found');

            if (userRows.length > 0 && studyRows.length > 0) {
                const userEmail = userRows[0].email_address;
                const fullName = userRows[0].full_name;
                const studyTitle = studyRows[0].study_title || 'Clinical Study';
                const studyNumber = studyRows[0].study_number || 'N/A';

                console.log(' Sending email to:', userEmail);

                // Send email asynchronously (don't block response)
                sendSurveySubmissionEmail(userEmail, fullName,studyNumber,studyTitle)
                    .then((result) => {
                        console.log(' Confirmation email sent successfully');
                    })
                    .catch((error) => {
                        console.error(' Failed to send email:', error.message);
                    });
            } else {
                console.warn(' User or study info not found, skipping email');
            }
        } catch (emailError) {
            console.error(' Error preparing email:', emailError);
            // Don't fail the submission if email fails
        }
        return res.status(existing.length > 0 ? 200 : 201).json({
            success: true,
            message: 'Survey submitted successfully',
            responseId: responseId
        });

    } catch (error) {
        console.error(' Error submitting survey:', error);

        return res.status(500).json({
            success: false,
            message: 'Failed to submit survey',
            error: error.message
        });
    } finally {
        console.log(`=== SUBMIT COMPLETE ===\n`);
    }
});


router.post('/save-draft', async (req, res) => {
    const { userId, studyId, responseData } = req.body;

    if (!userId || !studyId || !responseData) {
        return res.status(400).json({
            success: false,
            message: 'Missing required fields'
        });
    }

    try {
        console.log(` Saving draft for User: ${userId}, Study: ${studyId}`);

        // Check if draft exists
        const [existing] = await req.db.query(
            'SELECT response_id, status FROM study_response WHERE user_id = ? AND study_id = ?',
            [userId, studyId]
        );

        // Don't allow draft saves if already submitted
        if (existing.length > 0 && existing[0].status === 'submitted') {
            console.log(' Survey already submitted, cannot save draft');
            return res.status(409).json({
                success: false,
                message: 'Survey already submitted. Cannot save draft.',
                alreadySubmitted: true
            });
        }

        if (existing.length > 0) {
            // Update existing draft
            await req.db.query(
                'UPDATE study_response SET response_data = ?, last_updated_at = NOW() WHERE user_id = ? AND study_id = ?',
                [JSON.stringify(responseData), userId, studyId]
            );

            console.log('  Draft updated successfully');

            return res.status(200).json({
                success: true,
                message: 'Draft updated successfully',
                responseId: existing[0].response_id
            });

        } else {
            // Insert new draft -   FIXED: Pass 'draft' as parameter
            const result = await req.db.query(
                'INSERT INTO study_response (study_id, user_id, response_data, status, last_updated_at) VALUES (?, ?, ?, ?, NOW())',
                [studyId, userId, JSON.stringify(responseData), 'draft']  //   Fixed
            );

            console.log('  Draft saved successfully');

            return res.status(201).json({
                success: true,
                message: 'Draft saved successfully',
                responseId: result[0].insertId
            });
        }

    } catch (error) {
        console.error('  Error saving draft:', error);

        return res.status(500).json({
            success: false,
            message: 'Failed to save draft',
            error: error.message
        });
    }
});

router.get('/user-responses/:userId/:studyId', async (req, res) => {
    const { userId, studyId } = req.params;

    try {
        console.log(` Fetching responses for User: ${userId}, Study: ${studyId}`);

        const [rows] = await req.db.query(
            `SELECT response_id, response_data, status, submitted_at, last_updated_at
        FROM study_response
        WHERE user_id = ? AND study_id = ?
        ORDER BY last_updated_at DESC
        LIMIT 1`,
            [userId, studyId]
        );

        if (rows.length === 0) {
            return res.status(200).json({
                success: true,
                data: null,
                hasResponses: false
            });
        }

        const response = rows[0];

        console.log('  User responses fetched successfully');

        return res.status(200).json({
            success: true,
            data: {
                responseId: response.response_id,
                responseData: response.response_data, // Already parsed as JSON by mysql2
                status: response.status,
                submittedAt: response.submitted_at,
                lastUpdatedAt: response.last_updated_at
            },
            hasResponses: true
        });

    } catch (error) {
        console.error('  Error fetching user responses:', error);

        return res.status(500).json({
            success: false,
            message: 'Failed to fetch user responses',
            error: error.message
        });
    }
});


router.get('/health', (req, res) => {
    res.status(200).json({
        success: true,
        message: 'API is running',
        timestamp: new Date().toISOString()
    });
});

module.exports = router;