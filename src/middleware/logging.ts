import { Request, Response, NextFunction } from 'express';
import { LogService } from '../services/log.service';
import { LogAction, LogDetails } from '../models/log.model';

// Extend Express Request to include start time
declare global {
    namespace Express {
        interface Request {
            startTime?: number;
        }
    }
}

/**
 * Get client IP address from request
 */
function getClientIP(req: Request): string {
    const forwarded = req.headers['x-forwarded-for'] as string;
    const realIP = req.headers['x-real-ip'] as string;
    const clientIP = req.headers['x-client-ip'] as string;

    if (forwarded) {
        return forwarded.split(',')[0].trim();
    }
    if (realIP) {
        return realIP;
    }
    if (clientIP) {
        return clientIP;
    }

    return req.ip || req.connection.remoteAddress || 'unknown';
}

/**
 * Extract user agent from request
 */
function getUserAgent(req: Request): string {
    return req.headers['user-agent'] || 'unknown';
}

/**
 * Determine action type from request method and path
 * Routes are mounted as:
 * - /api/auth/* -> authRouter
 * - /api/users/* -> userRouter
 * - /api/games/* -> gameRouter
 * - /api/logs/* -> logRouter
 */
function determineActionType(req: Request): LogAction | null {
    const method = req.method;
    const path = req.path;
    const originalUrl = req.originalUrl; // Full URL including mount point

    // Check full URL to determine which router this came from
    if (originalUrl.startsWith('/api/auth/')) {
        // Auth router actions
        if (path === '/users' && method === 'POST') {
            return 'CREATE_USER';
        }
        if (path.includes('/login') && method === 'POST') {
            return 'LOGIN';
        }
        if (path.includes('/logout') && method === 'POST') {
            return 'LOGOUT';
        }
        if (path.includes('/refresh') && method === 'POST') {
            return 'LOGIN'; // Treat refresh as login
        }
        if (path.includes('/change-password') && method === 'POST') {
            return 'PASSWORD_CHANGE';
        }
    }

    if (originalUrl.startsWith('/api/users/')) {
        // User router actions
        if (path.match(/^\/user\/[^\/]+$/) && method === 'PUT') {
            return 'UPDATE_USER';
        }
        if (path.match(/^\/user\/[^\/]+$/) && method === 'DELETE') {
            return 'DELETE_USER';
        }
        if (path.includes('/ban') && method === 'POST') {
            return 'BAN_USER';
        }
        if (path.includes('/unban') && method === 'POST') {
            return 'UNBAN_USER';
        }
        if (path.includes('/transfer-credit') && method === 'POST') {
            return 'CREDIT_TRANSFER';
        }
        if (path.includes('/adjust-credit') && method === 'POST') {
            return 'CREDIT_ADJUSTMENT';
        }
    }

    if (originalUrl.startsWith('/api/games/')) {
        // Game router actions
        if (method === 'GET') {
            return null; // Don't log GET requests for games
        }
        // Add more specific game action detection here when game routes are implemented
    }

    // Profile/Settings actions (could be in auth or users router)
    if (path.includes('/profile') && method === 'PUT') {
        return 'PROFILE_UPDATE';
    }

    // Admin-specific system actions (only for actual admin endpoints)
    if (path.includes('/admin') && (method === 'POST' || method === 'PUT' || method === 'DELETE')) {
        return 'SYSTEM_CONFIG_CHANGE';
    }

    // Bulk operations (if any)
    if (path.includes('/bulk') && (method === 'POST' || method === 'PUT' || method === 'DELETE')) {
        return 'BULK_OPERATION';
    }

    return null; // Don't log this action
}

/**
 * Extract relevant details from request
 */
function extractRequestDetails(req: Request): LogDetails {
    const details: LogDetails = {};

    // Extract target user ID from URL parameters
    if (req.params.userId || req.params.id) {
        details.targetUserId = req.params.userId || req.params.id;
    }

    // Extract game session ID
    if (req.params.sessionId) {
        details.gameSessionId = req.params.sessionId;
    }

    // Extract body data (be careful not to log sensitive data)
    if (req.body) {
        // For user creation/updates
        if (req.body.username) {
            details.targetUsername = req.body.username;
        }

        // For financial operations
        if (req.body.amount !== undefined) {
            details.amount = req.body.amount;
        }

        // For credit transfers
        if (req.body.transferType) {
            details.transferType = req.body.transferType;
        }

        // For game operations
        if (req.body.betAmount !== undefined) {
            details.betAmount = req.body.betAmount;
        }
        if (req.body.winAmount !== undefined) {
            details.winAmount = req.body.winAmount;
        }
        if (req.body.gameType) {
            details.gameType = req.body.gameType;
        }

        // Generic description for other operations
        if (req.body.description) {
            details.description = req.body.description;
        }

        // Store changes for updates (simplified)
        if (req.method === 'PUT' && Object.keys(req.body).length > 0) {
            details.changes = req.body;
        }
    }

    // Add device info
    const userAgent = getUserAgent(req);
    if (userAgent !== 'unknown') {
        details.deviceInfo = userAgent;
    }

    return details;
}

/**
 * Extract resource ID from request
 */
function extractResourceId(req: Request): string | undefined {
    return req.params.userId || req.params.id || req.params.sessionId;
}

/**
 * Logging middleware - captures and logs all API actions
 */
export const logAction = async (req: Request, res: Response, next: NextFunction) => {
    // Record start time
    req.startTime = Date.now();

    // Store original response methods to intercept them
    const originalSend = res.send;
    const originalJson = res.json;
    const originalEnd = res.end;

    let responseSent = false;
    let statusCode: number = 200;
    let responseData: any = null;

    // Intercept response methods to capture response data and status
    const captureResponse = (data: any) => {
        if (!responseSent) {
            responseData = data;
            responseSent = true;
        }
        return data;
    };

    res.send = function(data: any) {
        return originalSend.call(this, captureResponse(data));
    };

    res.json = function(data: any) {
        return originalJson.call(this, captureResponse(data));
    };

    res.end = function(...args: any[]) {
        if (!responseSent && args[0]) {
            responseData = args[0];
            responseSent = true;
        }
        return (originalEnd as any).apply(this, args);
    };

    // Capture status code
    const originalStatus = res.status;
    res.status = function(code: number) {
        statusCode = code;
        return originalStatus.call(this, code);
    };

    // Continue to next middleware
    next();

    // Log the action after response is sent (non-blocking)
    res.on('finish', async () => {
        try {
            // Only log if user is authenticated
            if (!req.user?._id) {
                return;
            }

            // Determine action type
            const action = determineActionType(req);
            if (!action) {
                return; // Don't log this action
            }

            // Extract details
            const details = extractRequestDetails(req);
            const ipAddress = getClientIP(req);
            const userAgent = getUserAgent(req);
            const resourceId = extractResourceId(req);

            // Determine status based on response
            const status = statusCode >= 200 && statusCode < 400 ? 'SUCCESS' : 'FAILED';

            // Add response time to details
            const responseTime = Date.now() - (req.startTime || Date.now());
            details.metadata = {
                ...details.metadata,
                responseTime,
                statusCode,
                method: req.method,
                path: req.path
            };

            // Create log entry asynchronously (don't wait for it)
            LogService.createLog(
                req.user._id,
                action,
                details,
                ipAddress,
                userAgent,
                status,
                resourceId
            ).catch(error => {
                console.error('Failed to create log entry:', error);
            });

        } catch (error) {
            console.error('Logging middleware error:', error);
        }
    });
};

/**
 * Specialized middleware for failed login attempts
 */
export const logFailedLogin = async (req: Request, res: Response, next: NextFunction) => {
    // Continue with normal flow first
    next();

    // Log failed login after response
    res.on('finish', async () => {
        if (res.statusCode === 401 || res.statusCode === 400) {
            try {
                // For failed login, we might not have user ID, but we can still log the attempt
                const ipAddress = getClientIP(req);
                const userAgent = getUserAgent(req);

                const details: LogDetails = {
                    description: 'Failed login attempt',
                    deviceInfo: userAgent,
                    metadata: {
                        statusCode: res.statusCode,
                        method: req.method,
                        path: req.path
                    }
                };

                // If we have a username from the request body, include it
                if (req.body?.username) {
                    details.targetUsername = req.body.username;
                }

                // Create log entry - for failed logins, we'll use a system user ID or create a placeholder
                // Since we don't have a valid user, we'll create the log with a special handling
                LogService.createLog(
                    '000000000000000000000000', // Placeholder ID for system/unknown user
                    'FAILED_LOGIN',
                    details,
                    ipAddress,
                    userAgent,
                    'FAILED',
                    undefined // resourceId
                ).catch(error => {
                    console.error('Failed to log failed login:', error);
                });

            } catch (error) {
                console.error('Failed login logging error:', error);
            }
        }
    });
};
