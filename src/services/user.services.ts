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
        return await User.find({
            role: 'distributor',
        }).select('username uniqueId creditBalance isOnline isActive isBanned createdAt role')
        .sort({createdAt: -1})
        .lean();
    }

    static async getAllRetailers(): Promise<HierarchyUser[]> {
        return await User.find({
            role: 'retailer',
        }).select('username uniqueId creditBalance isOnline isActive isBanned createdAt role')
        .sort({createdAt: -1})
        .lean();
    }

    static async getAllUsers(): Promise<HierarchyUser[]> {
        return await User.find({
            role: 'user',
        }).select('username uniqueId creditBalance isOnline isActive isBanned createdAt role')
        .sort({createdAt: -1})
        .lean();
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
        return await User.find({
            createdBy: superDistributorId,
            role: 'distributor',
        }).select('username uniqueId creditBalance isOnline isActive isBanned createdAt role')
        .sort({createdAt: -1})
        .lean();
    }

    static async getRetailersUnderSuperDistributor(superDistributorId: string): Promise<HierarchyUser[]> {
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
        .select('username uniqueId creditBalance isOnline isActive isBanned createdAt role')
        .sort({createdAt: -1})
        .lean();

        // Get retailers created by distributors under this super distributor
        let distributorRetailers: any[] = [];
        if (distributorIds.length > 0) {
            distributorRetailers = await User.find({
                createdBy: { $in: distributorIds },
                role: 'retailer'
            })
            .select('username uniqueId creditBalance isOnline isActive isBanned createdAt role')
            .sort({createdAt: -1})
            .lean();
        }

        // Combine both arrays and sort by creation date
        const allRetailers = [...directRetailers, ...distributorRetailers]
            .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

        return allRetailers;
    }

    static async getUsersUnderSuperDistributor(superDistributorId: string): Promise<HierarchyUser[]> {
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
        .select('username uniqueId creditBalance isOnline isActive isBanned createdAt role')
        .sort({createdAt: -1})
        .lean();

        // Get users created directly by distributors under this super distributor
        let distributorUsers: any[] = [];
        if (distributorIds.length > 0) {
            distributorUsers = await User.find({
                createdBy: { $in: distributorIds },
                role: 'user'
            })
            .select('username uniqueId creditBalance isOnline isActive isBanned createdAt role')
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
            .select('username uniqueId creditBalance isOnline isActive isBanned createdAt role')
            .sort({createdAt: -1})
            .lean();
        }

        // Combine all arrays and sort by creation date
        const allUsers = [...directUsers, ...distributorUsers, ...retailerUsers]
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
        return await User.find({
            createdBy: distributorId,
            role: 'retailer',
        }).select('username uniqueId creditBalance isOnline isActive isBanned createdAt role')
        .sort({createdAt: -1})
        .lean();
    }

    static async getUsersUnderDistributor(distributorId: string): Promise<HierarchyUser[]> {
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
        .select('username uniqueId creditBalance isOnline isActive isBanned createdAt role')
        .sort({createdAt: -1})
        .lean();

        // Get users under those retailers
        const retailerUsers = await User.find({
            createdBy: { $in: retailerIds },
            role: 'user'
        })
        .select('username uniqueId creditBalance isOnline isActive isBanned createdAt role')
        .sort({createdAt: -1})
        .lean();

        // Combine both arrays and sort by creation date
        const allUsers = [...directUsers, ...retailerUsers]
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
        return await User.find({
            createdBy: retailerId,
            role: 'user',
        }).select('username uniqueId creditBalance isOnline isActive isBanned createdAt role')
        .sort({createdAt: -1})
        .lean();
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

    static async getOnlineUsers(): Promise<HierarchyUser[]> {
        return await User.find({
            isOnline: true,
            role: 'user' // Only show end users who are online
        })
        .select('username uniqueId creditBalance isOnline isActive isBanned createdAt role lastLogin playPoints winPoints claimPoints endPoints')
        .sort({lastLogin: -1})
        .lean();
    }

    // ============ USER METHODS ============

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
        ).select('username uniqueId creditBalance isOnline isActive isBanned createdAt role');

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

        // Check if current user has enough credit
        if (currentUserDoc.creditBalance < amount) {
            const error = new Error('Insufficient credit balance');
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
}