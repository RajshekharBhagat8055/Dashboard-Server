import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import { getRetailerPot, getRetailerPotHistory } from '../controllers/balatro.controller';

const balatroRouter = Router();

// GET /api/balatro/pot?retailer_id=&date=
balatroRouter.get('/pot', authenticate, getRetailerPot);

// GET /api/balatro/pot/history?retailer_id=&days=30
balatroRouter.get('/pot/history', authenticate, getRetailerPotHistory);

export default balatroRouter;
