const express = require('express');
const router = express.Router();
const alertQueriesController = require('../controllers/alertQueriesController');

/**
 * @route   POST /api/alerts/enable
 * @desc    Enable alerts for a specific query or create a new query with alerts enabled
 * @access  Public
 * @body    {
 *            queryId: string,  // ID of the existing query to enable alerts for
 *            query: string,    // Optional: Full query text (required if creating new)
 *            userDbId: string  // Optional: Database ID (required if creating new)
 *          }
 */
router.post('/enable', alertQueriesController.enableQueryAlert);

module.exports = router;