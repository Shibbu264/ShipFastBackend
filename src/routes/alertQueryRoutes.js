const express = require('express');
const router = express.Router();
const alertQueriesController = require('../controllers/alertQueriesController');
const authenticateJWT = require('../middlewares/auth');

/**
 * @route   POST /api/alerts/enable
 * @desc    Enable alerts for a specific query or create a new query with alerts enabled
 * @access  Private
 * @body    {
 *            queryId: string,  // ID of the existing query to enable alerts for
 *            query: string     // Optional: Full query text (required if creating new)
 *          }
 */
router.post('/enable', authenticateJWT, alertQueriesController.enableQueryAlert);

/**
 * @route   GET /api/alerts/query-with-alerts
 * @desc    Get all queries with alerts enabled for the authenticated user
 * @access  Private
 * @returns Array of query objects with alert information
 */
router.get('/query-with-alerts', authenticateJWT, alertQueriesController.getQueriesWithAlerts);

module.exports = router;