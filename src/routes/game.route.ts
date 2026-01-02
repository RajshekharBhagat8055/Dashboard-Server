import { Router } from "express";
import { getGameSessions, getGameSessionById, getGameStats } from "../controllers/game.controller";
import { authenticate } from "../middleware/auth";

const router = Router();

// Apply authentication middleware to all game routes
router.use(authenticate);

// GET /api/games - Get all game sessions with optional filtering
router.get("/", getGameSessions);

// GET /api/games/stats - Get game statistics
router.get("/stats", getGameStats);

// GET /api/games/:sessionId - Get specific game session by session_id
router.get("/:sessionId", getGameSessionById);

export default router;
