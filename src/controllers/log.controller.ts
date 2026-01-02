import { Request, Response } from 'express';
import { LogService, LogFilters, LogPagination } from '../services/log.service';
import { LogAction } from '../models/log.model';

/**
 * Get all logs with filtering and pagination
 */
const getAllLogs = async (req: Request, res: Response) => {
    try {
        const userId = req.user?._id;
        if (!userId) {
            return res.status(401).json({
                success: false,
                message: 'Authentication required'
            });
        }

        // Only admins can view logs
        if (req.user?.role !== 'admin') {
            return res.status(403).json({
                success: false,
                message: 'Access denied - Admin only'
            });
        }

        // Build filters from query parameters
        const filters: LogFilters = {};

        if (req.query.userId) {
            filters.userId = req.query.userId as string;
        }

        if (req.query.action) {
            filters.action = req.query.action as LogAction;
        }

        if (req.query.status) {
            filters.status = req.query.status as 'SUCCESS' | 'FAILED';
        }

        if (req.query.resourceId) {
            filters.resourceId = req.query.resourceId as string;
        }

        if (req.query.search) {
            filters.search = req.query.search as string;
        }

        // Date filters
        if (req.query.startDate) {
            filters.startDate = new Date(req.query.startDate as string);
        }

        if (req.query.endDate) {
            filters.endDate = new Date(req.query.endDate as string);
        }

        // Pagination
        const pagination: LogPagination = {
            page: parseInt(req.query.page as string) || 1,
            limit: parseInt(req.query.limit as string) || 50,
            sortBy: (req.query.sortBy as 'createdAt' | 'action' | 'status') || 'createdAt',
            sortOrder: (req.query.sortOrder as 'asc' | 'desc') || 'desc'
        };

        const result = await LogService.getLogs(filters, pagination);

        return res.status(200).json({
            success: true,
            data: result.logs,
            pagination: {
                page: result.page,
                limit: result.limit,
                total: result.total,
                totalPages: result.totalPages
            },
            filters
        });
    } catch (error) {
        console.error('Error in getAllLogs:', error);
        return res.status(500).json({
            success: false,
            message: 'Internal server error'
        });
    }
};

/**
 * Get logs for a specific user
 */
const getLogsByUser = async (req: Request, res: Response) => {
    try {
        const userId = req.user?._id;
        if (!userId) {
            return res.status(401).json({
                success: false,
                message: 'Authentication required'
            });
        }

        // Only admins can view logs
        if (req.user?.role !== 'admin') {
            return res.status(403).json({
                success: false,
                message: 'Access denied - Admin only'
            });
        }

        const targetUserId = req.params.userId;
        if (!targetUserId) {
            return res.status(400).json({
                success: false,
                message: 'User ID is required'
            });
        }

        const pagination: LogPagination = {
            page: parseInt(req.query.page as string) || 1,
            limit: parseInt(req.query.limit as string) || 50,
            sortBy: (req.query.sortBy as 'createdAt' | 'action' | 'status') || 'createdAt',
            sortOrder: (req.query.sortOrder as 'asc' | 'desc') || 'desc'
        };

        const result = await LogService.getLogsByUser(targetUserId, pagination);

        return res.status(200).json({
            success: true,
            data: result.logs,
            pagination: {
                page: result.page,
                limit: result.limit,
                total: result.total,
                totalPages: result.totalPages
            },
            userId: targetUserId
        });
    } catch (error) {
        console.error('Error in getLogsByUser:', error);
        return res.status(500).json({
            success: false,
            message: 'Internal server error'
        });
    }
};

/**
 * Get logs by action type
 */
const getLogsByAction = async (req: Request, res: Response) => {
    try {
        const userId = req.user?._id;
        if (!userId) {
            return res.status(401).json({
                success: false,
                message: 'Authentication required'
            });
        }

        // Only admins can view logs
        if (req.user?.role !== 'admin') {
            return res.status(403).json({
                success: false,
                message: 'Access denied - Admin only'
            });
        }

        const action = req.params.action as LogAction;
        if (!action) {
            return res.status(400).json({
                success: false,
                message: 'Action type is required'
            });
        }

        const pagination: LogPagination = {
            page: parseInt(req.query.page as string) || 1,
            limit: parseInt(req.query.limit as string) || 50,
            sortBy: (req.query.sortBy as 'createdAt' | 'action' | 'status') || 'createdAt',
            sortOrder: (req.query.sortOrder as 'asc' | 'desc') || 'desc'
        };

        const result = await LogService.getLogsByAction(action, pagination);

        return res.status(200).json({
            success: true,
            data: result.logs,
            pagination: {
                page: result.page,
                limit: result.limit,
                total: result.total,
                totalPages: result.totalPages
            },
            action
        });
    } catch (error) {
        console.error('Error in getLogsByAction:', error);
        return res.status(500).json({
            success: false,
            message: 'Internal server error'
        });
    }
};

/**
 * Get recent logs (last 24 hours)
 */
const getRecentLogs = async (req: Request, res: Response) => {
    try {
        const userId = req.user?._id;
        if (!userId) {
            return res.status(401).json({
                success: false,
                message: 'Authentication required'
            });
        }

        // Only admins can view logs
        if (req.user?.role !== 'admin') {
            return res.status(403).json({
                success: false,
                message: 'Access denied - Admin only'
            });
        }

        const hours = parseInt(req.query.hours as string) || 24;
        const logs = await LogService.getRecentLogs(hours);

        return res.status(200).json({
            success: true,
            data: logs,
            count: logs.length,
            hours
        });
    } catch (error) {
        console.error('Error in getRecentLogs:', error);
        return res.status(500).json({
            success: false,
            message: 'Internal server error'
        });
    }
};

/**
 * Get log statistics
 */
const getLogStats = async (req: Request, res: Response) => {
    try {
        const userId = req.user?._id;
        if (!userId) {
            return res.status(401).json({
                success: false,
                message: 'Authentication required'
            });
        }

        // Only admins can view logs
        if (req.user?.role !== 'admin') {
            return res.status(403).json({
                success: false,
                message: 'Access denied - Admin only'
            });
        }

        let startDate: Date | undefined;
        let endDate: Date | undefined;

        if (req.query.startDate) {
            startDate = new Date(req.query.startDate as string);
        }

        if (req.query.endDate) {
            endDate = new Date(req.query.endDate as string);
        }

        const stats = await LogService.getLogStats(startDate, endDate);

        return res.status(200).json({
            success: true,
            data: stats
        });
    } catch (error) {
        console.error('Error in getLogStats:', error);
        return res.status(500).json({
            success: false,
            message: 'Internal server error'
        });
    }
};

/**
 * Search logs with flexible criteria
 */
const searchLogs = async (req: Request, res: Response) => {
    try {
        const userId = req.user?._id;
        if (!userId) {
            return res.status(401).json({
                success: false,
                message: 'Authentication required'
            });
        }

        // Only admins can view logs
        if (req.user?.role !== 'admin') {
            return res.status(403).json({
                success: false,
                message: 'Access denied - Admin only'
            });
        }

        const searchTerm = req.query.q as string;
        if (!searchTerm) {
            return res.status(400).json({
                success: false,
                message: 'Search term is required'
            });
        }

        const filters: LogFilters = {
            search: searchTerm
        };

        // Add additional filters if provided
        if (req.query.action) {
            filters.action = req.query.action as LogAction;
        }

        if (req.query.status) {
            filters.status = req.query.status as 'SUCCESS' | 'FAILED';
        }

        const pagination: LogPagination = {
            page: parseInt(req.query.page as string) || 1,
            limit: parseInt(req.query.limit as string) || 50,
            sortBy: (req.query.sortBy as 'createdAt' | 'action' | 'status') || 'createdAt',
            sortOrder: (req.query.sortOrder as 'asc' | 'desc') || 'desc'
        };

        const result = await LogService.getLogs(filters, pagination);

        return res.status(200).json({
            success: true,
            data: result.logs,
            pagination: {
                page: result.page,
                limit: result.limit,
                total: result.total,
                totalPages: result.totalPages
            },
            searchTerm
        });
    } catch (error) {
        console.error('Error in searchLogs:', error);
        return res.status(500).json({
            success: false,
            message: 'Internal server error'
        });
    }
};

export {
    getAllLogs,
    getLogsByUser,
    getLogsByAction,
    getRecentLogs,
    getLogStats,
    searchLogs
};
