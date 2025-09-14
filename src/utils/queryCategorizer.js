/**
 * Query Performance Categorization Utility
 * 
 * Categorizes queries based on their performance metrics
 * using consistent thresholds across the application
 */

// Performance thresholds (in milliseconds)
const PERFORMANCE_THRESHOLDS = {
  CRITICAL: 500,  // > 500ms = Critical/Slow
  WARNING: 300,   // > 300ms = Warning/Medium
  // < 300ms = Good/Fast
};

/**
 * Categorizes a query based on its mean execution time
 * @param {number} meanTimeMs - Mean execution time in milliseconds
 * @returns {string} - Query performance category
 */
function categorizeQueryPerformance(meanTimeMs) {
  if (meanTimeMs > PERFORMANCE_THRESHOLDS.CRITICAL) {
    return "Slow Query";
  } else if (meanTimeMs > PERFORMANCE_THRESHOLDS.WARNING) {
    return "Medium Query";
  } else {
    return "Fast Query";
  }
}

/**
 * Gets the performance category with additional metadata
 * @param {number} meanTimeMs - Mean execution time in milliseconds
 * @returns {Object} - Performance category with metadata
 */
function getQueryPerformanceCategory(meanTimeMs) {
  if (meanTimeMs > PERFORMANCE_THRESHOLDS.CRITICAL) {
    return {
      category: "Slow Query",
      level: "critical",
      threshold: `> ${PERFORMANCE_THRESHOLDS.CRITICAL}ms`,
      priority: "high"
    };
  } else if (meanTimeMs > PERFORMANCE_THRESHOLDS.WARNING) {
    return {
      category: "Medium Query", 
      level: "warning",
      threshold: `> ${PERFORMANCE_THRESHOLDS.WARNING}ms`,
      priority: "medium"
    };
  } else {
    return {
      category: "Fast Query",
      level: "good", 
      threshold: `≤ ${PERFORMANCE_THRESHOLDS.WARNING}ms`,
      priority: "low"
    };
  }
}

/**
 * Checks if a query is critical (slow)
 * @param {Object} query - Query object with meanTimeMs property
 * @returns {boolean} - True if query is critical
 */
function isCriticalQuery(query) {
  return query.meanTimeMs > PERFORMANCE_THRESHOLDS.CRITICAL;
}

/**
 * Checks if a query is slow (medium or critical)
 * @param {Object} query - Query object with meanTimeMs property  
 * @returns {boolean} - True if query is slow
 */
function isSlowQuery(query) {
  return query.meanTimeMs > PERFORMANCE_THRESHOLDS.WARNING;
}

/**
 * Gets severity level based on mean execution time
 * @param {number} meanTimeMs - Mean execution time in milliseconds
 * @returns {string} - Severity level (high/medium/low)
 */
function getSeverityLevel(meanTimeMs) {
  if (meanTimeMs > PERFORMANCE_THRESHOLDS.CRITICAL) {
    return "high";
  } else if (meanTimeMs > PERFORMANCE_THRESHOLDS.WARNING) {
    return "medium";
  } else {
    return "low";
  }
}

module.exports = {
  categorizeQueryPerformance,
  getQueryPerformanceCategory,
  isCriticalQuery,
  isSlowQuery,
  getSeverityLevel,
  PERFORMANCE_THRESHOLDS
};
