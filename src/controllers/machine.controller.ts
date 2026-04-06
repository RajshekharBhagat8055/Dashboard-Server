import { Request, Response } from 'express';
import mongoose from 'mongoose';
import crypto from 'crypto';
import Machine from '../models/machine.model';
import EnrollmentCode from '../models/enrollmentCode.model';
import User from '../models/User';
import { UserService } from '../services/user.services';

// Returns machine _id strings accessible to the user. null = admin (no restriction).
async function getAccessibleMachineIds(userId: string, role: string): Promise<string[] | null> {
    if (role === 'admin') return null;

    let retailerIds: any[] = [];

    if (role === 'retailer') {
        retailerIds = [userId];
    } else if (role === 'distributor') {
        const retailers = await UserService.getRetailersUnderDistributor(userId);
        retailerIds = retailers.map((r: any) => r._id.toString());
    } else if (role === 'super_distributor') {
        const retailers = await UserService.getRetailersUnderSuperDistributor(userId);
        retailerIds = retailers.map((r: any) => r._id.toString());
    } else {
        return [];
    }

    const oidList = retailerIds.map((id: any) => new mongoose.Types.ObjectId(String(id)));
    const machines = await Machine.find({ retailer_id: { $in: oidList } }).select('_id');
    return machines.map((m: any) => m._id.toString());
}

export const getMachinesForUser = async (req: Request, res: Response) => {
    try {
        const userId = req.user?._id?.toString();
        const role = req.user?.role;
        if (!userId || !role) {
            return res.status(401).json({ success: false, message: 'Authentication required' });
        }

        // Retailers need the balatro entitlement
        if (role === 'retailer') {
            const dbUser = await User.findById(userId).select('entitlements');
            if (!dbUser?.entitlements?.includes('balatro')) {
                return res.status(403).json({ success: false, message: 'Balatro entitlement required' });
            }
        }

        let query: any = {};
        if (role === 'admin') {
            const retailerId = req.query.retailerId;
            if (retailerId && typeof retailerId === 'string') {
                if (!mongoose.Types.ObjectId.isValid(retailerId)) {
                    return res.status(400).json({ success: false, message: 'Invalid retailerId' });
                }
                query.retailer_id = new mongoose.Types.ObjectId(retailerId);
            }
        } else if (role === 'retailer') {
            query.retailer_id = new mongoose.Types.ObjectId(userId);
        } else if (role === 'distributor') {
            const retailers = await UserService.getRetailersUnderDistributor(userId);
            query.retailer_id = { $in: retailers.map((r: any) => r._id) };
        } else if (role === 'super_distributor') {
            const retailers = await UserService.getRetailersUnderSuperDistributor(userId);
            query.retailer_id = { $in: retailers.map((r: any) => r._id) };
        }

        const machines = await Machine.find(query).select('-api_key_hash').sort({ created_at: -1 }).lean();

        const now = Date.now();
        const result = machines.map((m: any) => ({
            ...m,
            machine_id: m._id.toString(),
            online: m.last_heartbeat ? (now - new Date(m.last_heartbeat).getTime()) < 120_000 : false,
        }));

        return res.status(200).json({ success: true, data: result, totalCount: result.length });
    } catch (err) {
        console.error('getMachinesForUser error:', err);
        return res.status(500).json({ success: false, message: 'Internal server error' });
    }
};

export const getMachineById = async (req: Request, res: Response) => {
    try {
        const userId = req.user?._id?.toString();
        const role = req.user?.role;
        const { machineId } = req.params;
        if (!userId || !role) return res.status(401).json({ success: false, message: 'Authentication required' });

        const machine = await Machine.findById(machineId).select('-api_key_hash').lean() as any;
        if (!machine) return res.status(404).json({ success: false, message: 'Machine not found' });

        if (role !== 'admin') {
            const allowedIds = await getAccessibleMachineIds(userId, role);
            if (allowedIds !== null && !allowedIds.includes(machine._id.toString())) {
                return res.status(403).json({ success: false, message: 'Access denied' });
            }
        }

        return res.status(200).json({ success: true, data: { ...machine, machine_id: machine._id.toString() } });
    } catch (err) {
        console.error('getMachineById error:', err);
        return res.status(500).json({ success: false, message: 'Internal server error' });
    }
};

export const updateMachine = async (req: Request, res: Response) => {
    try {
        if (req.user?.role !== 'admin') {
            return res.status(403).json({ success: false, message: 'Admin only' });
        }
        const { machineId } = req.params;
        const { label } = req.body;

        const machine = await Machine.findByIdAndUpdate(machineId, { label }, { new: true }).select('-api_key_hash');
        if (!machine) return res.status(404).json({ success: false, message: 'Machine not found' });

        return res.status(200).json({ success: true, data: machine });
    } catch (err) {
        console.error('updateMachine error:', err);
        return res.status(500).json({ success: false, message: 'Internal server error' });
    }
};

export const deregisterMachine = async (req: Request, res: Response) => {
    try {
        if (req.user?.role !== 'admin') {
            return res.status(403).json({ success: false, message: 'Admin only' });
        }
        const { machineId } = req.params;

        const machine = await Machine.findByIdAndUpdate(
            machineId,
            { is_active: false, revoked_at: new Date() },
            { new: true }
        ).select('-api_key_hash');
        if (!machine) return res.status(404).json({ success: false, message: 'Machine not found' });

        return res.status(200).json({ success: true, data: machine });
    } catch (err) {
        console.error('deregisterMachine error:', err);
        return res.status(500).json({ success: false, message: 'Internal server error' });
    }
};

export const createEnrollmentCode = async (req: Request, res: Response) => {
    try {
        if (req.user?.role !== 'admin') {
            return res.status(403).json({ success: false, message: 'Admin only' });
        }

        const { retailer_id, maxUses = 1, ttlMinutes = 10080 } = req.body;
        if (!retailer_id) {
            return res.status(400).json({ success: false, message: 'retailer_id is required' });
        }

        const retailer = await User.findById(retailer_id).select('role entitlements machine_quota') as any;
        if (!retailer || retailer.role !== 'retailer') {
            return res.status(404).json({ success: false, message: 'Retailer not found' });
        }
        if (!retailer.entitlements?.includes('balatro')) {
            return res.status(403).json({ success: false, message: 'Retailer does not have balatro entitlement' });
        }

        const activeMachines = await Machine.countDocuments({ retailer_id, is_active: true });
        if (activeMachines >= retailer.machine_quota) {
            return res.status(409).json({
                success: false,
                message: `Retailer at machine quota (${activeMachines}/${retailer.machine_quota})`
            });
        }

        const code = 'BALATRO-' + crypto.randomBytes(4).toString('hex').toUpperCase();
        const expires_at = new Date(Date.now() + Number(ttlMinutes) * 60_000);

        const enrollment = await EnrollmentCode.create({
            code,
            retailer_id,
            created_by: req.user._id,
            quota_remaining: Number(maxUses),
            expires_at,
        });

        return res.status(201).json({
            success: true,
            data: {
                _id: enrollment._id,
                code: enrollment.code,
                retailer_id,
                quota_remaining: enrollment.quota_remaining,
                expires_at: enrollment.expires_at,
            },
        });
    } catch (err) {
        console.error('createEnrollmentCode error:', err);
        return res.status(500).json({ success: false, message: 'Internal server error' });
    }
};

export const getEnrollmentCodes = async (req: Request, res: Response) => {
    try {
        const userId = req.user?._id?.toString();
        const role = req.user?.role;
        if (!userId || !role) return res.status(401).json({ success: false, message: 'Authentication required' });

        let query: any = {};
        if (role === 'retailer') {
            query.retailer_id = new mongoose.Types.ObjectId(userId);
        } else if (role !== 'admin') {
            return res.status(403).json({ success: false, message: 'Access denied' });
        }

        const codes = await EnrollmentCode.find(query).sort({ created_at: -1 }).lean();
        return res.status(200).json({ success: true, data: codes, totalCount: codes.length });
    } catch (err) {
        console.error('getEnrollmentCodes error:', err);
        return res.status(500).json({ success: false, message: 'Internal server error' });
    }
};

export const revokeEnrollmentCode = async (req: Request, res: Response) => {
    try {
        if (req.user?.role !== 'admin') {
            return res.status(403).json({ success: false, message: 'Admin only' });
        }
        const { codeId } = req.params;

        const code = await EnrollmentCode.findByIdAndUpdate(codeId, { quota_remaining: 0 }, { new: true });
        if (!code) return res.status(404).json({ success: false, message: 'Enrollment code not found' });

        return res.status(200).json({ success: true, data: code });
    } catch (err) {
        console.error('revokeEnrollmentCode error:', err);
        return res.status(500).json({ success: false, message: 'Internal server error' });
    }
};

export { getAccessibleMachineIds };
