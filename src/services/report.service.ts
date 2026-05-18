import mongoose from 'mongoose';
import jwt from 'jsonwebtoken';
import User from '../models/User';
import Log, { type LogAction } from '../models/log.model';
import { getTicketModel } from '../models/Ticket';

const REPORT_DELETE_JWT_SECRET =
  process.env.REPORT_DELETE_SECRET || process.env.JWT_ACCESS_SECRET || 'your-access-secret-key';

export type ReportCurrentUser = { _id: string; role: string };

/** Optional ticket date filter (sale time = Ticket.createdAt), same semantics as transaction report dates */
export type ReportDateRange = { start?: Date; end?: Date };

const FINANCIAL_ACTIONS: LogAction[] = [
  'CREDIT_TRANSFER',
  'CREDIT_ADJUSTMENT',
  'COMMISSION_PAYOUT'
];

/** Wallet-style types aligned with sai-lucky-admin transaction report. */
const DEFAULT_TRANSACTION_ACTIONS: LogAction[] = [
  ...FINANCIAL_ACTIONS,
  'BET_PLACED',
  'GAME_WIN'
];

const DISPLAY_TYPE_TO_ACTION: Record<string, LogAction> = {
  transfer: 'CREDIT_TRANSFER',
  admin_adjust: 'CREDIT_ADJUSTMENT',
  adjust: 'CREDIT_ADJUSTMENT',
  admin_add: 'CREDIT_ADJUSTMENT',
  claim_ticket: 'COMMISSION_PAYOUT',
  claim: 'COMMISSION_PAYOUT',
  claim_all: 'COMMISSION_PAYOUT',
  bet: 'BET_PLACED',
  win: 'GAME_WIN'
};

export interface TransactionReportQuery {
  startDate?: Date;
  endDate?: Date;
  action?: LogAction;
  status?: 'SUCCESS' | 'FAILED';
  page?: number;
  limit?: number;
  /** Username search (case-insensitive partial), scoped subtree */
  search?: string;
  /** Sai-style wallet type: transfer, admin_adjust, claim_ticket, bet, win */
  type?: string;
}

export class ReportService {
  private static oid(id: string): mongoose.Types.ObjectId {
    return new mongoose.Types.ObjectId(id);
  }

  private static buildPlayerScopeFilter(currentUser: ReportCurrentUser): Record<string, unknown> {
    const { role, _id } = currentUser;
    const id = this.oid(_id);
    if (role === 'admin') {
      return { role: { $in: ['user', 'retailer'] } };
    }
    if (role === 'super_distributor') {
      return { superDistributorId: id, role: { $in: ['user', 'retailer'] } };
    }
    if (role === 'distributor') {
      return { distributorId: id, role: { $in: ['user', 'retailer'] } };
    }
    if (role === 'retailer') {
      return { retailerId: id, role: 'user' };
    }
    return { _id: { $in: [] } };
  }

  private static buildCommissionNodeScopeFilter(currentUser: ReportCurrentUser): Record<string, unknown> {
    const { role, _id } = currentUser;
    const id = this.oid(_id);
    if (role === 'admin') {
      return { role: { $in: ['super_distributor', 'distributor', 'retailer'] } };
    }
    if (role === 'super_distributor') {
      return { superDistributorId: id, role: { $in: ['distributor', 'retailer'] } };
    }
    if (role === 'distributor') {
      return { distributorId: id, role: 'retailer' };
    }
    if (role === 'retailer') {
      return { _id: id };
    }
    return { _id: { $in: [] } };
  }

  private static buildSubtreeScopeFilter(currentUser: ReportCurrentUser): Record<string, unknown> {
    const { role, _id } = currentUser;
    const id = this.oid(_id);
    if (role === 'admin') {
      return {};
    }
    if (role === 'super_distributor') {
      return { $or: [{ _id: id }, { superDistributorId: id }] };
    }
    if (role === 'distributor') {
      return { $or: [{ _id: id }, { distributorId: id }] };
    }
    if (role === 'retailer') {
      return { $or: [{ _id: id }, { retailerId: id }] };
    }
    return { _id: { $in: [] } };
  }

  private static normalizeDayRange(start?: Date, end?: Date): { start?: Date; end?: Date } {
    let s: Date | undefined;
    let e: Date | undefined;
    if (start) {
      s = new Date(start);
      s.setHours(0, 0, 0, 0);
    }
    if (end) {
      e = new Date(end);
      e.setHours(23, 59, 59, 999);
    }
    return { start: s, end: e };
  }

  private static num(v: unknown): number | undefined {
    if (typeof v === 'number' && Number.isFinite(v)) return v;
    if (typeof v === 'string') {
      const n = parseFloat(v);
      return Number.isFinite(n) ? n : undefined;
    }
    return undefined;
  }

  private static mapTransactionDetails(details: unknown): {
    amount?: number;
    transferType?: string;
    description?: string;
    targetUsername?: string;
    targetUserId?: string;
    balanceBefore?: number;
    balanceAfter?: number;
  } {
    if (!details || typeof details !== 'object') {
      return {};
    }
    const d = details as Record<string, unknown>;
    let amount = this.num(d.amount);
    const transferType =
      typeof d.transferType === 'string' ? d.transferType : undefined;
    const description =
      typeof d.description === 'string'
        ? d.description
        : typeof d.error === 'string'
          ? d.error
          : undefined;
    const targetUsername =
      typeof d.targetUsername === 'string' ? d.targetUsername : undefined;
    const targetUserId =
      typeof d.targetUserId === 'string' ? d.targetUserId : undefined;
    const balanceBefore = this.num(d.balanceBefore);
    const balanceAfter = this.num(d.balanceAfter);

    if (amount === undefined && d.newValues && typeof d.newValues === 'object') {
      amount = this.num((d.newValues as Record<string, unknown>).amount);
    }
    if (amount === undefined && d.changes && typeof d.changes === 'object') {
      amount = this.num((d.changes as Record<string, unknown>).amount);
    }
    if (amount === undefined && d.metadata && typeof d.metadata === 'object') {
      amount = this.num((d.metadata as Record<string, unknown>).amount);
    }

    return {
      amount,
      transferType,
      description,
      targetUsername,
      targetUserId,
      balanceBefore,
      balanceAfter
    };
  }

  private static logActionToDisplayType(action: LogAction): string {
    switch (action) {
      case 'CREDIT_TRANSFER':
        return 'transfer';
      case 'CREDIT_ADJUSTMENT':
        return 'admin_adjust';
      case 'COMMISSION_PAYOUT':
        return 'claim_ticket';
      case 'BET_PLACED':
        return 'bet';
      case 'GAME_WIN':
        return 'win';
      default:
        return String(action).toLowerCase();
    }
  }

  private static buildTicketMatch(
    playerIds: mongoose.Types.ObjectId[],
    range?: ReportDateRange
  ): Record<string, unknown> {
    const match: Record<string, unknown> = {
      userId: { $in: playerIds },
      status: { $ne: 'cancelled' }
    };
    const { start, end } = this.normalizeDayRange(range?.start, range?.end);
    if (start || end) {
      match.createdAt = {} as Record<string, Date>;
      if (start) (match.createdAt as Record<string, Date>).$gte = start;
      if (end) (match.createdAt as Record<string, Date>).$lte = end;
    }
    return match;
  }

  private static async getScopedPlayerIds(
    currentUser: ReportCurrentUser
  ): Promise<mongoose.Types.ObjectId[]> {
    const players = await User.find(this.buildPlayerScopeFilter(currentUser)).select('_id').lean();
    return players.map((p) => p._id as mongoose.Types.ObjectId);
  }

  /**
   * Turnover from Ticket documents (2d/3d), aligned with sai-lucky player_bets semantics:
   * play = sum(totalPoint), win = sum(winPoint), claim = sum(winPoint where claimed),
   * end = play - win, commissions = play * hierarchy rates, net = end - commissions.
   */
  static async getTurnoverReport(currentUser: ReportCurrentUser, range?: ReportDateRange) {
    const generatedAt = new Date().toISOString();
    const playerIds = await this.getScopedPlayerIds(currentUser);
    if (playerIds.length === 0) {
      return {
        success: true as const,
        data: { report: [] as Record<string, unknown>[] },
        generatedAt
      };
    }

    const ticketMatch = this.buildTicketMatch(playerIds, range);

    const ticketAgg = await getTicketModel().aggregate<{
      _id: mongoose.Types.ObjectId;
      playPoints: number;
      winPoints: number;
      claimPoints: number;
      unclaimPoints: number;
    }>([
      { $match: ticketMatch },
      {
        $group: {
          _id: '$userId',
          playPoints: { $sum: '$totalPoint' },
          winPoints: { $sum: '$winPoint' },
          claimPoints: {
            $sum: {
              $cond: [{ $and: ['$claimed', { $gt: ['$winPoint', 0] }] }, '$winPoint', 0]
            }
          },
          unclaimPoints: {
            $sum: {
              $cond: [
                {
                  $and: [{ $eq: ['$claimed', false] }, { $gt: ['$winPoint', 0] }]
                },
                '$winPoint',
                0
              ]
            }
          }
        }
      },
      { $match: { playPoints: { $gt: 0 } } },
      { $sort: { playPoints: -1 } }
    ]);

    const userIds = ticketAgg.map((t) => t._id);
    const users = await User.find({ _id: { $in: userIds } })
      .select(
        '_id username uniqueId role commissionRate superDistributorId distributorId retailerId'
      )
      .lean();
    const userMap = new Map(users.map((u) => [String(u._id), u]));

    const nodeIdSet = new Set<string>();
    for (const u of users) {
      if (u.retailerId) nodeIdSet.add(String(u.retailerId));
      if (u.distributorId) nodeIdSet.add(String(u.distributorId));
      if (u.superDistributorId) nodeIdSet.add(String(u.superDistributorId));
    }
    const nodeIds = [...nodeIdSet].map((id) => this.oid(id));
    const rateMap = new Map<string, number>();
    if (nodeIds.length > 0) {
      const nodes = await User.find({ _id: { $in: nodeIds } })
        .select('_id commissionRate')
        .lean();
      for (const n of nodes) {
        rateMap.set(String(n._id), n.commissionRate ?? 0);
      }
    }

    const report = ticketAgg.map((t) => {
      const u = userMap.get(String(t._id));
      const play = t.playPoints ?? 0;
      const win = t.winPoints ?? 0;
      const claim = t.claimPoints ?? 0;
      const unclaim = t.unclaimPoints ?? 0;
      const endAmount = play - win;

      const retailerRate =
        u?.role === 'retailer'
          ? (u as any).commissionRate ?? 0
          : u?.retailerId
            ? rateMap.get(String(u.retailerId)) ?? 0
            : 0;
      const distributorRate = u?.distributorId ? rateMap.get(String(u.distributorId)) ?? 0 : 0;
      const superRate = u?.superDistributorId ? rateMap.get(String(u.superDistributorId)) ?? 0 : 0;

      return {
        id: String(t._id),
        username: u?.username ?? '',
        play_amount: play,
        win_amount: win,
        claim_amount: claim,
        unclaim_amount: unclaim,
        end_amount: endAmount,
        retailer_commission_rate: retailerRate,
        distributor_commission_rate: distributorRate,
        super_commission_rate: superRate
      };
    });

    return {
      success: true as const,
      data: { report },
      generatedAt
    };
  }

  static async getTransactionReport(
    currentUser: ReportCurrentUser,
    query: TransactionReportQuery
  ) {
    const page = Math.max(1, query.page ?? 1);
    const limit = Math.min(100, Math.max(1, query.limit ?? 25));
    const skip = (page - 1) * limit;

    const subtreeFilter = this.buildSubtreeScopeFilter(currentUser);
    const scopedUsers = await User.find(subtreeFilter).select('_id').lean();
    let scopeIds = scopedUsers.map((u) => u._id as mongoose.Types.ObjectId);

    if (scopeIds.length === 0) {
      return {
        success: true as const,
        data: {
          transactions: [] as Record<string, unknown>[],
          total: 0,
          page,
          limit,
          total_pages: 0
        }
      };
    }

    if (query.search && query.search.trim()) {
      const rx = new RegExp(query.search.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
      const matched = await User.find({
        _id: { $in: scopeIds },
        username: rx
      })
        .select('_id')
        .lean();
      scopeIds = matched.map((u) => u._id as mongoose.Types.ObjectId);
      if (scopeIds.length === 0) {
        return {
          success: true as const,
          data: {
            transactions: [] as Record<string, unknown>[],
            total: 0,
            page,
            limit,
            total_pages: 0
          }
        };
      }
    }

    let actionFilter: LogAction | { $in: LogAction[] };
    if (query.action) {
      actionFilter = query.action;
    } else if (query.type && DISPLAY_TYPE_TO_ACTION[query.type]) {
      actionFilter = DISPLAY_TYPE_TO_ACTION[query.type];
    } else if (query.type) {
      actionFilter = { $in: [] };
    } else {
      actionFilter = { $in: DEFAULT_TRANSACTION_ACTIONS };
    }

    const logQuery: Record<string, unknown> = {
      userId: { $in: scopeIds },
      action: actionFilter
    };

    if (query.status) {
      logQuery.status = query.status;
    }

    const { start, end } = this.normalizeDayRange(query.startDate, query.endDate);
    if (start || end) {
      logQuery.createdAt = {} as Record<string, Date>;
      if (start) (logQuery.createdAt as Record<string, Date>).$gte = start;
      if (end) (logQuery.createdAt as Record<string, Date>).$lte = end;
    }

    const [total, logs] = await Promise.all([
      Log.countDocuments(logQuery),
      Log.find(logQuery)
        .populate('userId', 'username uniqueId role')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean()
    ]);

    const totalPages = Math.ceil(total / limit) || 0;

    const transactions = logs.map((log) => {
      const populated = log.userId as unknown as {
        _id?: mongoose.Types.ObjectId;
        username?: string;
        uniqueId?: string;
        role?: string;
      } | null;
      const mapped = this.mapTransactionDetails(log.details);
      const createdAt =
        log.createdAt instanceof Date ? log.createdAt.toISOString() : String(log.createdAt);
      const displayType = this.logActionToDisplayType(log.action);
      const amount = mapped.amount ?? 0;
      const balanceAfter = mapped.balanceAfter ?? 0;
      return {
        id: String(log._id),
        type: displayType,
        amount,
        balance_after: balanceAfter,
        created_at: createdAt,
        username: populated?.username ?? '',
        unique_id: populated?.uniqueId ?? '',
        role: populated?.role ?? '',
        status: log.status,
        action: log.action,
        transfer_type: mapped.transferType,
        description: mapped.description,
        target_username: mapped.targetUsername,
        target_user_id: mapped.targetUserId,
        balance_before: mapped.balanceBefore
      };
    });

    return {
      success: true as const,
      data: {
        transactions,
        total,
        page,
        limit,
        total_pages: totalPages
      }
    };
  }

  /** Commission payout: sum Ticket.totalPoint for subordinate players (same scope as turnover), optional date range */
  static async getCommissionPayoutReport(currentUser: ReportCurrentUser, range?: ReportDateRange) {
    const filter = this.buildCommissionNodeScopeFilter(currentUser);
    const nodes = await User.find(filter)
      .select('_id username uniqueId role commissionRate totalCommissionEarned')
      .lean();

    const playerIds = await this.getScopedPlayerIds(currentUser);
    if (playerIds.length === 0) {
      const reportEmpty = nodes.map((n) => ({
        id: String(n._id),
        username: n.username,
        role: n.role,
        commission_rate: n.commissionRate ?? 0,
        total_bet: 0,
        commission_earned: 0
      }));
      return {
        success: true as const,
        data: { report: reportEmpty },
        generatedAt: new Date().toISOString()
      };
    }

    const ticketMatch = this.buildTicketMatch(playerIds, range);

    const sdIds = nodes.filter((n) => n.role === 'super_distributor').map((n) => n._id);
    const distributorIds = nodes.filter((n) => n.role === 'distributor').map((n) => n._id);
    const retailerIds = nodes.filter((n) => n.role === 'retailer').map((n) => n._id);

    const playBySd = new Map<string, number>();
    const playByDist = new Map<string, number>();
    const playByRet = new Map<string, number>();

    const byUserPlay = await getTicketModel().aggregate<{
      _id: mongoose.Types.ObjectId;
      totalPlayPoints: number;
    }>([{ $match: ticketMatch }, { $group: { _id: '$userId', totalPlayPoints: { $sum: '$totalPoint' } } }]);

    const ticketUserIds = byUserPlay.map((b) => b._id);
    const usersForTickets = await User.find({ _id: { $in: ticketUserIds } })
      .select('_id role superDistributorId distributorId retailerId')
      .lean();
    const ticketUserMap = new Map(usersForTickets.map((u) => [String(u._id), u]));

    const sdSet = new Set(sdIds.map((id) => String(id)));
    const distSet = new Set(distributorIds.map((id) => String(id)));
    const retSet = new Set(retailerIds.map((id) => String(id)));

    for (const row of byUserPlay) {
      const u = ticketUserMap.get(String(row._id));
      if (!u || !['user', 'retailer'].includes(u.role)) continue;
      const tp = row.totalPlayPoints ?? 0;
      if (u.superDistributorId && sdSet.has(String(u.superDistributorId))) {
        const k = String(u.superDistributorId);
        playBySd.set(k, (playBySd.get(k) ?? 0) + tp);
      }
      if (u.distributorId && distSet.has(String(u.distributorId))) {
        const k = String(u.distributorId);
        playByDist.set(k, (playByDist.get(k) ?? 0) + tp);
      }
      if (u.role === 'user' && u.retailerId && retSet.has(String(u.retailerId))) {
        const k = String(u.retailerId);
        playByRet.set(k, (playByRet.get(k) ?? 0) + tp);
      }
    }

    const rows = nodes.map((n) => {
      let subPlay = 0;
      if (n.role === 'super_distributor') subPlay = playBySd.get(String(n._id)) ?? 0;
      else if (n.role === 'distributor') subPlay = playByDist.get(String(n._id)) ?? 0;
      else if (n.role === 'retailer') subPlay = playByRet.get(String(n._id)) ?? 0;

      const rate = n.commissionRate ?? 0;
      const commissionEarned = subPlay * (rate / 100);

      return {
        id: String(n._id),
        username: n.username,
        role: n.role,
        commission_rate: rate,
        total_bet: subPlay,
        commission_earned: commissionEarned
      };
    });

    rows.sort((a, b) => b.total_bet - a.total_bet);

    return {
      success: true as const,
      data: { report: rows },
      generatedAt: new Date().toISOString()
    };
  }

  /** Admin commission by game type (2d/3d), sai-lucky shape: `data.report[]`. */
  static async getAdminCommissionReport(range?: ReportDateRange) {
    const playerDocs = await User.find({ role: { $in: ['user', 'retailer'] } }).select('_id').lean();
    const playerIds = playerDocs.map((d) => d._id as mongoose.Types.ObjectId);

    if (playerIds.length === 0) {
      return {
        success: true as const,
        data: { report: [] as Record<string, unknown>[] },
        generatedAt: new Date().toISOString()
      };
    }

    const ticketMatch = this.buildTicketMatch(playerIds, range);

    const byGameRaw = await getTicketModel().aggregate<{
      _id: string;
      totalPlayPoints: number;
      totalWinPoints: number;
    }>([
      { $match: ticketMatch },
      {
        $group: {
          _id: { $ifNull: ['$gameType', '2d'] },
          totalPlayPoints: { $sum: '$totalPoint' },
          totalWinPoints: { $sum: '$winPoint' }
        }
      },
      { $sort: { _id: 1 } }
    ]);

    const report = byGameRaw.map((r) => {
      const tp = r.totalPlayPoints ?? 0;
      const tw = r.totalWinPoints ?? 0;
      const key = String(r._id || '2d').toLowerCase();
      const gameName = key === '3d' ? '3D' : '2D';
      return {
        id: key,
        game_name: gameName,
        total_bet_point: tp,
        total_won_point: tw,
        commission_amount: tp - tw
      };
    });

    return {
      success: true as const,
      data: { report },
      generatedAt: new Date().toISOString()
    };
  }

  private static adminPlayerIdsForDelete(): Promise<mongoose.Types.ObjectId[]> {
    return User.find({ role: { $in: ['user', 'retailer'] } })
      .select('_id')
      .lean()
      .then((docs) => docs.map((d) => d._id as mongoose.Types.ObjectId));
  }

  private static ticketHistoryStatus(ticket: {
    status: string;
    winPoint?: number;
    claimed?: boolean;
  }): 'win' | 'loss' | 'claimed' | 'not claim' | 'No Result Declare' {
    if (ticket.status === 'result_pending') return 'No Result Declare';
    const win = ticket.winPoint ?? 0;
    if (win > 0) return ticket.claimed ? 'claimed' : 'not claim';
    return 'loss';
  }

  /** Per-ticket bet history (sai-lucky game-history shape, Skill Game tickets). */
  static async getGameHistory(
    currentUser: ReportCurrentUser,
    range?: ReportDateRange,
    opts?: { gameType?: '2d' | '3d'; username?: string; limit?: number }
  ) {
    const playerIds = await this.getScopedPlayerIds(currentUser);
    if (playerIds.length === 0) {
      return {
        success: true as const,
        data: { rows: [] as Record<string, unknown>[] },
        generatedAt: new Date().toISOString()
      };
    }

    const match = this.buildTicketMatch(playerIds, range);
    if (opts?.gameType) {
      match.gameType = opts.gameType;
    }
    if (opts?.username?.trim()) {
      match.username = opts.username.trim();
    }

    const limit = Math.min(1000, Math.max(1, opts?.limit ?? 500));

    const tickets = await getTicketModel()
      .find(match)
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean();

    const rows = tickets.map((t) => {
      const playPoint = t.totalPoint ?? 0;
      const wonPoint = t.winPoint ?? 0;
      const hasResult = t.status !== 'result_pending';
      return {
        created_at: t.createdAt ? new Date(t.createdAt).toISOString() : null,
        username: t.username ?? '',
        game_type: t.gameType ?? '2d',
        game_id: t.gameId ?? '',
        ticket_id: t.barcode ?? String(t._id),
        play_point: playPoint,
        won_point: wonPoint,
        end_point: playPoint - wonPoint,
        draw_date: t.drawDate ?? '',
        draw_time: t.drawTime ?? '',
        coupon_time: t.couponTime ?? '',
        game_result: hasResult ? `${t.drawDate ?? ''} ${t.drawTime ?? ''}`.trim() : null,
        status: this.ticketHistoryStatus(t),
        items: (t.items ?? []).map((item) => ({
          label: item.label,
          amount: item.amount,
          series_key: item.seriesKey,
          series_letter: item.seriesLetter
        }))
      };
    });

    return {
      success: true as const,
      data: { rows },
      generatedAt: new Date().toISOString()
    };
  }

  static async previewDeleteTurnoverTickets(fromYmd: string, toYmd: string) {
    const start = new Date(`${fromYmd}T00:00:00.000`);
    const end = new Date(`${toYmd}T23:59:59.999`);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || start > end) {
      throw new Error('Invalid date range');
    }
    const playerIds = await this.adminPlayerIdsForDelete();
    if (playerIds.length === 0) {
      return { previewCount: 0, confirmToken: '', message: 'No player scope' };
    }
    const match = this.buildTicketMatch(playerIds, { start, end });
    const previewCount = await getTicketModel().countDocuments(match);
    const confirmToken =
      previewCount > 0
        ? jwt.sign(
            {
              purpose: 'turnover_ticket_delete' as const,
              from: fromYmd,
              to: toYmd
            },
            REPORT_DELETE_JWT_SECRET,
            { expiresIn: '15m' }
          )
        : '';
    return {
      previewCount,
      confirmToken,
      message:
        previewCount > 0
          ? `Ready to delete ${previewCount} ticket(s) in range.`
          : 'No tickets in selected range.'
    };
  }

  static async confirmDeleteTurnoverTickets(fromYmd: string, toYmd: string, confirmToken: string) {
    let decoded: jwt.JwtPayload & { purpose?: string; from?: string; to?: string };
    try {
      decoded = jwt.verify(confirmToken, REPORT_DELETE_JWT_SECRET) as jwt.JwtPayload & {
        purpose?: string;
        from?: string;
        to?: string;
      };
    } catch {
      throw new Error('Invalid or expired confirmation token');
    }
    if (
      decoded.purpose !== 'turnover_ticket_delete' ||
      decoded.from !== fromYmd ||
      decoded.to !== toYmd
    ) {
      throw new Error('Confirmation token does not match this delete request');
    }
    const start = new Date(`${fromYmd}T00:00:00.000`);
    const end = new Date(`${toYmd}T23:59:59.999`);
    const playerIds = await this.adminPlayerIdsForDelete();
    if (playerIds.length === 0) {
      return { deletedCount: 0, message: 'No tickets deleted' };
    }
    const match = this.buildTicketMatch(playerIds, { start, end });
    const res = await getTicketModel().deleteMany(match);
    return {
      deletedCount: res.deletedCount ?? 0,
      message: `Deleted ${res.deletedCount ?? 0} ticket record(s).`
    };
  }

  static async previewDeleteHistoryTickets(fromYmd: string, toYmd: string) {
    const start = new Date(`${fromYmd}T00:00:00.000`);
    const end = new Date(`${toYmd}T23:59:59.999`);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || start > end) {
      throw new Error('Invalid date range');
    }
    const playerIds = await this.adminPlayerIdsForDelete();
    if (playerIds.length === 0) {
      return { previewCount: 0, confirmToken: '', message: 'No player scope' };
    }
    const match = this.buildTicketMatch(playerIds, { start, end });
    const previewCount = await getTicketModel().countDocuments(match);
    const confirmToken =
      previewCount > 0
        ? jwt.sign(
            {
              purpose: 'history_ticket_delete' as const,
              from: fromYmd,
              to: toYmd
            },
            REPORT_DELETE_JWT_SECRET,
            { expiresIn: '15m' }
          )
        : '';
    return {
      previewCount,
      confirmToken,
      message:
        previewCount > 0
          ? `Ready to delete ${previewCount} game history record(s) in range.`
          : 'No records in selected range.'
    };
  }

  static async confirmDeleteHistoryTickets(fromYmd: string, toYmd: string, confirmToken: string) {
    let decoded: jwt.JwtPayload & { purpose?: string; from?: string; to?: string };
    try {
      decoded = jwt.verify(confirmToken, REPORT_DELETE_JWT_SECRET) as jwt.JwtPayload & {
        purpose?: string;
        from?: string;
        to?: string;
      };
    } catch {
      throw new Error('Invalid or expired confirmation token');
    }
    if (
      decoded.purpose !== 'history_ticket_delete' ||
      decoded.from !== fromYmd ||
      decoded.to !== toYmd
    ) {
      throw new Error('Confirmation token does not match this delete request');
    }
    const start = new Date(`${fromYmd}T00:00:00.000`);
    const end = new Date(`${toYmd}T23:59:59.999`);
    const playerIds = await this.adminPlayerIdsForDelete();
    if (playerIds.length === 0) {
      return { deletedCount: 0, message: 'No records deleted' };
    }
    const match = this.buildTicketMatch(playerIds, { start, end });
    const res = await getTicketModel().deleteMany(match);
    return {
      deletedCount: res.deletedCount ?? 0,
      message: `Deleted ${res.deletedCount ?? 0} game history record(s).`
    };
  }
}
