import { Router } from "express";
import { login, logout, refreshToken, getProfile, changePassword, createUser, getSkillGameToken, getDusKaDumToken } from "../controllers/auth.controller";
import { authenticate } from "../middleware/auth";
import { logAction, logFailedLogin } from "../middleware/logging";

const authRouter = Router();

// Public routes
authRouter.post('/login', logFailedLogin, login);
authRouter.post('/refresh', refreshToken);

// Combined middleware for authenticated and logged routes
const authenticatedAndLogged = [authenticate, logAction];

// Protected routes (require authentication and logging)
authRouter.post('/logout', ...authenticatedAndLogged, logout);
authRouter.get('/profile', ...authenticatedAndLogged, getProfile);
authRouter.post('/change-password', ...authenticatedAndLogged, changePassword);
authRouter.post('/users', ...authenticatedAndLogged, createUser);
authRouter.get('/skill-game-token', authenticate, getSkillGameToken); // No logging needed for token generation
authRouter.get('/dus-ka-dum-token', authenticate, getDusKaDumToken);

export default authRouter;