import { Request, Response } from 'express';
import { ReportService } from '../services/report.service';
import { parseReportYmdRange } from '../utils/reportDateRange';

const parseDateFilter = (req: Request) => parseReportYmdRange(req.query as Record<string, unknown>) ?? {};

const getTurnoverReport = async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ success: false, message: 'Authentication required' });
    }

    const parentId = typeof req.query.parent_id === 'string' && req.query.parent_id.trim()
      ? req.query.parent_id.trim()
      : undefined;
    const childRole = typeof req.query.child_role === 'string' && req.query.child_role.trim()
      ? req.query.child_role.trim()
      : undefined;

    const data = await ReportService.getTurnoverReport(
      { _id: req.user._id, role: req.user.role as any },
      parseDateFilter(req),
      { search: req.query.search as string | undefined, parentId, childRole },
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

const getGameHistoryReport = async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ success: false, message: 'Authentication required' });
    }

    const data = await ReportService.getGameHistoryReport(
      { _id: req.user._id, role: req.user.role as any },
      parseDateFilter(req),
      {
        gameType: req.query.gameType as string | undefined,
        username: req.query.username as string | undefined,
        search: req.query.search as string | undefined,
        exactDate: req.query.exactDate as string | undefined,
        limit: req.query.limit ? parseInt(req.query.limit as string, 10) : undefined,
      },
    );

    return res.status(200).json({ success: true, data });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message || 'Internal server error' });
  }
};

const postDeleteGameHistoryRange = async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ success: false, message: 'Authentication required' });
    }

    const mode = String(req.body.mode || 'preview').trim();
    const from = String(req.body.from || '').trim();
    const to = String(req.body.to || '').trim();
    const confirmToken = String(req.body.confirmToken || '').trim();

    if (!from || !to) {
      return res.status(400).json({ success: false, message: 'from and to are required' });
    }

    if (mode === 'preview') {
      const data = await ReportService.previewDeleteGameHistory(
        { _id: req.user._id, role: req.user.role as any },
        from,
        to,
      );
      return res.status(200).json({ success: true, data });
    }

    if (mode === 'delete') {
      const data = await ReportService.confirmDeleteGameHistory(
        { _id: req.user._id, role: req.user.role as any },
        from,
        to,
        confirmToken,
      );
      return res.status(200).json({ success: true, data });
    }

    return res.status(400).json({ success: false, message: 'Invalid mode' });
  } catch (error: any) {
    const status = error.message?.includes('Admin only')
      ? 403
      : error.message?.includes('Confirmation required')
        ? 409
        : 500;
    return res.status(status).json({ success: false, message: error.message || 'Internal server error' });
  }
};

export {
  getTurnoverReport,
  getTransactionsReport,
  getCommissionPayoutReport,
  getAdminCommissionReport,
  getGameHistoryReport,
  postDeleteGameHistoryRange,
};
