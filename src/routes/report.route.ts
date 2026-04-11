import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import {
  getTurnoverReport,
  getTransactionReport,
  getCommissionPayoutReport,
  getAdminCommissionReport,
  postReportDeleteRange
} from '../controllers/report.controller';

const reportRouter = Router();
reportRouter.use(authenticate);
reportRouter.get('/turnover', getTurnoverReport);
reportRouter.get('/transactions', getTransactionReport);
reportRouter.get('/commission', getCommissionPayoutReport);
reportRouter.get('/admin-commission', getAdminCommissionReport);
reportRouter.post('/delete-range', postReportDeleteRange);

export default reportRouter;
