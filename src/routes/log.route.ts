import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import {
    getAllLogs,
    getLogsByUser,
    getLogsByAction,
    getRecentLogs,
    getLogStats,
    searchLogs
} from '../controllers/log.controller';

const logRouter = Router();

// All log routes require authentication and admin access
logRouter.use(authenticate);

// ============ ADMIN LOG ENDPOINTS (admin only) ============

// Get all logs with filtering and pagination
// Query params: page, limit, sortBy, sortOrder, userId, action, status, resourceId, startDate, endDate, search
logRouter.get('/', getAllLogs);

// Get logs for a specific user
// Query params: page, limit, sortBy, sortOrder
logRouter.get('/user/:userId', getLogsByUser);

// Get logs by action type
// Query params: page, limit, sortBy, sortOrder
logRouter.get('/action/:action', getLogsByAction);

// Get recent logs (last 24 hours by default)
// Query params: hours (default: 24)
logRouter.get('/recent', getRecentLogs);

// Get log statistics
// Query params: startDate, endDate
logRouter.get('/stats', getLogStats);

// Search logs
// Query params: q (search term), action, status, page, limit, sortBy, sortOrder
logRouter.get('/search', searchLogs);

export default logRouter;
