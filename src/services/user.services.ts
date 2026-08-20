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
    parentId?: ObjectId | string;
    parentUsername?: string;
}

export interface HierarchyStats {
    totalSuperDistributors?: number;
    totalDistributors: number;
    totalRetailers: number;
    totalUsers: number;
    totalPoints: number;
}

const LIST_FIELDS = 'username uniqueId creditBalance isOnline isActive isBanned createdAt role lastActivity commissionRate parentId';

export class UserService {

    /** Attach each user's direct parent username for Refer Name columns */
    private static async attachParentUsernames(users: any[]): Promise<HierarchyUser[]> {
        const parentIds = [...new Set(
            users
                .map((u) => u.parentId?.toString())
                .filter((id): id is string => Boolean(id))
        )];

        const parentMap = new Map<string, string>();
        if (parentIds.length > 0) {
            const parents = await User.find({ _id: { $in: parentIds } })
                .select('username')
                .lean();
            parents.forEach((p) => parentMap.set(p._id.toString(), p.username));
        }

        return users.map((u) => ({
            ...u,
            isOnline: u.isOnline || false,
            parentUsername: u.parentId ? parentMap.get(u.parentId.toString()) : undefined,
        }));
    }

    // ============ ADMIN METHODS (sees everything) ============

    static async getAllSuperDistributors(): Promise<HierarchyUser[]> {
        const users = await User.find({
            role: "super_distributor",
        }).select(LIST_FIELDS)
        .sort({createdAt: -1})
        .lean();

        return UserService.attachParentUsernames(users);
    }

    static async getAllDistributors(): Promise<HierarchyUser[]> {
        const distributors = await User.find({
            role: 'distributor',
        }).select(LIST_FIELDS)
        .sort({createdAt: -1})
        .lean();

        return UserService.attachParentUsernames(distributors);
    }

    static async getAllRetailers(): Promise<HierarchyUser[]> {
        const retailers = await User.find({
            role: 'retailer',
        }).select(LIST_FIELDS)
        .sort({createdAt: -1})
        .lean();

        return UserService.attachParentUsernames(retailers);
    }

    static async getAllUsers(): Promise<HierarchyUser[]> {
        const users = await User.find({
            role: 'user',
        }).select(LIST_FIELDS)
        .sort({createdAt: -1})
        .lean();

        return UserService.attachParentUsernames(users);
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
        const distributors = await User.find({
            superDistributorId: superDistributorId,
            role: 'distributor',
        }).select(LIST_FIELDS)
        .sort({createdAt: -1})
        .lean();

        return UserService.attachParentUsernames(distributors);
    }

    static async getRetailersUnderSuperDistributor(superDistributorId: string): Promise<HierarchyUser[]> {
        const retailers = await User.find({
            superDistributorId: superDistributorId,
            role: 'retailer'
        })
        .select(LIST_FIELDS)
        .sort({createdAt: -1})
        .lean();

        return UserService.attachParentUsernames(retailers);
    }

    static async getUsersUnderSuperDistributor(superDistributorId: string): Promise<HierarchyUser[]> {
        const users = await User.find({
            superDistributorId: superDistributorId,
            role: 'user'
        })
        .select(LIST_FIELDS)
        .sort({createdAt: -1})
        .lean();

        return UserService.attachParentUsernames(users);
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
        const retailers = await User.find({
            distributorId: distributorId,
            role: 'retailer',
        }).select(LIST_FIELDS)
        .sort({createdAt: -1})
        .lean();

        return UserService.attachParentUsernames(retailers);
    }

    static async getUsersUnderDistributor(distributorId: string): Promise<HierarchyUser[]> {
        const users = await User.find({
            distributorId: distributorId,
            role: 'user'
        })
        .select(LIST_FIELDS)
        .sort({createdAt: -1})
        .lean();

        return UserService.attachParentUsernames(users);
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
        const users = await User.find({
            retailerId: retailerId,
            role: 'user',
        }).select(LIST_FIELDS)
        .sort({createdAt: -1})
        .lean();

        return UserService.attachParentUsernames(users);
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
                hasAccess = UserService.isUserInRetailerHierarchy(targetUser, currentUser._id);
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

    static isUserInRetailerHierarchy(targetUser: any, retailerId: string): boolean {
        const retailerIdStr = retailerId.toString();
        return (
            targetUser.retailerId?.toString() === retailerIdStr ||
            targetUser.parentId?.toString() === retailerIdStr ||
            targetUser.createdBy?.toString() === retailerIdStr
        );
    }

    static async isUserInDistributorHierarchy(targetUserId: string, distributorId: string): Promise<boolean> {
        const targetUser = await User.findById(targetUserId);
        if (!targetUser) {
            return false;
        }

        const distributorIdStr = distributorId.toString();

        if (targetUser.distributorId?.toString() === distributorIdStr) {
            return true;
        }
        if (targetUser.parentId?.toString() === distributorIdStr) {
            return true;
        }
        if (targetUser.createdBy?.toString() === distributorIdStr) {
            return true;
        }

        if (targetUser.role === 'user') {
            const retailers = await User.find({
                $or: [
                    { distributorId: distributorId },
                    { parentId: distributorId },
                    { createdBy: distributorId },
                ],
                role: 'retailer',
            }).select('_id').lean();

            const retailerIds = retailers.map(r => r._id.toString());
            if (
                retailerIds.includes(targetUser.createdBy?.toString() || '') ||
                retailerIds.includes(targetUser.retailerId?.toString() || '') ||
                retailerIds.includes(targetUser.parentId?.toString() || '')
            ) {
                return true;
            }
        }

        return false;
    }

    static async isUserInSuperDistributorHierarchy(targetUserId: string, superDistributorId: string): Promise<boolean> {
        const targetUser = await User.findById(targetUserId);
        if (!targetUser) return false;

        const sdIdStr = superDistributorId.toString();

        if (targetUser.superDistributorId?.toString() === sdIdStr) {
            return true;
        }
        if (targetUser.parentId?.toString() === sdIdStr) {
            return true;
        }
        if (targetUser.createdBy?.toString() === sdIdStr) {
            return true;
        }

        if (['distributor', 'retailer', 'user'].includes(targetUser.role)) {
            const distributors = await User.find({
                $or: [
                    { superDistributorId: superDistributorId },
                    { parentId: superDistributorId },
                    { createdBy: superDistributorId },
                ],
                role: 'distributor',
            }).select('_id').lean();

            const distributorIds = distributors.map(d => d._id.toString());

            if (
                distributorIds.includes(targetUser.createdBy?.toString() || '') ||
                distributorIds.includes(targetUser.distributorId?.toString() || '') ||
                distributorIds.includes(targetUser.parentId?.toString() || '')
            ) {
                return true;
            }

            if (targetUser.role === 'user' || targetUser.role === 'retailer') {
                const retailers = await User.find({
                    $or: [
                        { superDistributorId: superDistributorId },
                        { distributorId: { $in: distributorIds } },
                        { createdBy: { $in: distributorIds } },
                    ],
                    role: 'retailer',
                }).select('_id').lean();

                const retailerIds = retailers.map(r => r._id.toString());

                if (
                    retailerIds.includes(targetUser.createdBy?.toString() || '') ||
                    retailerIds.includes(targetUser.retailerId?.toString() || '') ||
                    retailerIds.includes(targetUser.parentId?.toString() || '')
                ) {
                    return true;
                }
            }
        }

        return false;
    }

    /** All descendant user ids below the given user in the hierarchy (distributor -> retailer -> user chain). */
    static async getDescendantUserIds(targetUser: any): Promise<ObjectId[]> {
        let query: Record<string, any> | null = null;

        if (targetUser.role === 'super_distributor') {
            query = { superDistributorId: targetUser._id };
        } else if (targetUser.role === 'distributor') {
            query = { distributorId: targetUser._id };
        } else if (targetUser.role === 'retailer') {
            query = { retailerId: targetUser._id };
        }

        if (!query) {
            return [];
        }

        const descendants = await User.find(query).select('_id').lean();
        return descendants.map(d => d._id as ObjectId);
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
            const isInHierarchy = UserService.isUserInRetailerHierarchy(targetUser, currentUser._id);
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
        // super_distributor is the top of the commission chain — only 0-100 range applies
        if (
            updates.commissionRate !== undefined &&
            updates.commissionRate !== null &&
            targetUser.role !== 'super_distributor'
        ) {
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
            const isInHierarchy = UserService.isUserInRetailerHierarchy(targetUser, currentUser._id);
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

    static async transferCredit(userId: string, amount: number, currentUser: any, password: string): Promise<HierarchyUser> {
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

        const isPasswordValid = await currentUserDoc.comparePassword(password);
        if (!isPasswordValid) {
            const error = new Error('Invalid password');
            (error as any).status = 401;
            throw error;
        }

        // Permission checks based on roles
        if (currentUser.role === 'admin') {
            // Admin can transfer to anyone
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
            const isInHierarchy = UserService.isUserInRetailerHierarchy(targetUser, currentUser._id);
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

        // Funding comes from the target's direct parent, not the logged-in user
        // If the parent is admin, treat as unlimited — no balance check or deduction
        const parentUser = targetUser.parentId ? await User.findById(targetUser.parentId) : null;
        const parentIsAdmin = parentUser?.role === 'admin';

        if (parentUser && !parentIsAdmin) {
            if (parentUser.creditBalance < amount) {
                const error = new Error(`Insufficient balance in parent account. Parent has ${parentUser.creditBalance} credits.`);
                (error as any).status = 400;
                throw error;
            }
            await User.findByIdAndUpdate(parentUser._id, { $inc: { creditBalance: -amount } });
        }

        const updatedUser = await User.findByIdAndUpdate(
            userId,
            { $inc: { creditBalance: amount } },
            { new: true }
        ).select('username uniqueId creditBalance isOnline isActive isBanned createdAt role');

        return updatedUser!;
    }

    static async adjustCredit(userId: string, amount: number, currentUser: any, password: string): Promise<HierarchyUser> {
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

        const isPasswordValid = await currentUserDoc.comparePassword(password);
        if (!isPasswordValid) {
            const error = new Error('Invalid password');
            (error as any).status = 401;
            throw error;
        }

        // Permission checks based on roles
        if (currentUser.role === 'admin') {
            // Admin can adjust anyone's credit
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
            const isInHierarchy = UserService.isUserInRetailerHierarchy(targetUser, currentUser._id);
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

        if (targetUser.creditBalance < amount) {
            const error = new Error(`Insufficient credits. User has ${targetUser.creditBalance} credits but trying to subtract ${amount}.`);
            (error as any).status = 400;
            throw error;
        }

        // Subtract from target
        const updatedUser = await User.findByIdAndUpdate(
            userId,
            { $inc: { creditBalance: -amount } },
            { new: true }
        ).select('username uniqueId creditBalance isOnline isActive isBanned createdAt role');

        // Return the subtracted amount to the target's parent (skip if parent is admin)
        const parentUser = targetUser.parentId ? await User.findById(targetUser.parentId) : null;
        if (parentUser && parentUser.role !== 'admin') {
            await User.findByIdAndUpdate(parentUser._id, { $inc: { creditBalance: amount } });
        }

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
            const isInHierarchy = UserService.isUserInRetailerHierarchy(targetUser, currentUser._id);
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

        // Cascade the ban to everyone below this user in the hierarchy
        const descendantIds = await UserService.getDescendantUserIds(targetUser);
        if (descendantIds.length > 0) {
            await User.updateMany(
                { _id: { $in: descendantIds } },
                { $set: { isBanned: true, isActive: false, isOnline: false } }
            );
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
            const isInHierarchy = UserService.isUserInRetailerHierarchy(targetUser, currentUser._id);
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

        // Cascade the unban to everyone below this user in the hierarchy
        const descendantIds = await UserService.getDescendantUserIds(targetUser);
        if (descendantIds.length > 0) {
            await User.updateMany(
                { _id: { $in: descendantIds }, isBanned: true },
                { $set: { isBanned: false, isActive: true } }
            );
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

    static async resetPassword(
        userId: string,
        newPassword: string,
        currentUser: any
    ): Promise<void> {
        const targetUser = await User.findById(userId);
        if (!targetUser) {
            const error = new Error('User not found');
            (error as any).status = 404;
            throw error;
        }

        if (currentUser.role === 'admin') {
            // allowed
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
            if (targetUser.createdBy?.toString() !== currentUser._id) {
                const error = new Error('Access denied - User not in your hierarchy');
                (error as any).status = 403;
                throw error;
            }
        } else {
            const error = new Error('Access denied');
            (error as any).status = 403;
            throw error;
        }

        if (!newPassword || newPassword.length < 6) {
            const error = new Error('Password must be at least 6 characters long');
            (error as any).status = 400;
            throw error;
        }

        await User.findByIdAndUpdate(userId, {
            $set: {
                password: newPassword,
                plainPassword: newPassword,
            },
        });
    }
}