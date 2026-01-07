import { Request, Response } from "express"
import { UserService } from "../services/user.services";

// ============ ADMIN ENDPOINTS ============

const getAllSuperDistributors = async (req: Request, res: Response) => {
    try{
        const userId = req.user?._id;
        if(!userId) {
            return res.status(401).json({
                success: false,
                message: "Authentication required",
            });
        }
        if(req.user?.role !== 'admin') {
            return res.status(403).json({
                success: false,
                message: "Access denied - Admin only",
            });
        }
        const superDistributors = await UserService.getAllSuperDistributors();
        return res.status(200).json({
            success: true,
            data: superDistributors,
            count: superDistributors.length,
        });
    } catch(error) {
        console.error(`Error in getAllSuperDistributors: ${error}`);
        return res.status(500).json({
            success: false,
            message: "Internal server error",
        });
    }
}

const getDistributors = async (req: Request, res: Response) => {
    try{
        const userId = req.user?._id;
        if(!userId) {
            return res.status(401).json({
                success: false,
                message: "Authentication required",
            });
        }

        let distributors;
        if(req.user?.role === 'admin') {
            distributors = await UserService.getAllDistributors();
        } else if(req.user?.role === 'super_distributor') {
            distributors = await UserService.getDistributorsUnderSuperDistributor(userId);
        } else {
            return res.status(403).json({
                success: false,
                message: "Access denied",
            });
        }

        return res.status(200).json({
            success: true,
            data: distributors,
            count: distributors.length,
        })
    } catch(error) {
        console.error(`Error in getDistributors: ${error}`);
        return res.status(500).json({
            success: false,
            message: "Internal server error",
        });
    }
}

const getRetailers = async (req: Request, res: Response) => {
    try{
        const userId = req.user?._id;
        if(!userId) {
            return res.status(401).json({
                success: false,
                message: "Authentication required",
            });
        }

        let retailers;
        if(req.user?.role === 'admin') {
            retailers = await UserService.getAllRetailers();
        } else if(req.user?.role === 'super_distributor') {
            retailers = await UserService.getRetailersUnderSuperDistributor(userId);
        } else if(req.user?.role === 'distributor') {
            retailers = await UserService.getRetailersUnderDistributor(userId);
        } else {
            return res.status(403).json({
                success: false,
                message: "Access denied",
            });
        }

        return res.status(200).json({
            success: true,
            data: retailers,
            count: retailers.length,
        })
    } catch(error) {
        console.error(`Error in getRetailers: ${error}`);
        return res.status(500).json({
            success: false,
            message: "Internal server error",
        });
    }
}

const getUsers = async (req: Request, res: Response) => {
    try{
        const userId = req.user?._id;
        if(!userId) {
            return res.status(401).json({
                success: false,
                message: "Authentication required",
            });
        }

        let users;
        if(req.user?.role === 'admin') {
            users = await UserService.getAllUsers();
        } else if(req.user?.role === 'super_distributor') {
            users = await UserService.getUsersUnderSuperDistributor(userId);
        } else if(req.user?.role === 'distributor') {
            users = await UserService.getUsersUnderDistributor(userId);
        } else if(req.user?.role === 'retailer') {
            users = await UserService.getUsersUnderRetailer(userId);
        } else {
            return res.status(403).json({
                success: false,
                message: "Access denied",
            });
        }

        return res.status(200).json({
            success: true,
            data: users,
            count: users.length,
        })
    } catch(error) {
        console.error(`Error in getUsers: ${error}`);
        return res.status(500).json({
            success: false,
            message: "Internal server error",
        });
    }
}

const getStats = async (req: Request, res: Response) => {
    try{
        const userId = req.user?._id;
        if(!userId) {
            return res.status(401).json({
                success: false,
                message: "Authentication required",
            });
        }

        let stats;
        if(req.user?.role === 'admin') {
            stats = await UserService.getAdminStats();
        } else if(req.user?.role === 'super_distributor') {
            stats = await UserService.getSuperDistributorStats(userId);
        } else if(req.user?.role === 'distributor') {
            stats = await UserService.getDistributorStats(userId);
        } else if(req.user?.role === 'retailer') {
            stats = await UserService.getRetailerStats(userId);
        } else {
            return res.status(403).json({
                success: false,
                message: "Access denied",
            });
        }

        return res.status(200).json({
            success: true,
            data: stats,
        })
    } catch(error) {
        console.error(`Error in getStats: ${error}`);
        return res.status(500).json({
            success: false,
            message: "Internal server error",
        });
    }
}

// ============ SUPER DISTRIBUTOR ENDPOINTS ============

const getMyDistributors = async (req: Request, res: Response) => {
    try{
        const userId = req.user?._id;
        if(!userId) {
            return res.status(401).json({
                success: false,
                message: "Authentication required",
            });
        }
        if(req.user?.role !== 'super_distributor') {
            return res.status(403).json({
                success: false,
                message: "Access denied - Super distributors only",
            });
        }

        const distributors = await UserService.getDistributorsUnderSuperDistributor(userId);
        return res.status(200).json({
            success: true,
            data: distributors,
            count: distributors.length,
        })
    } catch(error) {
        console.error(`Error in getMyDistributors: ${error}`);
        return res.status(500).json({
            success: false,
            message: "Internal server error",
        });
    }
}

const getMyRetailers = async (req: Request, res: Response) => {
    try{
        const userId = req.user?._id;
        if(!userId) {
            return res.status(401).json({
                success: false,
                message: "Authentication required",
            });
        }
        if(req.user?.role !== 'super_distributor') {
            return res.status(403).json({
                success: false,
                message: "Access denied - Super distributors only",
            });
        }

        const retailers = await UserService.getRetailersUnderSuperDistributor(userId);
        return res.status(200).json({
            success: true,
            data: retailers,
            count: retailers.length,
        })
    } catch(error) {
        console.error(`Error in getMyRetailers: ${error}`);
        return res.status(500).json({
            success: false,
            message: "Internal server error",
        });
    }
}

const getMyUsers = async (req: Request, res: Response) => {
    try{
        const userId = req.user?._id;
        if(!userId) {
            return res.status(401).json({
                success: false,
                message: "Authentication required",
            });
        }
        if(req.user?.role !== 'super_distributor') {
            return res.status(403).json({
                success: false,
                message: "Access denied - Super distributors only",
            });
        }

        const users = await UserService.getUsersUnderSuperDistributor(userId);
        return res.status(200).json({
            success: true,
            data: users,
            count: users.length,
        })
    } catch(error) {
        console.error(`Error in getMyUsers: ${error}`);
        return res.status(500).json({
            success: false,
            message: "Internal server error",
        });
    }
}

// ============ DISTRIBUTOR ENDPOINTS ============

const getMyRetailersAsDistributor = async (req: Request, res: Response) => {
    try{
        const userId = req.user?._id;
        if(!userId) {
            return res.status(401).json({
                success: false,
                message: "Authentication required",
            });
        }
        if(req.user?.role !== 'distributor') {
            return res.status(403).json({
                success: false,
                message: "Access denied - Distributors only",
            });
        }

        const retailers = await UserService.getRetailersUnderDistributor(userId);
        return res.status(200).json({
            success: true,
            data: retailers,
            count: retailers.length,
        })
    } catch(error) {
        console.error(`Error in getMyRetailersAsDistributor: ${error}`);
        return res.status(500).json({
            success: false,
            message: "Internal server error",
        });
    }
}

const getMyUsersAsDistributor = async (req: Request, res: Response) => {
    try{
        const userId = req.user?._id;
        if(!userId) {
            return res.status(401).json({
                success: false,
                message: "Authentication required",
            });
        }
        if(req.user?.role !== 'distributor') {
            return res.status(403).json({
                success: false,
                message: "Access denied - Distributors only",
            });
        }

        const users = await UserService.getUsersUnderDistributor(userId);
        return res.status(200).json({
            success: true,
            data: users,
            count: users.length,
        })
    } catch(error) {
        console.error(`Error in getMyUsersAsDistributor: ${error}`);
        return res.status(500).json({
            success: false,
            message: "Internal server error",
        });
    }
}

// ============ RETAILER ENDPOINTS ============

const getMyUsersAsRetailer = async (req: Request, res: Response) => {
    try{
        const userId = req.user?._id;
        if(!userId) {
            return res.status(401).json({
                success: false,
                message: "Authentication required",
            });
        }
        if(req.user?.role !== 'retailer') {
            return res.status(403).json({
                success: false,
                message: "Access denied - Retailers only",
            });
        }

        const users = await UserService.getUsersUnderRetailer(userId);
        return res.status(200).json({
            success: true,
            data: users,
            count: users.length,
        })
    } catch(error) {
        console.error(`Error in getMyUsersAsRetailer: ${error}`);
        return res.status(500).json({
            success: false,
            message: "Internal server error",
        });
    }
}

const getUserById = async (req: Request, res: Response) => {
    try {
        const userId = req.user?._id;
        const targetUserId = req.params.id;

        if (!userId) {
            return res.status(401).json({
                success: false,
                message: "Authentication required",
            });
        }

        const user = await UserService.getUserById(targetUserId, req.user);
        return res.status(200).json({
            success: true,
            data: user,
        });
    } catch (error: any) {
        console.error(`Error in getUserById: ${error}`);
        const status = error.status || 500;
        return res.status(status).json({
            success: false,
            message: error.message || "Internal server error",
        });
    }
}

const getOnlineUsers = async (req: Request, res: Response) => {
    try{
        const currentUser = req.user;
        if(!currentUser) {
            return res.status(401).json({
                success: false,
                message: "Authentication required",
            });
        }

        // Get online users based on current user's role and hierarchy
        const onlineUsers = await UserService.getOnlineUsers(currentUser);
        return res.status(200).json({
            success: true,
            data: onlineUsers,
            count: onlineUsers.length,
        })
    } catch(error) {
        console.error(`Error in getOnlineUsers: ${error}`);
        return res.status(500).json({
            success: false,
            message: "Internal server error",
        });
    }
}

// ============ MUTATION ENDPOINTS ============

const updateUser = async (req: Request, res: Response) => {
    try {
        const userId = req.user?._id;
        if (!userId) {
            return res.status(401).json({
                success: false,
                message: "Authentication required",
            });
        }

        const { id } = req.params;
        const updates = req.body;

        // Check permissions based on user role
        const currentUser = req.user;
        if (!currentUser) {
            return res.status(401).json({
                success: false,
                message: "Authentication required",
            });
        }

        console.log(`updateUser controller: Calling UserService.updateUser for user ${id}`);
        const updatedUser = await UserService.updateUser(id, updates, currentUser);
        console.log(`updateUser controller: UserService.updateUser completed successfully`);
        return res.status(200).json({
            success: true,
            data: updatedUser,
            message: "User updated successfully",
        });
    } catch (error: any) {
        console.error(`Error in updateUser: ${error}`);
        return res.status(error.status || 500).json({
            success: false,
            message: error.message || "Internal server error",
        });
    }
}

const deleteUser = async (req: Request, res: Response) => {
    try {
        const userId = req.user?._id;
        if (!userId) {
            return res.status(401).json({
                success: false,
                message: "Authentication required",
            });
        }

        const { id } = req.params;

        // Check permissions based on user role
        const currentUser = req.user;
        if (!currentUser) {
            return res.status(401).json({
                success: false,
                message: "Authentication required",
            });
        }

        await UserService.deleteUser(id, currentUser);
        return res.status(200).json({
            success: true,
            message: "User deleted successfully",
        });
    } catch (error: any) {
        console.error(`Error in deleteUser: ${error}`);
        return res.status(error.status || 500).json({
            success: false,
            message: error.message || "Internal server error",
        });
    }
}

const transferCredit = async (req: Request, res: Response) => {
    try {
        const userId = req.user?._id;
        if (!userId) {
            return res.status(401).json({
                success: false,
                message: "Authentication required",
            });
        }

        const { id } = req.params;
        const { amount } = req.body;    
        console.log(amount);
        if (!amount || typeof amount !== 'number') {
            return res.status(400).json({
                success: false,
                message: "Invalid amount provided",
            });
        }

        // Check permissions based on user role
        const currentUser = req.user;
        if (!currentUser) {
            return res.status(401).json({
                success: false,
                message: "Authentication required",
            });
        }

        const result = await UserService.transferCredit(id, amount, currentUser);
        return res.status(200).json({
            success: true,
            data: result,
            message: "Credit transferred successfully",
        });
    } catch (error: any) {
        console.error(`Error in transferCredit: ${error}`);
        return res.status(error.status || 500).json({
            success: false,
            message: error.message || "Internal server error",
        });
    }
}

const adjustCredit = async (req: Request, res: Response) => {
    try {
        const userId = req.user?._id;
        if (!userId) {
            return res.status(401).json({
                success: false,
                message: "Authentication required",
            });
        }

        const { id } = req.params;
        const { amount } = req.body;

        if (!amount || typeof amount !== 'number') {
            return res.status(400).json({
                success: false,
                message: "Invalid amount provided",
            });
        }

        // Check permissions based on user role
        const currentUser = req.user;
        if (!currentUser) {
            return res.status(401).json({
                success: false,
                message: "Authentication required",
            });
        }

        const result = await UserService.adjustCredit(id, amount, currentUser);
        return res.status(200).json({
            success: true,
            data: result,
            message: "Credit adjusted successfully",
        });
    } catch (error: any) {
        console.error(`Error in adjustCredit: ${error}`);
        return res.status(error.status || 500).json({
            success: false,
            message: error.message || "Internal server error",
        });
    }
}

const banUser = async( req: Request, res: Response) => {
    try {
        const userId = req.user?._id;
        if(!userId) {
            return res.status(401).json({
                success: false,
                message: "Authentication required",
            })
        }
        const targetUserId = req.params.id;
        const targetUser = await UserService.getUserById(targetUserId, req.user);
        if(!targetUser) {
            return res.status(404).json({
                success: false, 
                message: "User not found",
            })
        }
        const result = await UserService.banUser(targetUser._id, req.user);
        return res.status(200).json({
            success: true, 
            message: "User banned successfully",
            data: result,
        })
    } catch(error: any) {
        console.error(`Error in banUser: ${error}`);
        return res.status(error.status || 500).json({
            success: false,
            message: error.message || "Internal server error",
        });
    }
}

const unBanUser = async( req: Request, res: Response) => {
    try {
        const userId = req.user?._id;
        if(!userId) {
            return res.status(401).json({
                success: false,
                message: "Authentication required",
            })
        }
        const targetUserId = req.params.id;
        const targetUser = await UserService.getUserById(targetUserId, req.user);
        if(!targetUser) {
            return res.status(404).json({
                success: false,
                message: "User not found",
            })
        }
        const result = await UserService.unbanUser(targetUser._id, req.user);
        return res.status(200).json({
            success: true,
            message: "User unbanned successfully",
            data: result,
        })
    } catch(error: any) {
        console.error(`Error in unBanUser: ${error}`);
        return res.status(error.status || 500).json({
            success: false,
            message: error.message || "Internal server error",
        });
    }
}

export {
    // Admin endpoints
    getAllSuperDistributors,
    getDistributors,
    getRetailers,
    getUsers,
    getStats,

    // Super distributor specific endpoints
    getMyDistributors,
    getMyRetailers,
    getMyUsers,

    // Distributor specific endpoints
    getMyRetailersAsDistributor,
    getMyUsersAsDistributor,

    // Retailer specific endpoints
    getMyUsersAsRetailer,

    // Online users endpoint
    getOnlineUsers,

    // Individual user endpoint
    getUserById,

    // Mutation endpoints
    updateUser,
    deleteUser,
    transferCredit,
    adjustCredit,
    banUser,
    unBanUser,
};