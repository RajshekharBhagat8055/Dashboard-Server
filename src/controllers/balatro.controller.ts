import { Request, Response } from 'express';
import mongoose from 'mongoose';
import RetailerPot from '../models/retailerPot.model';
import { UserService } from '../services/user.services';

function getTodayDateString(): string {
    return new Date().toISOString().slice(0, 10);
}

function getDifficultyLabel(balance: number): string {
    if (balance >= 500) return 'normal';
    if (balance >= 100) return 'hard';
    return 'extreme';
}

/**
 * Resolve which retailer IDs the requesting user can see.
 * Admin → any retailer_id from query param (or all)
 * Retailer → only their own _id
 * Distributor / super_distributor → their subordinate retailers
 */
async function getAccessibleRetailerIds(userId: string, role: string): Promise<mongoose.Types.ObjectId[] | null> {
    if (role === 'admin') return null; // null = no restriction

    if (role === 'retailer') {
        return [new mongoose.Types.ObjectId(userId)];
    }

    let retailers: any[] = [];
    if (role === 'distributor') {
        retailers = await UserService.getRetailersUnderDistributor(userId);
    } else if (role === 'super_distributor') {
        retailers = await UserService.getRetailersUnderSuperDistributor(userId);
    }

    return retailers.map((r: any) => new mongoose.Types.ObjectId(String(r._id)));
}

/**
 * GET /api/balatro/pot
 * Query params: retailer_id (optional for admin), date (optional, defaults to today)
 *
 * Returns today's (or specified date's) pot record for the given retailer.
 * Retailers can only see their own pot.
 */
export const getRetailerPot = async (req: Request, res: Response) => {
    try {
        const userId = req.user?._id?.toString();
        const role = req.user?.role;
        if (!userId || !role) {
            return res.status(401).json({ success: false, message: 'Authentication required' });
        }

        const date = (req.query.date as string) || getTodayDateString();
        let targetRetailerId: string | undefined = req.query.retailer_id as string;

        if (role === 'retailer') {
            // Retailers can only see their own pot
            targetRetailerId = userId;
        } else if (!targetRetailerId) {
            return res.status(400).json({ success: false, message: 'retailer_id query param is required' });
        }

        // Access control: non-admins cannot query retailers outside their hierarchy
        if (role !== 'admin') {
            const accessible = await getAccessibleRetailerIds(userId, role);
            if (accessible && !accessible.some((id) => id.toString() === targetRetailerId)) {
                return res.status(403).json({ success: false, message: 'Access denied' });
            }
        }

        const pot = await RetailerPot.findOne({
            retailer_id: new mongoose.Types.ObjectId(targetRetailerId),
            date,
        });

        const balance = pot?.pot_balance ?? 0;

        return res.status(200).json({
            success: true,
            data: {
                retailer_id: targetRetailerId,
                date,
                pot_balance: balance,
                total_collected: pot?.total_collected ?? 0,
                total_paid_out: pot?.total_paid_out ?? 0,
                difficulty: getDifficultyLabel(balance),
            },
        });
    } catch (error) {
        console.error('[BALATRO POT] getRetailerPot error:', error);
        return res.status(500).json({ success: false, message: 'Internal server error' });
    }
};

/**
 * GET /api/balatro/pot/history
 * Query params: retailer_id (optional for admin), days (default 30)
 *
 * Returns the last N days of pot records for a retailer, newest first.
 */
export const getRetailerPotHistory = async (req: Request, res: Response) => {
    try {
        const userId = req.user?._id?.toString();
        const role = req.user?.role;
        if (!userId || !role) {
            return res.status(401).json({ success: false, message: 'Authentication required' });
        }

        const days = Math.min(parseInt(req.query.days as string) || 30, 90);
        let targetRetailerId: string | undefined = req.query.retailer_id as string;

        if (role === 'retailer') {
            targetRetailerId = userId;
        } else if (!targetRetailerId) {
            return res.status(400).json({ success: false, message: 'retailer_id query param is required' });
        }

        if (role !== 'admin') {
            const accessible = await getAccessibleRetailerIds(userId, role);
            if (accessible && !accessible.some((id) => id.toString() === targetRetailerId)) {
                return res.status(403).json({ success: false, message: 'Access denied' });
            }
        }

        // Compute the start date (N days ago, inclusive)
        const startDate = new Date();
        startDate.setDate(startDate.getDate() - (days - 1));
        const startDateStr = startDate.toISOString().slice(0, 10);

        const pots = await RetailerPot.find({
            retailer_id: new mongoose.Types.ObjectId(targetRetailerId),
            date: { $gte: startDateStr },
        })
            .sort({ date: -1 })
            .select('-__v')
            .lean();

        const enriched = pots.map((p) => ({
            ...p,
            difficulty: getDifficultyLabel(p.pot_balance),
        }));

        return res.status(200).json({
            success: true,
            retailer_id: targetRetailerId,
            days,
            data: enriched,
        });
    } catch (error) {
        console.error('[BALATRO POT] getRetailerPotHistory error:', error);
        return res.status(500).json({ success: false, message: 'Internal server error' });
    }
};
