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
        const { machine_id, outcome, limit = 50, skip = 0 } = req.query;

        // Build filter object
        const filter: any = {};
        if (machine_id) filter.machine_id = machine_id;
        if (outcome) filter.outcome = outcome;

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

export {
    getGameSessions,
    getGameSessionById,
    getGameStats,
};
