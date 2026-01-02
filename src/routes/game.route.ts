import { Router } from "express";
import { getGameSessions, getGameSessionById, getGameStats, getMachines } from "../controllers/game.controller";
import { authenticate } from "../middleware/auth";
import { logAction } from "../middleware/logging";

const router = Router();

// Apply authentication middleware to all game routes
router.use(authenticate);
// All authenticated routes are logged
router.use(logAction);

// GET /api/games - Get all game sessions with optional filtering
router.get("/", getGameSessions);

// GET /api/games/stats - Get game statistics
router.get("/stats", getGameStats);

// GET /api/games/machines - Get machines with aggregated stats
router.get("/machines", getMachines);

// GET /api/games/:sessionId - Get specific game session by session_id
router.get("/:sessionId", getGameSessionById);

export default router;
