import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import { logAction } from '../middleware/logging';
import {
  getAdminCommissionReport,
  getCommissionPayoutReport,
  getGameHistoryReport,
  getTransactionsReport,
  getTurnoverReport,
  postDeleteGameHistoryRange,
} from '../controllers/report.controller';

const reportRouter = Router();

reportRouter.use(authenticate);
reportRouter.use(logAction);

reportRouter.get('/turnover', getTurnoverReport);
reportRouter.get('/transactions', getTransactionsReport);
reportRouter.get('/commission-payout', getCommissionPayoutReport);
reportRouter.get('/admin-commission', getAdminCommissionReport);
reportRouter.get('/game-history', getGameHistoryReport);
reportRouter.post('/delete-range', postDeleteGameHistoryRange);

export default reportRouter;
