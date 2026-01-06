import { Request, Response } from "express"
import GameSession from "../models/game.model";

// ============ GAME ENDPOINTS ============

const getGameSessions = async (req: Request, res: Response) => {
    try{
        const userId = req.user?._id;
        if(!userId) {
            return res.status(401).json({
                success: false,
                message: "Authentication required",
            });
        }

        // Get query parameters for filtering
        const { machine_id, outcome, limit = 50, skip = 0, startDate, endDate } = req.query;

        // Build filter object
        const filter: any = {};
        if (machine_id) filter.machine_id = machine_id;
        if (outcome) filter.outcome = outcome;

        // Add date filtering if provided
        if (startDate || endDate) {
            if (startDate && endDate) {
                // Both dates provided - filter sessions within the date range
                filter.start_time = {
                    $gte: (startDate as string) + " 00:00:00",
                    $lte: (endDate as string) + " 23:59:59"
                };
            } else if (startDate) {
                // Only start date - filter sessions from this date onwards
                filter.start_time = { $gte: (startDate as string) + " 00:00:00" };
            } else if (endDate) {
                // Only end date - filter sessions up to this date
                filter.start_time = { $lte: (endDate as string) + " 23:59:59" };
            }
        }

        // Get game sessions with summary data
        const gameSessions = await GameSession.find(filter)
            .select('session_id machine_id run_number outcome final_score max_ante_reached rounds_completed time_spent_readable start_time end_time createdAt')
            .sort({ createdAt: -1 })
            .limit(parseInt(limit as string))
            .skip(parseInt(skip as string))
            .lean();

        // Get total count for pagination
        const totalCount = await GameSession.countDocuments(filter);

        return res.status(200).json({
            success: true,
            data: gameSessions,
            totalCount,
            count: gameSessions.length,
        });
    } catch(error) {
        console.error(`Error in getGameSessions: ${error}`);
        return res.status(500).json({
            success: false,
            message: "Internal server error",
        });
    }
}

const getGameSessionById = async (req: Request, res: Response) => {
    try{
        const userId = req.user?._id;
        if(!userId) {
            return res.status(401).json({
                success: false,
                message: "Authentication required",
            });
        }

        const { sessionId } = req.params;

        if (!sessionId) {
            return res.status(400).json({
                success: false,
                message: "Session ID is required",
            });
        }

        const gameSession = await GameSession.findOne({ session_id: parseInt(sessionId) }).lean();

        if (!gameSession) {
            return res.status(404).json({
                success: false,
                message: "Game session not found",
            });
        }

        return res.status(200).json({
            success: true,
            data: gameSession,
        });
    } catch(error) {
        console.error(`Error in getGameSessionById: ${error}`);
        return res.status(500).json({
            success: false,
            message: "Internal server error",
        });
    }
}

const getGameStats = async (req: Request, res: Response) => {
    try{
        const userId = req.user?._id;
        if(!userId) {
            return res.status(401).json({
                success: false,
                message: "Authentication required",
            });
        }

        const { machine_id } = req.query;
        const stats = await GameSession.getStats(machine_id as string | null);

        return res.status(200).json({
            success: true,
            data: stats,
        });
    } catch(error) {
        console.error(`Error in getGameStats: ${error}`);
        return res.status(500).json({
            success: false,
            message: "Internal server error",
        });
    }
}

const getMachines = async (req: Request, res: Response) => {
    try{
        const userId = req.user?._id;
        if(!userId) {
            return res.status(401).json({
                success: false,
                message: "Authentication required",
            });
        }

        const { startDate, endDate } = req.query;

        // Build aggregation pipeline
        const pipeline: any[] = [];

        // Add date filtering if provided
        if (startDate || endDate) {
            const dateFilter: any = {};

            if (startDate && endDate) {
                // Both dates provided - filter sessions within the date range
                dateFilter.start_time = {
                    $gte: (startDate as string) + " 00:00:00",
                    $lte: (endDate as string) + " 23:59:59"
                };
            } else if (startDate) {
                // Only start date - filter sessions from this date onwards
                dateFilter.start_time = { $gte: (startDate as string) + " 00:00:00" };
            } else if (endDate) {
                // Only end date - filter sessions up to this date
                dateFilter.start_time = { $lte: (endDate as string) + " 23:59:59" };
            }

            pipeline.push({ $match: dateFilter });
        }

        // Get unique machines with their aggregated stats
        pipeline.push(
            {
                $group: {
                    _id: '$machine_id',
                    machine_id: { $first: '$machine_id' },
                    total_sessions: { $sum: 1 },
                    wins: {
                        $sum: { $cond: [{ $eq: ['$outcome', 'win'] }, 1, 0] }
                    },
                    losses: {
                        $sum: { $cond: [{ $eq: ['$outcome', 'loss'] }, 1, 0] }
                    },
                    abandoned: {
                        $sum: { $cond: [{ $eq: ['$outcome', 'abandoned'] }, 1, 0] }
                    },
                    cash_out: {
                        $sum: { $cond: [{ $eq: ['$outcome', 'cash_out'] }, 1, 0] }
                    },
                    incomplete: {
                        $sum: { $cond: [{ $eq: ['$outcome', 'incomplete'] }, 1, 0] }
                    },
                    avg_final_score: { $avg: '$final_score' },
                    max_final_score: { $max: '$final_score' },
                    avg_max_ante: { $avg: '$max_ante_reached' },
                    max_max_ante: { $max: '$max_ante_reached' },
                    total_rounds: { $sum: '$rounds_completed' },
                    avg_rounds: { $avg: '$rounds_completed' },
                    last_session_date: { $max: '$end_time' },
                    total_starting_money: { $sum: '$starting_money' },
                    total_money_claimed: { $sum: '$money_claimed' },
                    total_session_net_profit: { $sum: '$session_net_profit' }
                }
            },
            {
                $sort: { last_session_date: -1 }
            }
        );

        const machines = await GameSession.aggregate(pipeline);

        return res.status(200).json({
            success: true,
            data: machines,
            totalCount: machines.length,
        });
    } catch(error) {
        console.error(`Error in getMachines: ${error}`);
        return res.status(500).json({
            success: false,
            message: "Internal server error",
        });
    }
}

export {
    getGameSessions,
    getGameSessionById,
    getGameStats,
    getMachines,
};
