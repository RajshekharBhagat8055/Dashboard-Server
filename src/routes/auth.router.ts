import { Router } from "express";
import { login, logout, refreshToken, getProfile, changePassword, createUser } from "../controllers/auth.controller";
import { authenticate } from "../middleware/auth";

const authRouter = Router();

// Public routes
authRouter.post('/login', login);
authRouter.post('/refresh', refreshToken);

// Protected routes (require authentication)
authRouter.post('/logout', authenticate, logout);
authRouter.get('/profile', authenticate, getProfile);
authRouter.post('/change-password', authenticate, changePassword);
authRouter.post('/users', authenticate, createUser);

export default authRouter;