import { Request, Response } from "express"
import mongoose from "mongoose";
import GameSession from "../models/game.model";
import Machine from "../models/machine.model";
import { getAccessibleMachineIds } from "./machine.controller";

type MachineInventoryLean = {
    _id: mongoose.Types.ObjectId;
    label?: string;
    device_public_id?: string;
};

const emptyMachineStats = {
    total_sessions: 0,
    wins: 0,
    losses: 0,
    abandoned: 0,
    cash_out: 0,
    incomplete: 0,
    avg_final_score: null as number | null,
    max_final_score: null as number | null,
    avg_max_ante: null as number | null,
    max_max_ante: null as number | null,
    total_rounds: 0,
    avg_rounds: null as number | null,
    last_session_date: null as string | null,
    total_money_deposited: 0,
    total_starting_money: 0,
    total_money_claimed: 0,
    total_session_net_profit: 0,
};

/** Ensure every enrolled machine appears in the list, with zeroed stats when there are no sessions in range. */
function mergeInventoryWithStats(
    inventory: MachineInventoryLean[],
    aggregated: any[],
): any[] {
    const byId = new Map<string, any>();
    for (const row of aggregated) {
        byId.set(row.machine_id, row);
    }

    const merged = inventory.map((doc) => {
        const id = doc._id.toString();
        const stats = byId.get(id);
        return {
            ...emptyMachineStats,
            ...(stats || {}),
            _id: id,
            machine_id: id,
            label: doc.label,
            device_public_id: doc.device_public_id,
        };
    });

    merged.sort((a, b) => {
        const ta = a.last_session_date ? new Date(a.last_session_date).getTime() : 0;
        const tb = b.last_session_date ? new Date(b.last_session_date).getTime() : 0;
        if (tb !== ta) return tb - ta;
        return String(a.machine_id).localeCompare(String(b.machine_id));
    });

    return merged;
}

// ============ GAME ENDPOINTS ============

const getGameSessions = async (req: Request, res: Response) => {
    try {
        const userId = req.user?._id?.toString();
        const role = req.user?.role;
        if (!userId) {
            return res.status(401).json({ success: false, message: "Authentication required" });
        }

        const { machine_id, outcome, limit = 50, skip = 0, startDate, endDate } = req.query;

        const filter: any = {};
        if (machine_id) filter.machine_id = machine_id;
        if (outcome) filter.outcome = outcome;

        if (startDate || endDate) {
            if (startDate && endDate) {
                filter.start_time = {
                    $gte: (startDate as string) + " 00:00:00",
                    $lte: (endDate as string) + " 23:59:59"
                };
            } else if (startDate) {
                filter.start_time = { $gte: (startDate as string) + " 00:00:00" };
            } else if (endDate) {
                filter.start_time = { $lte: (endDate as string) + " 23:59:59" };
            }
        }

        // Scope by accessible machines for non-admins
        const allowedIds = await getAccessibleMachineIds(userId, role!);
        if (allowedIds !== null) {
            if (allowedIds.length === 0) {
                return res.status(200).json({ success: true, data: [], totalCount: 0, count: 0 });
            }
            if (filter.machine_id) {
                // Specific machine requested — verify it's in allowed set
                if (!allowedIds.includes(filter.machine_id as string)) {
                    return res.status(200).json({ success: true, data: [], totalCount: 0, count: 0 });
                }
            } else {
                filter.machine_id = { $in: allowedIds };
            }
        }

        const gameSessions = await GameSession.find(filter)
            .select('session_id machine_id run_number outcome final_score max_ante_reached rounds_completed time_spent_readable start_time end_time createdAt')
            .sort({ createdAt: -1 })
            .limit(parseInt(limit as string))
            .skip(parseInt(skip as string))
            .lean();

        const totalCount = await GameSession.countDocuments(filter);

        return res.status(200).json({ success: true, data: gameSessions, totalCount, count: gameSessions.length });
    } catch (error) {
        console.error(`Error in getGameSessions: ${error}`);
        return res.status(500).json({ success: false, message: "Internal server error" });
    }
}

const getGameSessionById = async (req: Request, res: Response) => {
    try {
        const userId = req.user?._id?.toString();
        const role = req.user?.role;
        if (!userId) {
            return res.status(401).json({ success: false, message: "Authentication required" });
        }

        const { sessionId } = req.params;
        if (!sessionId) {
            return res.status(400).json({ success: false, message: "Session ID is required" });
        }

        const gameSession = await GameSession.findOne({ session_id: parseInt(sessionId) }).lean() as any;
        if (!gameSession) {
            return res.status(404).json({ success: false, message: "Game session not found" });
        }

        // Scope check for non-admins
        if (role !== 'admin') {
            const allowedIds = await getAccessibleMachineIds(userId, role!);
            if (allowedIds !== null && !allowedIds.includes(gameSession.machine_id)) {
                return res.status(403).json({ success: false, message: "Access denied" });
            }
        }

        return res.status(200).json({ success: true, data: gameSession });
    } catch (error) {
        console.error(`Error in getGameSessionById: ${error}`);
        return res.status(500).json({ success: false, message: "Internal server error" });
    }
}

const getGameStats = async (req: Request, res: Response) => {
    try {
        const userId = req.user?._id?.toString();
        const role = req.user?.role;
        if (!userId) {
            return res.status(401).json({ success: false, message: "Authentication required" });
        }

        const { machine_id } = req.query;

        const allowedIds = await getAccessibleMachineIds(userId, role!);

        // Build machine_id constraint
        let machineFilter: string | null = (machine_id as string) || null;
        if (allowedIds !== null) {
            if (allowedIds.length === 0) {
                return res.status(200).json({ success: true, data: [] });
            }
            if (machineFilter && !allowedIds.includes(machineFilter)) {
                return res.status(200).json({ success: true, data: [] });
            }
            // No specific machine_id — pass null to getStats (returns all) then filter results
        }

        const stats = await GameSession.getStats(machineFilter);

        // For non-admin without a specific machine filter, narrow stats to allowed machines
        if (allowedIds !== null && !machine_id) {
            const filtered = (stats as any[]).filter((s: any) =>
                allowedIds.includes(s._id) || allowedIds.includes(s.machine_id)
            );
            return res.status(200).json({ success: true, data: filtered });
        }

        return res.status(200).json({ success: true, data: stats });
    } catch (error) {
        console.error(`Error in getGameStats: ${error}`);
        return res.status(500).json({ success: false, message: "Internal server error" });
    }
}

const getMachines = async (req: Request, res: Response) => {
    try {
        const userId = req.user?._id?.toString();
        const role = req.user?.role;
        if (!userId) {
            return res.status(401).json({ success: false, message: "Authentication required" });
        }

        const { startDate, endDate } = req.query;

        const pipeline: any[] = [];
        let inventoryMachines: MachineInventoryLean[] | null = null;

        if (role === 'admin' && req.query.retailerId) {
            const rid = req.query.retailerId as string;
            if (!mongoose.Types.ObjectId.isValid(rid)) {
                return res.status(400).json({ success: false, message: 'Invalid retailerId' });
            }
            const retailerOid = new mongoose.Types.ObjectId(rid);
            inventoryMachines = await Machine.find({ retailer_id: retailerOid })
                .select('_id label device_public_id')
                .sort({ created_at: -1 })
                .lean() as MachineInventoryLean[];
            const retailerMachineIds = inventoryMachines.map((m) => m._id.toString());
            if (retailerMachineIds.length === 0) {
                return res.status(200).json({ success: true, data: [], totalCount: 0 });
            }
            pipeline.push({ $match: { machine_id: { $in: retailerMachineIds } } });
        }

        // Scope by accessible machines (first stage)
        const allowedIds = await getAccessibleMachineIds(userId, role!);
        if (allowedIds !== null) {
            if (allowedIds.length === 0) {
                return res.status(200).json({ success: true, data: [], totalCount: 0 });
            }
            pipeline.push({ $match: { machine_id: { $in: allowedIds } } });
            if (!inventoryMachines) {
                const oidList = allowedIds.map((id) => new mongoose.Types.ObjectId(String(id)));
                inventoryMachines = await Machine.find({ _id: { $in: oidList } })
                    .select('_id label device_public_id')
                    .sort({ created_at: -1 })
                    .lean() as MachineInventoryLean[];
            }
        }

        if (startDate || endDate) {
            const dateFilter: any = {};
            if (startDate && endDate) {
                dateFilter.start_time = {
                    $gte: (startDate as string) + " 00:00:00",
                    $lte: (endDate as string) + " 23:59:59"
                };
            } else if (startDate) {
                dateFilter.start_time = { $gte: (startDate as string) + " 00:00:00" };
            } else if (endDate) {
                dateFilter.start_time = { $lte: (endDate as string) + " 23:59:59" };
            }
            pipeline.push({ $match: dateFilter });
        }

        pipeline.push(
            {
                $group: {
                    _id: '$machine_id',
                    machine_id: { $first: '$machine_id' },
                    total_sessions: { $sum: 1 },
                    wins: { $sum: { $cond: [{ $eq: ['$outcome', 'win'] }, 1, 0] } },
                    losses: { $sum: { $cond: [{ $eq: ['$outcome', 'loss'] }, 1, 0] } },
                    abandoned: { $sum: { $cond: [{ $eq: ['$outcome', 'abandoned'] }, 1, 0] } },
                    cash_out: { $sum: { $cond: [{ $eq: ['$outcome', 'cash_out'] }, 1, 0] } },
                    incomplete: { $sum: { $cond: [{ $eq: ['$outcome', 'incomplete'] }, 1, 0] } },
                    avg_final_score: { $avg: '$final_score' },
                    max_final_score: { $max: '$final_score' },
                    avg_max_ante: { $avg: '$max_ante_reached' },
                    max_max_ante: { $max: '$max_ante_reached' },
                    total_rounds: { $sum: '$rounds_completed' },
                    avg_rounds: { $avg: '$rounds_completed' },
                    last_session_date: { $max: '$end_time' },
                    total_money_deposited: { $sum: '$money_deposited' },
                    total_starting_money: { $sum: '$starting_money' },
                    total_money_claimed: { $sum: '$money_claimed' },
                    total_session_net_profit: { $sum: '$session_net_profit' }
                }
            },
            { $sort: { last_session_date: -1 } }
        );

        const machines = await GameSession.aggregate(pipeline);

        if (inventoryMachines && inventoryMachines.length > 0) {
            const merged = mergeInventoryWithStats(inventoryMachines, machines);
            return res.status(200).json({ success: true, data: merged, totalCount: merged.length });
        }

        return res.status(200).json({ success: true, data: machines, totalCount: machines.length });
    } catch (error) {
        console.error(`Error in getMachines: ${error}`);
        return res.status(500).json({ success: false, message: "Internal server error" });
    }
}

export {
    getGameSessions,
    getGameSessionById,
    getGameStats,
    getMachines,
};
