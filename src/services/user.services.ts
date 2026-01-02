import { ObjectId } from "mongodb";
import User from "../models/User";

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
        }).select('username uniqueId creditBalance isOnline isActive isBanned createdAt role')
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
            createdBy: superDistributorId,
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

    static async getRetailersUnderSuperDistributor(superDistributorId: string): Promise<HierarchyUser[]> {
        const thirtyMinutesAgo = new Date(Date.now() - 30 * 60 * 1000);

        // Get all distributors under this super distributor
        const distributors = await User.find({
            createdBy: superDistributorId,
            role: 'distributor'
        }).select('_id').lean();

        const distributorIds = distributors.map(d => d._id);

        // Get retailers created directly by the super distributor
        const directRetailers = await User.find({
            createdBy: superDistributorId,
            role: 'retailer'
        })
        .select('username uniqueId creditBalance isOnline isActive isBanned createdAt role lastActivity')
        .sort({createdAt: -1})
        .lean();

        // Get retailers created by distributors under this super distributor
        let distributorRetailers: any[] = [];
        if (distributorIds.length > 0) {
            distributorRetailers = await User.find({
                createdBy: { $in: distributorIds },
                role: 'retailer'
            })
            .select('username uniqueId creditBalance isOnline isActive isBanned createdAt role lastActivity')
            .sort({createdAt: -1})
            .lean();
        }

        // Combine both arrays, dynamically calculate isOnline, and sort by creation date
        const allRetailers = [...directRetailers, ...distributorRetailers]
            .map(retailer => ({
                ...retailer,
                isOnline: retailer.isOnline || false
            }))
            .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

        return allRetailers;
    }

    static async getUsersUnderSuperDistributor(superDistributorId: string): Promise<HierarchyUser[]> {
        const thirtyMinutesAgo = new Date(Date.now() - 30 * 60 * 1000);

        // Get distributors under super distributor
        const distributors = await User.find({
            createdBy: superDistributorId,
            role: 'distributor'
        }).select('_id').lean();

        const distributorIds = distributors.map(d => d._id);

        // Get retailers created directly by the super distributor
        const directRetailers = await User.find({
            createdBy: superDistributorId,
            role: 'retailer'
        }).select('_id').lean();

        // Get retailers created by distributors under this super distributor
        let distributorRetailers: any[] = [];
        if (distributorIds.length > 0) {
            distributorRetailers = await User.find({
                createdBy: { $in: distributorIds },
                role: 'retailer'
            }).select('_id').lean();
        }

        const allRetailerIds = [...directRetailers, ...distributorRetailers].map(r => r._id);

        // Get users created directly by the super distributor
        const directUsers = await User.find({
            createdBy: superDistributorId,
            role: 'user'
        })
        .select('username uniqueId creditBalance isOnline isActive isBanned createdAt role lastActivity')
        .sort({createdAt: -1})
        .lean();

        // Get users created directly by distributors under this super distributor
        let distributorUsers: any[] = [];
        if (distributorIds.length > 0) {
            distributorUsers = await User.find({
                createdBy: { $in: distributorIds },
                role: 'user'
            })
            .select('username uniqueId creditBalance isOnline isActive isBanned createdAt role lastActivity')
            .sort({createdAt: -1})
            .lean();
        }

        // Get users created by retailers under this super distributor
        let retailerUsers: any[] = [];
        if (allRetailerIds.length > 0) {
            retailerUsers = await User.find({
                createdBy: { $in: allRetailerIds },
                role: 'user'
            })
            .select('username uniqueId creditBalance isOnline isActive isBanned createdAt role lastActivity')
            .sort({createdAt: -1})
            .lean();
        }

        // Combine all arrays, dynamically calculate isOnline, and sort by creation date
        const allUsers = [...directUsers, ...distributorUsers, ...retailerUsers]
            .map(user => ({
                ...user,
                isOnline: user.isOnline || false
            }))
            .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

        return allUsers;
    }

    static async getSuperDistributorStats(superDistributorId: string): Promise<HierarchyStats> {
        // Get distributors count
        const distributorsCount = await User.countDocuments({
            createdBy: superDistributorId,
            role: 'distributor'
        });

        // Get distributors IDs for further queries
        const distributors = await User.find({
            createdBy: superDistributorId,
            role: 'distributor'
        }).select('_id').lean();

        const distributorIds = distributors.map(d => d._id);

        // Get retailers count (both via distributors and direct creation)
        const directRetailersCount = await User.countDocuments({
            createdBy: superDistributorId,
            role: 'retailer'
        });

        let distributorRetailersCount = 0;
        if (distributorIds.length > 0) {
            distributorRetailersCount = await User.countDocuments({
                createdBy: { $in: distributorIds },
                role: 'retailer'
            });
        }
        const retailersCount = directRetailersCount + distributorRetailersCount;

        // Get all retailer IDs for users count
        const directRetailers = await User.find({
            createdBy: superDistributorId,
            role: 'retailer'
        }).select('_id').lean();

        let distributorRetailers: any[] = [];
        if (distributorIds.length > 0) {
            distributorRetailers = await User.find({
                createdBy: { $in: distributorIds },
                role: 'retailer'
            }).select('_id').lean();
        }

        const allRetailerIds = [...directRetailers, ...distributorRetailers].map(r => r._id);

        // Get users count (via retailers, distributors, and direct creation)
        const directUsersCount = await User.countDocuments({
            createdBy: superDistributorId,
            role: 'user'
        });

        // Users created directly by distributors under this super distributor
        let distributorUsersCount = 0;
        if (distributorIds.length > 0) {
            distributorUsersCount = await User.countDocuments({
                createdBy: { $in: distributorIds },
                role: 'user'
            });
        }

        let retailerUsersCount = 0;
        if (allRetailerIds.length > 0) {
            retailerUsersCount = await User.countDocuments({
                createdBy: { $in: allRetailerIds },
                role: 'user'
            });
        }
        const usersCount = directUsersCount + distributorUsersCount + retailerUsersCount;

        // Get total points from all hierarchy levels
        const totalPointsResult = await User.aggregate([
            {
                $match: {
                    $or: [
                        { createdBy: superDistributorId, role: 'distributor' },
                        { createdBy: superDistributorId, role: 'retailer' },     // Direct retailers
                        { createdBy: { $in: distributorIds }, role: 'retailer' }, // Via distributors
                        { createdBy: superDistributorId, role: 'user' },         // Direct users
                        { createdBy: { $in: distributorIds }, role: 'user' },    // Users created by distributors
                        { createdBy: { $in: allRetailerIds }, role: 'user' }     // Via retailers
                    ]
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
            createdBy: distributorId,
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

    static async getUsersUnderDistributor(distributorId: string): Promise<HierarchyUser[]> {
        const thirtyMinutesAgo = new Date(Date.now() - 30 * 60 * 1000);

        // Get retailers under this distributor
        const retailers = await User.find({
            createdBy: distributorId,
            role: 'retailer'
        }).select('_id').lean();

        const retailerIds = retailers.map(r => r._id);

        // Get users created directly by this distributor
        const directUsers = await User.find({
            createdBy: distributorId,
            role: 'user'
        })
        .select('username uniqueId creditBalance isOnline isActive isBanned createdAt role lastActivity')
        .sort({createdAt: -1})
        .lean();

        // Get users under those retailers
        const retailerUsers = await User.find({
            createdBy: { $in: retailerIds },
            role: 'user'
        })
        .select('username uniqueId creditBalance isOnline isActive isBanned createdAt role lastActivity')
        .sort({createdAt: -1})
        .lean();

        // Combine both arrays, dynamically calculate isOnline, and sort by creation date
        const allUsers = [...directUsers, ...retailerUsers]
            .map(user => ({
                ...user,
                isOnline: user.isOnline || false
            }))
            .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

        return allUsers;
    }

    static async getDistributorStats(distributorId: string): Promise<HierarchyStats> {
        // Get retailers count
        const retailersCount = await User.countDocuments({
            createdBy: distributorId,
            role: 'retailer'
        });

        // Get retailers IDs for further queries
        const retailers = await User.find({
            createdBy: distributorId,
            role: 'retailer'
        }).select('_id').lean();

        const retailerIds = retailers.map(r => r._id);

        // Get users count (direct users + users via retailers)
        const directUsersCount = await User.countDocuments({
            createdBy: distributorId,
            role: 'user'
        });

        const retailerUsersCount = await User.countDocuments({
            createdBy: { $in: retailerIds },
            role: 'user'
        });

        const usersCount = directUsersCount + retailerUsersCount;

        // Get total points
        const totalPointsResult = await User.aggregate([
            {
                $match: {
                    $or: [
                        { createdBy: distributorId, role: 'retailer' },
                        { createdBy: distributorId, role: 'user' }, // Direct users
                        { createdBy: { $in: retailerIds }, role: 'user' }
                    ]
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
            createdBy: retailerId,
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

        // Get total points
        const totalPointsResult = await User.aggregate([
            {
                $match: {
                    createdBy: retailerId,
                    role: 'user'
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
        // Consider users online if they have been active within the last 30 minutes
        const thirtyMinutesAgo = new Date(Date.now() - 30 * 60 * 1000);

        let onlineUsers: any[] = [];

        if (currentUser.role === 'admin') {
            // Admin sees all online users in the system
            onlineUsers = await User.find({
                lastActivity: { $gte: thirtyMinutesAgo },
                isActive: true,
                isBanned: false
            })
            .select('username uniqueId creditBalance isOnline isActive isBanned createdAt role lastLogin lastActivity playPoints winPoints claimPoints endPoints')
            .sort({lastActivity: -1})
            .lean();
        } else if (currentUser.role === 'super_distributor') {
            // Super distributor sees online users in their hierarchy
            // Get all users created by this super distributor and their descendants
            const hierarchyUsers = await UserService.getUsersUnderSuperDistributor(currentUser._id.toString());

            // Filter to only online users
            onlineUsers = hierarchyUsers.filter(user =>
                user.lastActivity && user.lastActivity >= thirtyMinutesAgo
            );
        } else if (currentUser.role === 'distributor') {
            // Distributor sees online users in their hierarchy
            const hierarchyUsers = await UserService.getUsersUnderDistributor(currentUser._id.toString());

            // Filter to only online users
            onlineUsers = hierarchyUsers.filter(user =>
                user.lastActivity && user.lastActivity >= thirtyMinutesAgo
            );
        } else if (currentUser.role === 'retailer') {
            // Retailer sees online users in their hierarchy
            const hierarchyUsers = await UserService.getUsersUnderRetailer(currentUser._id.toString());

            // Filter to only online users
            onlineUsers = hierarchyUsers.filter(user =>
                user.lastActivity && user.lastActivity >= thirtyMinutesAgo
            );
        }

        // Use the stored isOnline status from database (set during login/logout)
        return onlineUsers.map(user => ({
            ...user,
            isOnline: user.isOnline || false
        }));
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
        if (currentUser.role !== 'admin' && targetUser.parentId?.toString() !== currentUser._id) {
            const error = new Error('Access denied');
            (error as any).status = 403;
            throw error;
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
            createdAt: targetUser.createdAt
        };
    }

    static async getUserProfile(userId: string): Promise<HierarchyUser | null> {
        return await User.findById(userId)
            .select('username uniqueId creditBalance isOnline isActive isBanned createdAt role')
            .lean();
    }

    // ============ MUTATION METHODS ============

    static async updateUser(userId: string, updates: Partial<HierarchyUser>, currentUser: any): Promise<HierarchyUser> {
        // Check permissions
        const targetUser = await User.findById(userId);
        if (!targetUser) {
            const error = new Error('User not found');
            (error as any).status = 404;
            throw error;
        }

        // Permission checks based on roles
        if (currentUser.role === 'admin') {
            // Admin can update anyone
        } else if (currentUser.role === 'super_distributor') {
            // Super distributor can only update distributors, retailers, and users under them
            if (targetUser.role === 'admin' || targetUser.role === 'super_distributor') {
                const error = new Error('Access denied');
                (error as any).status = 403;
                throw error;
            }
        } else if (currentUser.role === 'distributor') {
            // Distributor can only update retailers and users under them
            if (!['retailer', 'user'].includes(targetUser.role)) {
                const error = new Error('Access denied');
                (error as any).status = 403;
                throw error;
            }
        } else if (currentUser.role === 'retailer') {
            // Retailer can only update users under them
            if (targetUser.role !== 'user') {
                const error = new Error('Access denied');
                (error as any).status = 403;
                throw error;
            }
        } else {
            const error = new Error('Access denied');
            (error as any).status = 403;
            throw error;
        }

        // Update the user
        const updatedUser = await User.findByIdAndUpdate(
            userId,
            { $set: updates },
            { new: true }
        ).select('username email uniqueId creditBalance commissionRate isOnline isActive isBanned createdAt role');

        if (!updatedUser) {
            const error = new Error('User not found');
            (error as any).status = 404;
            throw error;
        }

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
        } else if (currentUser.role === 'distributor') {
            // Distributor can only delete retailers and users under them
            if (!['retailer', 'user'].includes(targetUser.role)) {
                const error = new Error('Access denied');
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
        } else {
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
        } else if (currentUser.role === 'distributor') {
            // Distributor can only transfer to retailers and users under them
            if (!['retailer', 'user'].includes(targetUser.role)) {
                const error = new Error('Access denied');
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
        } else {
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
        } else if (currentUser.role === 'distributor') {
            // Distributor can only adjust retailers and users under them
            if (!['retailer', 'user'].includes(targetUser.role)) {
                const error = new Error('Access denied');
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
        } else {
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
        } else if (currentUser.role === 'distributor') {
            if(!['retailer', 'user'].includes(targetUser.role)) {
                const error = new Error('Access denied');
                (error as any).status = 403;
                throw error;
            }
        } else if (currentUser.role === 'retailer') {
            if(targetUser.role !== 'user') {
                const error = new Error('Access denied');
                (error as any).status = 403;
                throw error;
            }
        } else {
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
        } else if (currentUser.role === 'distributor') {
            // Distributor can only unban retailers and users under them
            if (!['retailer', 'user'].includes(targetUser.role)) {
                const error = new Error('Access denied');
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
        } else {
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