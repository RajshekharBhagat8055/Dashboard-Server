import { ObjectId } from "mongodb";
import User from "../models/User";
import { getTicketModel } from "../models/Ticket";

export interface HierarchyUser {
    _id: ObjectId
    username: string;
    uniqueId: string;
    creditBalance: number;
    isOnline: boolean;
    isActive: boolean;
    isBanned: boolean;
    createdAt: Date;
    role: string;
    lastActivity?: Date;
    lastLogin?: Date;
    playPoints?: number;
    winPoints?: number;
    claimPoints?: number;
    endPoints?: number;
    email?: string;
    commissionRate?: number;
    plainPassword?: string | null;
}

export interface HierarchyStats {
    totalSuperDistributors?: number;
    totalDistributors: number;
    totalRetailers: number;
    totalUsers: number;
    totalPoints: number;
}

export class UserService {

    // ============ ADMIN METHODS (sees everything) ============

    static async getAllSuperDistributors(): Promise<HierarchyUser[]> {
        return await User.find({
            role: "super_distributor",
        }).select('username uniqueId creditBalance isOnline isActive isBanned createdAt role commissionRate')
        .sort({createdAt: -1})
        .lean();
    }

    static async getAllDistributors(): Promise<HierarchyUser[]> {
        const thirtyMinutesAgo = new Date(Date.now() - 30 * 60 * 1000);

        const distributors = await User.find({
            role: 'distributor',
        }).select('username uniqueId creditBalance isOnline isActive isBanned createdAt role lastActivity')
        .sort({createdAt: -1})
        .lean();

        // Use stored isOnline status from database
        return distributors.map(distributor => ({
            ...distributor,
            isOnline: distributor.isOnline || false
        }));
    }

    static async getAllRetailers(): Promise<HierarchyUser[]> {
        const thirtyMinutesAgo = new Date(Date.now() - 30 * 60 * 1000);

        const retailers = await User.find({
            role: 'retailer',
        }).select('username uniqueId creditBalance isOnline isActive isBanned createdAt role lastActivity')
        .sort({createdAt: -1})
        .lean();

        // Use stored isOnline status from database
        return retailers.map(retailer => ({
            ...retailer,
            isOnline: retailer.isOnline || false
        }));
    }

    static async getAllUsers(): Promise<HierarchyUser[]> {
        const thirtyMinutesAgo = new Date(Date.now() - 30 * 60 * 1000);

        const users = await User.find({
            role: 'user',
        }).select('username uniqueId creditBalance isOnline isActive isBanned createdAt role lastActivity')
        .sort({createdAt: -1})
        .lean();

        // Dynamically set isOnline based on recent activity
        return users.map(user => ({
            ...user,
            isOnline: user.isOnline || false
        }));
    }

    static async getAdminStats(): Promise<HierarchyStats> {
        const [superDistributorsCount, distributorsCount, retailersCount, usersCount] = await Promise.all([
            User.countDocuments({ role: 'super_distributor' }),
            User.countDocuments({ role: 'distributor' }),
            User.countDocuments({ role: 'retailer' }),
            User.countDocuments({ role: 'user' })
        ]);

        const totalPointsResult = await User.aggregate([
            { $group: { _id: null, total: { $sum: '$creditBalance' } } }
        ]);

        return {
            totalSuperDistributors: superDistributorsCount,
            totalDistributors: distributorsCount,
            totalRetailers: retailersCount,
            totalUsers: usersCount,
            totalPoints: totalPointsResult[0]?.total || 0
        };
    }

    // ============ SUPER DISTRIBUTOR METHODS ============

    static async getDistributorsUnderSuperDistributor(superDistributorId: string): Promise<HierarchyUser[]> {
        const thirtyMinutesAgo = new Date(Date.now() - 30 * 60 * 1000);

        const distributors = await User.find({
            superDistributorId: superDistributorId,
            role: 'distributor',
        }).select('username uniqueId creditBalance isOnline isActive isBanned createdAt role lastActivity commissionRate')
        .sort({createdAt: -1})
        .lean();

        // Use stored isOnline status from database
        return distributors.map(distributor => ({
            ...distributor,
            isOnline: distributor.isOnline || false
        }));
    }

    static async getRetailersUnderSuperDistributor(superDistributorId: string): Promise<HierarchyUser[]> {
        const thirtyMinutesAgo = new Date(Date.now() - 30 * 60 * 1000);

        // Get all retailers under this super distributor using the hierarchy field
        const retailers = await User.find({
            superDistributorId: superDistributorId,
            role: 'retailer'
        })
        .select('username uniqueId creditBalance isOnline isActive isBanned createdAt role lastActivity')
        .sort({createdAt: -1})
        .lean();

        // Use stored isOnline status from database
        return retailers.map(retailer => ({
            ...retailer,
            isOnline: retailer.isOnline || false
        }));
    }

    static async getUsersUnderSuperDistributor(superDistributorId: string): Promise<HierarchyUser[]> {
        // Get all users under this super distributor using the hierarchy field
        const users = await User.find({
            superDistributorId: superDistributorId,
            role: 'user'
        })
        .select('username uniqueId creditBalance isOnline isActive isBanned createdAt role lastActivity')
        .sort({createdAt: -1})
        .lean();

        // Use stored isOnline status from database
        return users.map(user => ({
            ...user,
            isOnline: user.isOnline || false
        }));
    }

    static async getSuperDistributorStats(superDistributorId: string): Promise<HierarchyStats> {
        // Get distributors count using hierarchy field
        const distributorsCount = await User.countDocuments({
            superDistributorId: superDistributorId,
            role: 'distributor'
        });

        // Get retailers count using hierarchy field
        const retailersCount = await User.countDocuments({
            superDistributorId: superDistributorId,
            role: 'retailer'
        });

        // Get users count using hierarchy field
        const usersCount = await User.countDocuments({
            superDistributorId: superDistributorId,
            role: 'user'
        });

        // Get total points from all users in the hierarchy
        // Get all user IDs in the hierarchy (SD, distributors, retailers, users)
        const hierarchyUserIds = new Set();

        // Add super distributor
        hierarchyUserIds.add(superDistributorId);

        // Add all distributors under this SD
        const distributors = await User.find({
            superDistributorId: superDistributorId,
            role: 'distributor'
        }).select('_id').lean();
        distributors.forEach(d => hierarchyUserIds.add(d._id));

        // Add all retailers under this SD
        const retailers = await User.find({
            superDistributorId: superDistributorId,
            role: 'retailer'
        }).select('_id').lean();
        retailers.forEach(r => hierarchyUserIds.add(r._id));

        // Add all users under this SD
        const users = await User.find({
            superDistributorId: superDistributorId,
            role: 'user'
        }).select('_id').lean();
        users.forEach(u => hierarchyUserIds.add(u._id));

        // Now sum all credit balances
        const totalPointsResult = await User.aggregate([
            {
                $match: {
                    _id: { $in: Array.from(hierarchyUserIds) }
                }
            },
            {
                $group: {
                    _id: null,
                    total: { $sum: '$creditBalance' }
                }
            }
        ]);

        return {
            totalDistributors: distributorsCount,
            totalRetailers: retailersCount,
            totalUsers: usersCount,
            totalPoints: totalPointsResult[0]?.total || 0
        };
    }

    // ============ DISTRIBUTOR METHODS ============

    static async getRetailersUnderDistributor(distributorId: string): Promise<HierarchyUser[]> {
        const thirtyMinutesAgo = new Date(Date.now() - 30 * 60 * 1000);

        const retailers = await User.find({
            distributorId: distributorId,
            role: 'retailer',
        }).select('username uniqueId creditBalance isOnline isActive isBanned createdAt role lastActivity commissionRate')
        .sort({createdAt: -1})
        .lean();

        // Use stored isOnline status from database
        return retailers.map(retailer => ({
            ...retailer,
            isOnline: retailer.isOnline || false
        }));
    }

    static async getUsersUnderDistributor(distributorId: string): Promise<HierarchyUser[]> {
        const thirtyMinutesAgo = new Date(Date.now() - 30 * 60 * 1000);

        // Get all users under this distributor using the hierarchy field
        const users = await User.find({
            distributorId: distributorId,
            role: 'user'
        })
        .select('username uniqueId creditBalance isOnline isActive isBanned createdAt role lastActivity')
        .sort({createdAt: -1})
        .lean();

        // Use stored isOnline status from database
        return users.map(user => ({
            ...user,
            isOnline: user.isOnline || false
        }));
    }

    static async getDistributorStats(distributorId: string): Promise<HierarchyStats> {
        // Get retailers count using hierarchy field
        const retailersCount = await User.countDocuments({
            distributorId: distributorId,
            role: 'retailer'
        });

        // Get users count using hierarchy field
        const usersCount = await User.countDocuments({
            distributorId: distributorId,
            role: 'user'
        });

        // Get total points from all hierarchy levels
        // Collect all user IDs in the hierarchy
        const hierarchyUserIds = new Set();

        // Add distributor
        hierarchyUserIds.add(distributorId);

        // Add all retailers under this distributor
        const retailers = await User.find({
            distributorId: distributorId,
            role: 'retailer'
        }).select('_id').lean();
        retailers.forEach(r => hierarchyUserIds.add(r._id));

        // Add all users under this distributor
        const users = await User.find({
            distributorId: distributorId,
            role: 'user'
        }).select('_id').lean();
        users.forEach(u => hierarchyUserIds.add(u._id));

        // Now sum all credit balances
        const totalPointsResult = await User.aggregate([
            {
                $match: {
                    _id: { $in: Array.from(hierarchyUserIds) }
                }
            },
            {
                $group: {
                    _id: null,
                    total: { $sum: '$creditBalance' }
                }
            }
        ]);

        return {
            totalDistributors: 0, // Distributors don't have distributors below them
            totalRetailers: retailersCount,
            totalUsers: usersCount,
            totalPoints: totalPointsResult[0]?.total || 0
        };
    }

    // ============ RETAILER METHODS ============

    static async getUsersUnderRetailer(retailerId: string): Promise<HierarchyUser[]> {
        const thirtyMinutesAgo = new Date(Date.now() - 30 * 60 * 1000);

        const users = await User.find({
            retailerId: retailerId,
            role: 'user',
        }).select('username uniqueId creditBalance isOnline isActive isBanned createdAt role lastActivity')
        .sort({createdAt: -1})
        .lean();

        // Use stored isOnline status from database
        return users.map(user => ({
            ...user,
            isOnline: user.isOnline || false
        }));
    }

    static async getRetailerStats(retailerId: string): Promise<HierarchyStats> {
        // Get users count
        const usersCount = await User.countDocuments({
            createdBy: retailerId,
            role: 'user'
        });

        // Get total points from all hierarchy levels
        // First, collect all user IDs in the hierarchy
        const hierarchyUserIds = new Set();

        // Add retailer
        hierarchyUserIds.add(retailerId);

        // Add all users created by retailer
        const retailerUsers = await User.find({
            createdBy: retailerId,
            role: 'user'
        }).select('_id').lean();
        retailerUsers.forEach(user => hierarchyUserIds.add(user._id));

        // Now sum all credit balances
        const totalPointsResult = await User.aggregate([
            {
                $match: {
                    _id: { $in: Array.from(hierarchyUserIds) }
                }
            },
            {
                $group: {
                    _id: null,
                    total: { $sum: '$creditBalance' }
                }
            }
        ]);

        return {
            totalDistributors: 0,
            totalRetailers: 0, // Retailers don't have retailers below them
            totalUsers: usersCount,
            totalPoints: totalPointsResult[0]?.total || 0
        };
    }

    // ============ ONLINE USERS METHODS ============

    static async getOnlineUsers(currentUser: any): Promise<HierarchyUser[]> {
        let onlineUsers: any[] = [];

        if (currentUser.role === 'admin') {
            // Admin sees all online users except admins themselves
            onlineUsers = await User.find({
                isOnline: true,
                isActive: true,
                isBanned: false,
                role: { $ne: 'admin' }
            })
            .select('username uniqueId creditBalance isOnline isActive isBanned createdAt role lastLogin lastActivity playPoints winPoints claimPoints endPoints')
            .sort({lastActivity: -1})
            .lean();
        } else if (currentUser.role === 'super_distributor') {
            const hierarchyUsers = await UserService.getUsersUnderSuperDistributor(currentUser._id.toString());
            onlineUsers = hierarchyUsers.filter(user => user.isOnline);
        } else if (currentUser.role === 'distributor') {
            const hierarchyUsers = await UserService.getUsersUnderDistributor(currentUser._id.toString());
            onlineUsers = hierarchyUsers.filter(user => user.isOnline);
        } else if (currentUser.role === 'retailer') {
            const hierarchyUsers = await UserService.getUsersUnderRetailer(currentUser._id.toString());
            onlineUsers = hierarchyUsers.filter(user => user.isOnline);
        }

        // Aggregate ticket stats for online users
        const userIds = onlineUsers.map(u => u._id);
        let ticketStatsMap = new Map<string, { playPoints: number; winPoints: number; claimPoints: number; endPoints: number }>();

        if (userIds.length > 0) {
            try {
                const Ticket = getTicketModel();
                const ticketStats = await Ticket.aggregate<{
                    _id: ObjectId;
                    playPoints: number;
                    winPoints: number;
                    claimPoints: number;
                }>([
                    { $match: { userId: { $in: userIds } } },
                    {
                        $group: {
                            _id: '$userId',
                            playPoints: { $sum: '$totalPoint' },
                            winPoints: { $sum: '$winPoint' },
                            claimPoints: {
                                $sum: { $cond: [{ $and: ['$claimed', { $gt: ['$winPoint', 0] }] }, '$winPoint', 0] }
                            }
                        }
                    }
                ]);

                for (const stat of ticketStats) {
                    const play = stat.playPoints ?? 0;
                    const win = stat.winPoints ?? 0;
                    const claim = stat.claimPoints ?? 0;
                    ticketStatsMap.set(stat._id.toString(), {
                        playPoints: play,
                        winPoints: win,
                        claimPoints: claim,
                        endPoints: play - win,
                    });
                }
            } catch (err) {
                console.error('Failed to aggregate ticket stats for online users:', err);
            }
        }

        return onlineUsers.map(user => {
            const stats = ticketStatsMap.get(user._id.toString());
            return {
                ...user,
                isOnline: user.isOnline || false,
                playPoints: stats?.playPoints ?? 0,
                winPoints: stats?.winPoints ?? 0,
                claimPoints: stats?.claimPoints ?? 0,
                endPoints: stats?.endPoints ?? 0,
            };
        });
    }

    // ============ USER METHODS ============

    static async getUserById(userId: string, currentUser: any): Promise<any> {
        const targetUser = await User.findById(userId);
        if (!targetUser) {
            const error = new Error('User not found');
            (error as any).status = 404;
            throw error;
        }

        // Check if current user can view this user
        if (currentUser.role !== 'admin') {
            let hasAccess = false;

            if (currentUser.role === 'super_distributor') {
                hasAccess = await UserService.isUserInSuperDistributorHierarchy(userId, currentUser._id);
            } else if (currentUser.role === 'distributor') {
                hasAccess = await UserService.isUserInDistributorHierarchy(userId, currentUser._id);
            } else if (currentUser.role === 'retailer') {
                hasAccess = targetUser.createdBy?.toString() === currentUser._id;
            }

            if (!hasAccess) {
                const error = new Error('Access denied - User not in your hierarchy');
                (error as any).status = 403;
                throw error;
            }
        }

        // Return user data with fields needed for editing
        return {
            _id: targetUser._id,
            username: targetUser.username,
            email: targetUser.email,
            role: targetUser.role,
            uniqueId: targetUser.uniqueId,
            creditBalance: targetUser.creditBalance,
            commissionRate: targetUser.commissionRate,
            isActive: targetUser.isActive,
            parentId: targetUser.parentId,
            createdAt: targetUser.createdAt,
            plainPassword: targetUser.plainPassword ?? null,
        };
    }

    static async getUserProfile(userId: string): Promise<HierarchyUser | null> {
        return await User.findById(userId)
            .select('username uniqueId creditBalance isOnline isActive isBanned createdAt role')
            .lean();
    }

    // ============ MUTATION METHODS ============

    static async resetPassword(userId: string, newPassword: string, currentUser: any): Promise<any> {
        if (!newPassword || newPassword.length < 6) {
            const error = new Error('Password must be at least 6 characters');
            (error as any).status = 400;
            throw error;
        }

        const targetUser = await User.findById(userId);
        if (!targetUser) {
            const error = new Error('User not found');
            (error as any).status = 404;
            throw error;
        }

        // Role-based access control
        if (currentUser.role === 'admin') {
            // Admin can reset any password
        } else if (currentUser.role === 'super_distributor') {
            if (targetUser.role === 'admin' || targetUser.role === 'super_distributor') {
                const error = new Error('Access denied');
                (error as any).status = 403;
                throw error;
            }
            const isInHierarchy = await UserService.isUserInSuperDistributorHierarchy(userId, currentUser._id);
            if (!isInHierarchy) {
                const error = new Error('Access denied - User not in your hierarchy');
                (error as any).status = 403;
                throw error;
            }
        } else if (currentUser.role === 'distributor') {
            if (!['retailer', 'user'].includes(targetUser.role)) {
                const error = new Error('Access denied');
                (error as any).status = 403;
                throw error;
            }
            const isInHierarchy = await UserService.isUserInDistributorHierarchy(userId, currentUser._id);
            if (!isInHierarchy) {
                const error = new Error('Access denied - User not in your hierarchy');
                (error as any).status = 403;
                throw error;
            }
        } else if (currentUser.role === 'retailer') {
            if (targetUser.role !== 'user') {
                const error = new Error('Access denied');
                (error as any).status = 403;
                throw error;
            }
            const isInHierarchy = targetUser.createdBy?.toString() === currentUser._id;
            if (!isInHierarchy) {
                const error = new Error('Access denied - User not in your hierarchy');
                (error as any).status = 403;
                throw error;
            }
        } else {
            const error = new Error('Access denied');
            (error as any).status = 403;
            throw error;
        }

        const updatedUser = await User.findByIdAndUpdate(
            userId,
            { $set: { password: newPassword, plainPassword: newPassword } },
            { new: true }
        ).select('username uniqueId role');

        return updatedUser;
    }

    static async isUserInDistributorHierarchy(targetUserId: string, distributorId: string): Promise<boolean> {
        // Check if the target user is in the distributor's hierarchy
        const targetUser = await User.findById(targetUserId);
        if (!targetUser) {
            console.log(`isUserInDistributorHierarchy: Target user ${targetUserId} not found`);
            return false;
        }

        console.log(`isUserInDistributorHierarchy: Checking if user ${targetUserId} (createdBy: ${targetUser.createdBy}, role: ${targetUser.role}) is in distributor ${distributorId}'s hierarchy`);

        // If target user is directly created by distributor
        if (targetUser.createdBy?.toString() === distributorId) {
            console.log(`isUserInDistributorHierarchy: User ${targetUserId} is directly created by distributor ${distributorId}`);
            return true;
        }

        // If target user is created by a retailer under this distributor
        if (targetUser.role === 'user') {
            // Find all retailers under this distributor
            const retailers = await User.find({
                createdBy: distributorId,
                role: 'retailer'
            }).select('_id').lean();

            const retailerIds = retailers.map(r => r._id.toString());
            console.log(`isUserInDistributorHierarchy: Found retailers under distributor ${distributorId}: ${retailerIds}`);

            if (retailerIds.includes(targetUser.createdBy?.toString())) {
                console.log(`isUserInDistributorHierarchy: User ${targetUserId} is created by retailer under distributor ${distributorId}`);
                return true;
            }
        }

        console.log(`isUserInDistributorHierarchy: User ${targetUserId} is NOT in distributor ${distributorId}'s hierarchy`);
        return false;
    }

    static async isUserInSuperDistributorHierarchy(targetUserId: string, superDistributorId: string): Promise<boolean> {
        // Check if the target user is in the super distributor's hierarchy
        const targetUser = await User.findById(targetUserId);
        if (!targetUser) return false;

        // If target user is directly created by super distributor
        if (targetUser.createdBy?.toString() === superDistributorId) {
            return true;
        }

        // If target user is created by a distributor under this super distributor
        if (targetUser.role === 'distributor' || targetUser.role === 'retailer' || targetUser.role === 'user') {
            // Find all distributors under this super distributor
            const distributors = await User.find({
                createdBy: superDistributorId,
                role: 'distributor'
            }).select('_id').lean();

            const distributorIds = distributors.map(d => d._id.toString());

            // Check if target user was created by one of these distributors
            if (distributorIds.includes(targetUser.createdBy?.toString())) {
                return true;
            }

            // Check if target user was created by a retailer under these distributors
            if (targetUser.role === 'user') {
                const retailers = await User.find({
                    createdBy: { $in: distributorIds },
                    role: 'retailer'
                }).select('_id').lean();

                const retailerIds = retailers.map(r => r._id.toString());

                if (retailerIds.includes(targetUser.createdBy?.toString())) {
                    return true;
                }
            }
        }

        return false;
    }

    static async updateUser(userId: string, updates: Partial<HierarchyUser>, currentUser: any): Promise<HierarchyUser> {
        console.log(`updateUser: START - User ${currentUser._id} (${currentUser.role}) trying to update user ${userId}`);
        console.log(`updateUser: Current user role: "${currentUser.role}"`);
        // Check permissions
        const targetUser = await User.findById(userId);
        if (!targetUser) {
            console.log(`updateUser: Target user ${userId} not found`);
            const error = new Error('User not found');
            (error as any).status = 404;
            throw error;
        }
        console.log(`updateUser: Target user role: "${targetUser.role}"`);

        // Permission checks based on roles
        console.log(`updateUser: Checking permissions for role: ${currentUser.role}`);
        if (currentUser.role === 'admin') {
            console.log(`updateUser: Admin user - can update anyone`);
            // Admin can update anyone
        } else if (currentUser.role === 'super_distributor') {
            console.log(`updateUser: Super distributor branch`);
            // Super distributor can only update distributors, retailers, and users under them
            if (targetUser.role === 'admin' || targetUser.role === 'super_distributor') {
                console.log(`updateUser: Super distributor cannot update ${targetUser.role}`);
                const error = new Error('Access denied');
                (error as any).status = 403;
                throw error;
            }
            // Check if target user is in super distributor's hierarchy
            const isInHierarchy = await UserService.isUserInSuperDistributorHierarchy(userId, currentUser._id);
            if (!isInHierarchy) {
                console.log(`updateUser: User not in super distributor hierarchy`);
                const error = new Error('Access denied - User not in your hierarchy');
                (error as any).status = 403;
                throw error;
            }
        } else if (currentUser.role === 'distributor') {
            console.log(`updateUser: Distributor branch - checking permissions`);
            // Distributor can only update retailers and users under them
            if (!['retailer', 'user'].includes(targetUser.role)) {
                console.log(`updateUser: Distributor cannot update role ${targetUser.role}`);
                const error = new Error('Access denied');
                (error as any).status = 403;
                throw error;
            }
            console.log(`updateUser: Role check passed, checking hierarchy`);
            // Check if target user is in distributor's hierarchy
            const isInHierarchy = await UserService.isUserInDistributorHierarchy(userId, currentUser._id);
            console.log(`updateUser: Hierarchy check result: ${isInHierarchy}`);
            if (!isInHierarchy) {
                console.log(`updateUser: User ${userId} is not in distributor ${currentUser._id}'s hierarchy`);
                const error = new Error('Access denied - User not in your hierarchy');
                (error as any).status = 403;
                throw error;
            }
            console.log(`updateUser: Permission checks passed, proceeding with update`);
        } else if (currentUser.role === 'retailer') {
            console.log(`updateUser: Retailer branch`);
            // Retailer can only update users under them
            if (targetUser.role !== 'user') {
                console.log(`updateUser: Retailer cannot update role ${targetUser.role}`);
                const error = new Error('Access denied');
                (error as any).status = 403;
                throw error;
            }
            // Check if target user is in retailer's hierarchy
            const isInHierarchy = targetUser.createdBy?.toString() === currentUser._id;
            if (!isInHierarchy) {
                console.log(`updateUser: User not in retailer hierarchy`);
                const error = new Error('Access denied - User not in your hierarchy');
                (error as any).status = 403;
                throw error;
            }
        } else {
            console.log(`updateUser: Unknown role ${currentUser.role} - access denied`);
            const error = new Error('Access denied');
            (error as any).status = 403;
            throw error;
        }

        // Validate commission rate does not exceed parent's commission
        if (updates.commissionRate !== undefined && updates.commissionRate !== null) {
            const parentId = targetUser.parentId;
            if (parentId) {
                const parentUser = await User.findById(parentId).select('commissionRate username');
                if (parentUser && (updates.commissionRate as number) > parentUser.commissionRate) {
                    const error = new Error(`Commission rate cannot exceed parent's commission of ${parentUser.commissionRate}%`);
                    (error as any).status = 400;
                    throw error;
                }
            }
        }

        // Update the user
        console.log(`updateUser: Updating user ${userId} with data:`, updates);
        const updatedUser = await User.findByIdAndUpdate(
            userId,
            { $set: updates },
            { new: true }
        ).select('username email uniqueId creditBalance commissionRate isOnline isActive isBanned createdAt role');

        if (!updatedUser) {
            console.log(`updateUser: User ${userId} not found after update attempt`);
            const error = new Error('User not found');
            (error as any).status = 404;
            throw error;
        }

        console.log(`updateUser: Successfully updated user ${userId}`);
        return updatedUser;
    }

    static async deleteUser(userId: string, currentUser: any): Promise<void> {
        // Check permissions
        const targetUser = await User.findById(userId);
        if (!targetUser) {
            const error = new Error('User not found');
            (error as any).status = 404;
            throw error;
        }

        // Permission checks based on roles
        if (currentUser.role === 'admin') {
            // Admin can delete anyone
        } else if (currentUser.role === 'super_distributor') {
            // Super distributor can only delete distributors, retailers, and users under them
            if (targetUser.role === 'admin' || targetUser.role === 'super_distributor') {
                const error = new Error('Access denied');
                (error as any).status = 403;
                throw error;
            }
            // Check if target user is in super distributor's hierarchy
            const isInHierarchy = await UserService.isUserInSuperDistributorHierarchy(userId, currentUser._id);
            if (!isInHierarchy) {
                const error = new Error('Access denied - User not in your hierarchy');
                (error as any).status = 403;
                throw error;
            }
        } else if (currentUser.role === 'distributor') {
            // Distributor can only delete retailers and users under them
            if (!['retailer', 'user'].includes(targetUser.role)) {
                const error = new Error('Access denied');
                (error as any).status = 403;
                throw error;
            }
            // Check if target user is in distributor's hierarchy
            const isInHierarchy = await UserService.isUserInDistributorHierarchy(userId, currentUser._id);
            if (!isInHierarchy) {
                const error = new Error('Access denied - User not in your hierarchy');
                (error as any).status = 403;
                throw error;
            }
        } else if (currentUser.role === 'retailer') {
            // Retailer can only delete users under them
            if (targetUser.role !== 'user') {
                const error = new Error('Access denied');
                (error as any).status = 403;
                throw error;
            }
            // Check if target user is in retailer's hierarchy
            const isInHierarchy = targetUser.createdBy?.toString() === currentUser._id;
            if (!isInHierarchy) {
                const error = new Error('Access denied - User not in your hierarchy');
                (error as any).status = 403;
                throw error;
            }
        } else {
            console.log(`updateUser: Unknown role ${currentUser.role} - access denied`);
            const error = new Error('Access denied');
            (error as any).status = 403;
            throw error;
        }

        // Delete the user
        await User.findByIdAndDelete(userId);
    }

    static async transferCredit(userId: string, amount: number, currentUser: any): Promise<HierarchyUser> {
        // Check permissions
        const targetUser = await User.findById(userId);
        if (!targetUser) {
            const error = new Error('User not found');
            (error as any).status = 404;
            throw error;
        }

        const currentUserDoc = await User.findById(currentUser._id);
        if (!currentUserDoc) {
            const error = new Error('Current user not found');
            (error as any).status = 404;
            throw error;
        }
        console.log(`Transfer attempt - User: ${currentUserDoc.username}, Current Balance: ${currentUserDoc.creditBalance}, Transfer Amount: ${amount}`);

        // Check if current user has enough credit
        if (currentUserDoc.creditBalance < amount) {
            const error = new Error(`Insufficient credit balance. You have ${currentUserDoc.creditBalance} credits but trying to transfer ${amount} credits.`);
            (error as any).status = 400;
            throw error;
        }

        // Permission checks based on roles
        if (currentUser.role === 'admin') {
            // Admin can transfer to anyone
        } else if (currentUser.role === 'super_distributor') {
            // Super distributor can only transfer to distributors, retailers, and users under them
            if (targetUser.role === 'admin' || targetUser.role === 'super_distributor') {
                const error = new Error('Access denied');
                (error as any).status = 403;
                throw error;
            }
            // Check if target user is in super distributor's hierarchy
            const isInHierarchy = await UserService.isUserInSuperDistributorHierarchy(userId, currentUser._id);
            if (!isInHierarchy) {
                const error = new Error('Access denied - User not in your hierarchy');
                (error as any).status = 403;
                throw error;
            }
        } else if (currentUser.role === 'distributor') {
            // Distributor can only transfer to retailers and users under them
            if (!['retailer', 'user'].includes(targetUser.role)) {
                const error = new Error('Access denied');
                (error as any).status = 403;
                throw error;
            }
            // Check if target user is in distributor's hierarchy
            const isInHierarchy = await UserService.isUserInDistributorHierarchy(userId, currentUser._id);
            if (!isInHierarchy) {
                const error = new Error('Access denied - User not in your hierarchy');
                (error as any).status = 403;
                throw error;
            }
        } else if (currentUser.role === 'retailer') {
            // Retailer can only transfer to users under them
            if (targetUser.role !== 'user') {
                const error = new Error('Access denied');
                (error as any).status = 403;
                throw error;
            }
            // Check if target user is in retailer's hierarchy
            const isInHierarchy = targetUser.createdBy?.toString() === currentUser._id;
            if (!isInHierarchy) {
                const error = new Error('Access denied - User not in your hierarchy');
                (error as any).status = 403;
                throw error;
            }
        } else {
            console.log(`updateUser: Unknown role ${currentUser.role} - access denied`);
            const error = new Error('Access denied');
            (error as any).status = 403;
            throw error;
        }

        // Perform the transfer
        await User.findByIdAndUpdate(currentUser._id, { $inc: { creditBalance: -amount } });
        const updatedUser = await User.findByIdAndUpdate(
            userId,
            { $inc: { creditBalance: amount } },
            { new: true }
        ).select('username uniqueId creditBalance isOnline isActive isBanned createdAt role');

        return updatedUser!;
    }

    static async adjustCredit(userId: string, amount: number, currentUser: any): Promise<HierarchyUser> {
        // Check permissions
        const targetUser = await User.findById(userId);
        if (!targetUser) {
            const error = new Error('User not found');
            (error as any).status = 404;
            throw error;
        }

        // Permission checks based on roles
        if (currentUser.role === 'admin') {
            // Admin can adjust anyone's credit
        } else if (currentUser.role === 'super_distributor') {
            // Super distributor can only adjust distributors, retailers, and users under them
            if (targetUser.role === 'admin' || targetUser.role === 'super_distributor') {
                const error = new Error('Access denied');
                (error as any).status = 403;
                throw error;
            }
            // Check if target user is in super distributor's hierarchy
            const isInHierarchy = await UserService.isUserInSuperDistributorHierarchy(userId, currentUser._id);
            if (!isInHierarchy) {
                const error = new Error('Access denied - User not in your hierarchy');
                (error as any).status = 403;
                throw error;
            }
        } else if (currentUser.role === 'distributor') {
            // Distributor can only adjust retailers and users under them
            if (!['retailer', 'user'].includes(targetUser.role)) {
                const error = new Error('Access denied');
                (error as any).status = 403;
                throw error;
            }
            // Check if target user is in distributor's hierarchy
            const isInHierarchy = await UserService.isUserInDistributorHierarchy(userId, currentUser._id);
            if (!isInHierarchy) {
                const error = new Error('Access denied - User not in your hierarchy');
                (error as any).status = 403;
                throw error;
            }
        } else if (currentUser.role === 'retailer') {
            // Retailer can only adjust users under them
            if (targetUser.role !== 'user') {
                const error = new Error('Access denied');
                (error as any).status = 403;
                throw error;
            }
            // Check if target user is in retailer's hierarchy
            const isInHierarchy = targetUser.createdBy?.toString() === currentUser._id;
            if (!isInHierarchy) {
                const error = new Error('Access denied - User not in your hierarchy');
                (error as any).status = 403;
                throw error;
            }
        } else {
            console.log(`updateUser: Unknown role ${currentUser.role} - access denied`);
            const error = new Error('Access denied');
            (error as any).status = 403;
            throw error;
        }

        // Adjust the credit
        const updatedUser = await User.findByIdAndUpdate(
            userId,
            { $inc: { creditBalance: amount } },
            { new: true }
        ).select('username uniqueId creditBalance isOnline isActive isBanned createdAt role');

        return updatedUser!;
    }

    static async banUser(userId: string, currentUser: any): Promise<HierarchyUser> {
        const targetUser = await User.findById(userId);
        if(!targetUser) {
            const error = new Error('User not found');
            (error as any).status = 404;
            throw error;
        }
        if (currentUser.role === 'admin') {
            // Admin can ban anyone
        } else if (currentUser.role === 'super_distributor') {
            if(targetUser.role === 'admin' || targetUser.role === 'super_distributor') {
                const error = new Error('Access denied');
                (error as any).status = 403;
                throw error;
            }
            // Check if target user is in super distributor's hierarchy
            const isInHierarchy = await UserService.isUserInSuperDistributorHierarchy(userId, currentUser._id);
            if (!isInHierarchy) {
                const error = new Error('Access denied - User not in your hierarchy');
                (error as any).status = 403;
                throw error;
            }
        } else if (currentUser.role === 'distributor') {
            if(!['retailer', 'user'].includes(targetUser.role)) {
                const error = new Error('Access denied');
                (error as any).status = 403;
                throw error;
            }
            // Check if target user is in distributor's hierarchy
            const isInHierarchy = await UserService.isUserInDistributorHierarchy(userId, currentUser._id);
            if (!isInHierarchy) {
                const error = new Error('Access denied - User not in your hierarchy');
                (error as any).status = 403;
                throw error;
            }
        } else if (currentUser.role === 'retailer') {
            if(targetUser.role !== 'user') {
                const error = new Error('Access denied');
                (error as any).status = 403;
                throw error;
            }
            // Check if target user is in retailer's hierarchy
            const isInHierarchy = targetUser.createdBy?.toString() === currentUser._id;
            if (!isInHierarchy) {
                const error = new Error('Access denied - User not in your hierarchy');
                (error as any).status = 403;
                throw error;
            }
        } else {
            console.log(`updateUser: Unknown role ${currentUser.role} - access denied`);
            const error = new Error('Access denied');
            (error as any).status = 403;
            throw error;
        }
        if(targetUser.isBanned) {
            const error = new Error('User already banned');
            (error as any).status = 400;
            throw error;
        }
        const updatedUser = await User.findByIdAndUpdate(userId, { $set: { isBanned: true, isActive: false, isOnline: false } }, { new: true }).select('username email uniqueId creditBalance commissionRate isOnline isActive isBanned createdAt role');
        if(!updatedUser) {
            const error = new Error('Failed to ban user');
            (error as any).status = 500;
            throw error;
        }
        return updatedUser;
    }
    static async unbanUser(userId: string, currentUser: any): Promise<HierarchyUser> {
        // Check permissions
        const targetUser = await User.findById(userId);
        if (!targetUser) {
            const error = new Error('User not found');
            (error as any).status = 404;
            throw error;
        }
    
        // Permission checks based on roles (same as banUser)
        if (currentUser.role === 'admin') {
            // Admin can unban anyone
        } else if (currentUser.role === 'super_distributor') {
            // Super distributor can only unban distributors, retailers, and users under them
            if (targetUser.role === 'admin' || targetUser.role === 'super_distributor') {
                const error = new Error('Access denied');
                (error as any).status = 403;
                throw error;
            }
            // Check if target user is in super distributor's hierarchy
            const isInHierarchy = await UserService.isUserInSuperDistributorHierarchy(userId, currentUser._id);
            if (!isInHierarchy) {
                const error = new Error('Access denied - User not in your hierarchy');
                (error as any).status = 403;
                throw error;
            }
        } else if (currentUser.role === 'distributor') {
            // Distributor can only unban retailers and users under them
            if (!['retailer', 'user'].includes(targetUser.role)) {
                const error = new Error('Access denied');
                (error as any).status = 403;
                throw error;
            }
            // Check if target user is in distributor's hierarchy
            const isInHierarchy = await UserService.isUserInDistributorHierarchy(userId, currentUser._id);
            if (!isInHierarchy) {
                const error = new Error('Access denied - User not in your hierarchy');
                (error as any).status = 403;
                throw error;
            }
        } else if (currentUser.role === 'retailer') {
            // Retailer can only unban users under them
            if (targetUser.role !== 'user') {
                const error = new Error('Access denied');
                (error as any).status = 403;
                throw error;
            }
            // Check if target user is in retailer's hierarchy
            const isInHierarchy = targetUser.createdBy?.toString() === currentUser._id;
            if (!isInHierarchy) {
                const error = new Error('Access denied - User not in your hierarchy');
                (error as any).status = 403;
                throw error;
            }
        } else {
            console.log(`updateUser: Unknown role ${currentUser.role} - access denied`);
            const error = new Error('Access denied');
            (error as any).status = 403;
            throw error;
        }
    
        // Check if user is not banned
        if (!targetUser.isBanned) {
            const error = new Error('User is not banned');
            (error as any).status = 400;
            throw error;
        }
    
        // Unban the user (but don't automatically activate - let admin decide)
        const updatedUser = await User.findByIdAndUpdate(
            userId,
            { $set: { isBanned: false, isActive: true  } }, // Keep isActive as is, let admin decide separately
            { new: true }
        ).select('username email uniqueId creditBalance commissionRate isOnline isActive isBanned createdAt role');
    
        if (!updatedUser) {
            const error = new Error('User not found');
            (error as any).status = 404;
            throw error;
        }
    
        return updatedUser;
    }
}