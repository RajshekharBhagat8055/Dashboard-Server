import Log, { ILog, LogAction, LogDetails } from '../models/log.model';
import mongoose from 'mongoose';

export interface LogFilters {
    userId?: string;
    action?: LogAction;
    status?: 'SUCCESS' | 'FAILED';
    startDate?: Date;
    endDate?: Date;
    resourceId?: string;
    search?: string; // For searching in details or usernames
}

export interface LogPagination {
    page?: number;
    limit?: number;
    sortBy?: 'createdAt' | 'action' | 'status';
    sortOrder?: 'asc' | 'desc';
}

export interface LogResult {
    logs: ILog[];
    total: number;
    page: number;
    limit: number;
    totalPages: number;
}

export class LogService {

    /**
     * Create a new log entry
     */
    static async createLog(
        userId: string,
        action: LogAction,
        details: LogDetails = {},
        ipAddress?: string,
        userAgent?: string,
        status: 'SUCCESS' | 'FAILED' = 'SUCCESS',
        resourceId?: string
    ): Promise<ILog> {
        try {
            const log = new Log({
                userId: new mongoose.Types.ObjectId(userId),
                action,
                details,
                ipAddress,
                userAgent,
                status,
                resourceId
            });

            return await log.save();
        } catch (error) {
            console.error('Error creating log:', error);
            throw new Error('Failed to create log entry');
        }
    }

    /**
     * Get logs with filtering and pagination
     */
    static async getLogs(
        filters: LogFilters = {},
        pagination: LogPagination = {}
    ): Promise<LogResult> {
        try {
            const {
                page = 1,
                limit = 50,
                sortBy = 'createdAt',
                sortOrder = 'desc'
            } = pagination;

            const skip = (page - 1) * limit;

            // Build query
            const query: any = {};

            if (filters.userId) {
                query.userId = new mongoose.Types.ObjectId(filters.userId);
            }

            if (filters.action) {
                query.action = filters.action;
            }

            if (filters.status) {
                query.status = filters.status;
            }

            if (filters.resourceId) {
                query.resourceId = filters.resourceId;
            }

            if (filters.startDate || filters.endDate) {
                query.createdAt = {};
                if (filters.startDate) {
                    query.createdAt.$gte = filters.startDate;
                }
                if (filters.endDate) {
                    query.createdAt.$lte = filters.endDate;
                }
            }

            // Text search in details (basic implementation)
            if (filters.search) {
                query.$or = [
                    { 'details.description': { $regex: filters.search, $options: 'i' } },
                    { 'details.targetUsername': { $regex: filters.search, $options: 'i' } },
                    { action: { $regex: filters.search, $options: 'i' } }
                ];
            }

            // Execute query with pagination
            const logs = await Log.find(query)
                .populate('userId', 'username uniqueId role')
                .sort({ [sortBy]: sortOrder === 'desc' ? -1 : 1 })
                .skip(skip)
                .limit(limit)
                .lean();

            const total = await Log.countDocuments(query);
            const totalPages = Math.ceil(total / limit);

            return {
                logs: logs as ILog[],
                total,
                page,
                limit,
                totalPages
            };
        } catch (error) {
            console.error('Error fetching logs:', error);
            throw new Error('Failed to fetch logs');
        }
    }

    /**
     * Get logs for a specific user
     */
    static async getLogsByUser(
        userId: string,
        pagination: LogPagination = {}
    ): Promise<LogResult> {
        return this.getLogs({ userId }, pagination);
    }

    /**
     * Get logs by action type
     */
    static async getLogsByAction(
        action: LogAction,
        pagination: LogPagination = {}
    ): Promise<LogResult> {
        return this.getLogs({ action }, pagination);
    }

    /**
     * Get recent logs (last 24 hours by default)
     */
    static async getRecentLogs(hours: number = 24): Promise<ILog[]> {
        try {
            const since = new Date(Date.now() - hours * 60 * 60 * 1000);

            return await Log.find({ createdAt: { $gte: since } })
                .populate('userId', 'username uniqueId role')
                .sort({ createdAt: -1 })
                .limit(100)
                .lean() as ILog[];
        } catch (error) {
            console.error('Error fetching recent logs:', error);
            throw new Error('Failed to fetch recent logs');
        }
    }

    /**
     * Get log statistics
     */
    static async getLogStats(startDate?: Date, endDate?: Date) {
        try {
            const dateFilter: any = startDate || endDate ? {} : undefined;
            if (dateFilter) {
                if (startDate) dateFilter.$gte = startDate;
                if (endDate) dateFilter.$lte = endDate;
            }

            const matchStage = dateFilter ? { createdAt: dateFilter } : {};

            const stats = await Log.aggregate([
                { $match: matchStage },
                {
                    $group: {
                        _id: null,
                        totalLogs: { $sum: 1 },
                        successCount: {
                            $sum: { $cond: [{ $eq: ['$status', 'SUCCESS'] }, 1, 0] }
                        },
                        failedCount: {
                            $sum: { $cond: [{ $eq: ['$status', 'FAILED'] }, 1, 0] }
                        },
                        actionCounts: {
                            $push: '$action'
                        }
                    }
                },
                {
                    $project: {
                        totalLogs: 1,
                        successCount: 1,
                        failedCount: 1,
                        successRate: {
                            $multiply: [
                                { $divide: ['$successCount', '$totalLogs'] },
                                100
                            ]
                        },
                        actionBreakdown: {
                            $arrayToObject: {
                                $map: {
                                    input: { $setUnion: ['$actionCounts'] },
                                    as: 'action',
                                    in: {
                                        k: '$$action',
                                        v: {
                                            $size: {
                                                $filter: {
                                                    input: '$actionCounts',
                                                    cond: { $eq: ['$$this', '$$action'] }
                                                }
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            ]);

            return stats[0] || {
                totalLogs: 0,
                successCount: 0,
                failedCount: 0,
                successRate: 0,
                actionBreakdown: {}
            };
        } catch (error) {
            console.error('Error fetching log stats:', error);
            throw new Error('Failed to fetch log statistics');
        }
    }

    /**
     * Clean up old logs (for maintenance)
     */
    static async cleanupOldLogs(daysToKeep: number = 90): Promise<number> {
        try {
            const cutoffDate = new Date(Date.now() - daysToKeep * 24 * 60 * 60 * 1000);

            const result = await Log.deleteMany({
                createdAt: { $lt: cutoffDate }
            });

            return result.deletedCount || 0;
        } catch (error) {
            console.error('Error cleaning up old logs:', error);
            throw new Error('Failed to cleanup old logs');
        }
    }
}
