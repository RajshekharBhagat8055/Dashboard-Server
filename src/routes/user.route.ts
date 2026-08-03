import { Router } from "express";
import { authenticate } from "../middleware/auth";
import { logAction } from "../middleware/logging";
import {
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
    resetPassword,
    deleteUser,
    transferCredit,
    adjustCredit,
    banUser,
    unBanUser,

    // Hierarchy selection endpoints
    getSuperDistributorsForHierarchy,
    getDistributorsUnderSuperDistributor,
    getRetailersUnderDistributor,
    getChildrenUnderDistributor,

    // Credit context and logs
    getCreditContext,
    getCreditLogs,
} from "../controllers/user.controller";

const userRouter = Router();

// All routes require authentication
userRouter.use(authenticate);
// All authenticated routes are logged
userRouter.use(logAction);

// ============ ADMIN ENDPOINTS (admin sees everything) ============
userRouter.get('/super-distributors', getAllSuperDistributors); // Admin only
userRouter.get('/distributors', getDistributors); // Admin or Super Distributor
userRouter.get('/retailers', getRetailers); // Admin, Super Distributor, or Distributor
userRouter.get('/users', getUsers); // Admin, Super Distributor, Distributor, or Retailer
userRouter.get('/stats', getStats); // All roles get their relevant stats

// ============ SUPER DISTRIBUTOR SPECIFIC ENDPOINTS ============
userRouter.get('/my-distributors', getMyDistributors); // Super distributors only
userRouter.get('/my-retailers', getMyRetailers); // Super distributors only
userRouter.get('/my-users', getMyUsers); // Super distributors only

// ============ DISTRIBUTOR SPECIFIC ENDPOINTS ============
userRouter.get('/my-retailers-as-distributor', getMyRetailersAsDistributor); // Distributors only
userRouter.get('/my-users-as-distributor', getMyUsersAsDistributor); // Distributors only

// ============ RETAILER SPECIFIC ENDPOINTS ============
userRouter.get('/my-users-as-retailer', getMyUsersAsRetailer); // Retailers only

// ============ ONLINE USERS ENDPOINTS ============
userRouter.get('/online-users', getOnlineUsers); // All authenticated users

// ============ HIERARCHY SELECTION ENDPOINTS (for cascading dropdowns) ============
userRouter.get('/hierarchy/super-distributors', getSuperDistributorsForHierarchy); // Get SDs for hierarchy selection
userRouter.get('/hierarchy/super-distributor/:superDistributorId/distributors', getDistributorsUnderSuperDistributor); // Get distributors under SD
userRouter.get('/hierarchy/distributor/:distributorId/retailers', getRetailersUnderDistributor); // Get retailers under distributor
userRouter.get('/hierarchy/distributor/:distributorId/children', getChildrenUnderDistributor); // Get retailers + users under distributor

// ============ INDIVIDUAL USER ENDPOINTS (comes last to avoid conflicts) ============
userRouter.get('/user/:id', getUserById); // Get single user by ID

// ============ CREDIT CONTEXT & LOGS ============
userRouter.get('/user/:id/credit-context', getCreditContext); // Get credit transfer context
userRouter.get('/user/:id/credit-logs', getCreditLogs); // Get credit transaction logs

// ============ MUTATION ENDPOINTS ============
userRouter.put('/user/:id', updateUser); // Update user
userRouter.post('/user/:id/reset-password', resetPassword); // Reset user password (parent)
userRouter.delete('/user/:id', deleteUser); // Delete user
userRouter.post('/user/:id/transfer-credit', transferCredit); // Transfer credit
userRouter.post('/user/:id/adjust-credit', adjustCredit); // Adjust credit
userRouter.post('/user/:id/ban', banUser); // Ban user
userRouter.post('/user/:id/unban', unBanUser); // Unban user

export default userRouter;