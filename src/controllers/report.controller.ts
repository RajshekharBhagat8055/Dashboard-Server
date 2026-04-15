import { Request, Response } from 'express';
import { ReportService } from '../services/report.service';

const parseDateFilter = (req: Request): { from?: Date; to?: Date } => {
  const fromDate = req.query.fromDate as string | undefined;
  const toDate = req.query.toDate as string | undefined;

  const dateFilter: { from?: Date; to?: Date } = {};
  if (fromDate) {
    const from = new Date(fromDate);
    if (!Number.isNaN(from.getTime())) {
      dateFilter.from = from;
    }
  }
  if (toDate) {
    const to = new Date(toDate);
    if (!Number.isNaN(to.getTime())) {
      to.setHours(23, 59, 59, 999);
      dateFilter.to = to;
    }
  }
  return dateFilter;
};

const getTurnoverReport = async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ success: false, message: 'Authentication required' });
    }

    const data = await ReportService.getTurnoverReport(
      { _id: req.user._id, role: req.user.role as any },
      parseDateFilter(req),
      req.query.search as string | undefined,
    );

    return res.status(200).json({ success: true, data });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message || 'Internal server error' });
  }
};

const getTransactionsReport = async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ success: false, message: 'Authentication required' });
    }

    const page = Math.max(1, parseInt((req.query.page as string) || '1', 10));
    const limit = Math.max(1, Math.min(200, parseInt((req.query.limit as string) || '10', 10)));

    const data = await ReportService.getTransactionsReport(
      { _id: req.user._id, role: req.user.role as any },
      parseDateFilter(req),
      {
        search: req.query.search as string | undefined,
        type: req.query.type as string | undefined,
        page,
        limit,
      },
    );

    return res.status(200).json({ success: true, data });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message || 'Internal server error' });
  }
};

const getCommissionPayoutReport = async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ success: false, message: 'Authentication required' });
    }

    const data = await ReportService.getCommissionPayoutReport(
      { _id: req.user._id, role: req.user.role as any },
      parseDateFilter(req),
      req.query.role as string | undefined,
      req.query.search as string | undefined,
    );

    return res.status(200).json({ success: true, data });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message || 'Internal server error' });
  }
};

const getAdminCommissionReport = async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ success: false, message: 'Authentication required' });
    }

    const data = await ReportService.getAdminCommissionReport(
      { _id: req.user._id, role: req.user.role as any },
      parseDateFilter(req),
      req.query.search as string | undefined,
    );

    return res.status(200).json({ success: true, data });
  } catch (error: any) {
    const status = error.message?.includes('Admin only') ? 403 : 500;
    return res.status(status).json({ success: false, message: error.message || 'Internal server error' });
  }
};

export {
  getTurnoverReport,
  getTransactionsReport,
  getCommissionPayoutReport,
  getAdminCommissionReport,
};
