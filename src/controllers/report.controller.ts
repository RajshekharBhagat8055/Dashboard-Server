import { Request, Response } from 'express';
import {
  ReportService,
  TransactionReportQuery,
  type ReportDateRange
} from '../services/report.service';
import type { LogAction } from '../models/log.model';
import { parseReportYmdRange } from '../utils/reportDateRange';

const FINANCIAL_ACTIONS = new Set<LogAction>([
  'CREDIT_TRANSFER',
  'CREDIT_ADJUSTMENT',
  'COMMISSION_PAYOUT'
]);

const blockEndUser = (req: Request, res: Response): boolean => {
  if (req.user?.role === 'user') {
    res.status(403).json({
      success: false,
      message: 'Access denied'
    });
    return true;
  }
  return false;
};

function parseTicketDateRange(req: Request): ReportDateRange | undefined {
  return parseReportYmdRange(req.query);
}

export const getTurnoverReport = async (req: Request, res: Response) => {
  try {
    if (!req.user?._id) {
      return res.status(401).json({ success: false, message: 'Authentication required' });
    }
    if (blockEndUser(req, res)) return;

    const parentId = typeof req.query.parent_id === 'string' && req.query.parent_id.trim()
      ? req.query.parent_id.trim()
      : undefined;
    const childRole = typeof req.query.child_role === 'string' && req.query.child_role.trim()
      ? req.query.child_role.trim()
      : undefined;

    const result = await ReportService.getTurnoverReport(
      { _id: req.user._id, role: req.user.role },
      parseTicketDateRange(req),
      { parentId, childRole }
    );
    return res.status(200).json(result);
  } catch (error) {
    console.error('Error in getTurnoverReport:', error);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

export const getTransactionReport = async (req: Request, res: Response) => {
  try {
    if (!req.user?._id) {
      return res.status(401).json({ success: false, message: 'Authentication required' });
    }
    if (blockEndUser(req, res)) return;

    const page = Math.max(1, parseInt(String(req.query.page ?? '1'), 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(String(req.query.limit ?? '25'), 10) || 25));

    const q: TransactionReportQuery = { page, limit };
    const range = parseReportYmdRange(req.query);
    if (range?.fromYmd) q.fromYmd = range.fromYmd;
    if (range?.toYmd) q.toYmd = range.toYmd;

    if (req.query.status === 'SUCCESS' || req.query.status === 'FAILED') {
      q.status = req.query.status;
    }

    if (req.query.search && typeof req.query.search === 'string') {
      q.search = req.query.search.trim();
    }

    if (req.query.type && typeof req.query.type === 'string') {
      q.type = req.query.type;
    }

    if (req.query.action && req.query.action !== 'ALL') {
      const a = req.query.action as LogAction;
      if (FINANCIAL_ACTIONS.has(a)) {
        q.action = a;
      }
    }

    const result = await ReportService.getTransactionReport(
      { _id: req.user._id, role: req.user.role },
      q
    );
    return res.status(200).json(result);
  } catch (error) {
    console.error('Error in getTransactionReport:', error);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

export const getCommissionPayoutReport = async (req: Request, res: Response) => {
  try {
    if (!req.user?._id) {
      return res.status(401).json({ success: false, message: 'Authentication required' });
    }
    if (blockEndUser(req, res)) return;

    const result = await ReportService.getCommissionPayoutReport(
      {
        _id: req.user._id,
        role: req.user.role
      },
      parseTicketDateRange(req)
    );
    return res.status(200).json(result);
  } catch (error) {
    console.error('Error in getCommissionPayoutReport:', error);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

export const getGameHistory = async (req: Request, res: Response) => {
  try {
    if (!req.user?._id) {
      return res.status(401).json({ success: false, message: 'Authentication required' });
    }
    if (req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Access denied - Admin only'
      });
    }

    const gameTypeRaw = typeof req.query.game_type === 'string' ? req.query.game_type.trim().toLowerCase() : '';
    const gameType = gameTypeRaw || undefined;
    const username =
      typeof req.query.username === 'string' && req.query.username.trim()
        ? req.query.username.trim()
        : undefined;
    const limitRaw = parseInt(String(req.query.limit ?? '500'), 10);
    const limit = Number.isFinite(limitRaw) ? limitRaw : 500;

    const result = await ReportService.getGameHistory(
      { _id: req.user._id, role: req.user.role },
      parseTicketDateRange(req),
      { gameType, username, limit }
    );
    return res.status(200).json(result);
  } catch (error) {
    console.error('Error in getGameHistory:', error);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

export const getAdminCommissionReport = async (req: Request, res: Response) => {
  try {
    if (!req.user?._id) {
      return res.status(401).json({ success: false, message: 'Authentication required' });
    }
    if (req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Access denied - Admin only'
      });
    }

    const result = await ReportService.getAdminCommissionReport(parseTicketDateRange(req));
    return res.status(200).json(result);
  } catch (error) {
    console.error('Error in getAdminCommissionReport:', error);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

export const postReportDeleteRange = async (req: Request, res: Response) => {
  try {
    if (!req.user?._id) {
      return res.status(401).json({ success: false, message: 'Authentication required' });
    }
    if (req.user.role !== 'admin') {
      return res.status(403).json({ success: false, message: 'Access denied - Admin only' });
    }

    const body = req.body as Record<string, unknown>;
    const mode = body.mode;
    const target = body.target;
    const from = body.from;
    const to = body.to;
    const confirmToken = body.confirmToken;

    if (target !== 'turnover' && target !== 'history') {
      return res.status(400).json({ success: false, message: 'Unsupported target' });
    }
    if (typeof from !== 'string' || typeof to !== 'string') {
      return res.status(400).json({ success: false, message: 'from and to are required (YYYY-MM-DD)' });
    }
    const ymd = /^\d{4}-\d{2}-\d{2}$/;
    if (!ymd.test(from) || !ymd.test(to)) {
      return res.status(400).json({ success: false, message: 'from and to must be YYYY-MM-DD' });
    }

    if (mode === 'preview') {
      const r =
        target === 'history'
          ? await ReportService.previewDeleteHistoryTickets(from, to)
          : await ReportService.previewDeleteTurnoverTickets(from, to);
      return res.status(200).json({
        success: true,
        data: {
          previewCount: r.previewCount,
          confirmToken: r.confirmToken,
          message: r.message
        }
      });
    }

    if (mode === 'delete') {
      if (typeof confirmToken !== 'string' || !confirmToken) {
        return res.status(400).json({ success: false, message: 'confirmToken is required' });
      }
      try {
        const r =
          target === 'history'
            ? await ReportService.confirmDeleteHistoryTickets(from, to, confirmToken)
            : await ReportService.confirmDeleteTurnoverTickets(from, to, confirmToken);
        return res.status(200).json({
          success: true,
          data: { deletedCount: r.deletedCount, message: r.message }
        });
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Delete failed';
        return res.status(400).json({ success: false, message: msg });
      }
    }

    return res.status(400).json({ success: false, message: 'Invalid mode' });
  } catch (error) {
    console.error('Error in postReportDeleteRange:', error);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
};
