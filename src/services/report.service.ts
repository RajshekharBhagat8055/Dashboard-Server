import mongoose from 'mongoose';
import jwt from 'jsonwebtoken';
import User from '../models/User';
import Log, { type LogAction } from '../models/log.model';
import { getTicketModel } from '../models/Ticket';
import { buildCreatedAtMatch, buildDrawDateMatch, type ReportYmdRange } from '../utils/reportDateRange';

const REPORT_DELETE_JWT_SECRET =
  process.env.REPORT_DELETE_SECRET || process.env.JWT_ACCESS_SECRET || 'your-access-secret-key';

export type ReportCurrentUser = { _id: string; role: string };

/** Calendar-day range (YYYY-MM-DD) in REPORT_TIMEZONE; tickets match drawDate, logs match createdAt. */
export type ReportDateRange = ReportYmdRange;

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
  fromYmd?: string;
  toYmd?: string;
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
    const drawDate = buildDrawDateMatch(range);
    if (drawDate) {
      match.drawDate = drawDate;
    }
    return match;
  }

  private static async getScopedPlayerIds(
    currentUser: ReportCurrentUser
  ): Promise<mongoose.Types.ObjectId[]> {
    const players = await User.find(this.buildPlayerScopeFilter(currentUser)).select('_id').lean();
    return players.map((p) => p._id as mongoose.Types.ObjectId);
  }

  private static async resolveParentRole(parentId: string): Promise<string | null> {
    const parent = await User.findById(parentId).select('role').lean();
    return parent?.role ?? null;
  }

  private static buildChildFilter(
    parentOid: mongoose.Types.ObjectId,
    parentRole: string,
    childRole?: string
  ): Record<string, unknown> {
    // Both retailer and user are direct children of distributor (peers)
    if (parentRole === 'distributor') {
      const roles = childRole ? [childRole] : ['retailer', 'user'];
      return { role: { $in: roles }, distributorId: parentOid };
    }
    if (parentRole === 'super_distributor') {
      return childRole
        ? { role: childRole, superDistributorId: parentOid }
        : { role: 'distributor', superDistributorId: parentOid };
    }
    if (parentRole === 'admin') {
      return childRole ? { role: childRole } : { role: 'super_distributor' };
    }
    // Fallback
    return childRole ? { role: childRole, parentId: parentOid } : { parentId: parentOid };
  }

  private static buildDrillDownScopeFilter(
    currentUser: ReportCurrentUser,
    parentId?: string,
    childRole?: string
  ): Record<string, unknown> | null {
    const validRoles = ['super_distributor', 'distributor', 'retailer', 'user'];
    if (childRole && !validRoles.includes(childRole)) return null;

    const { role, _id } = currentUser;
    const id = this.oid(_id);

    // no parentId: scope to direct children of current user
    if (!parentId) {
      if (role === 'admin') {
        return childRole ? { role: childRole } : { role: 'super_distributor' };
      }
      if (role === 'super_distributor') {
        return childRole
          ? { role: childRole, superDistributorId: id }
          : { role: 'distributor', superDistributorId: id };
      }
      if (role === 'distributor') {
        const roles = childRole ? [childRole] : ['retailer', 'user'];
        return { role: { $in: roles }, distributorId: id };
      }
      return null;
    }

    // parentId provided — build filter based on parent's role (resolved async, see getTurnoverReport)
    return null; // resolved in getTurnoverReport via resolveParentRole
  }

  /**
   * Turnover from Ticket documents (2d/3d), aligned with sai-lucky player_bets semantics.
   * Supports hierarchical drill-down via parent_id + child_role.
   * Returns commission amounts pre-calculated per node (not per player).
   */
  static async getTurnoverReport(
    currentUser: ReportCurrentUser,
    range?: ReportDateRange,
    opts?: { parentId?: string; childRole?: string }
  ) {
    const generatedAt = new Date().toISOString();

    // Determine the set of "child nodes" to aggregate under
    let nodeFilter: Record<string, unknown> | null;
    if (opts?.parentId) {
      const parentRole = await this.resolveParentRole(opts.parentId);
      if (!parentRole) {
        return { success: true as const, data: { report: [] as Record<string, unknown>[] }, generatedAt };
      }
      nodeFilter = this.buildChildFilter(this.oid(opts.parentId), parentRole, opts?.childRole);
    } else {
      nodeFilter = this.buildDrillDownScopeFilter(currentUser, undefined, opts?.childRole);
    }

    // retailer/user (or any role with no drill-down children): flat report scoped to
    // the current user's own subtree, one row per leaf ticket-user (self + own players).
    if (!nodeFilter) {
      return this.getFlatTurnoverReport(currentUser, range, generatedAt);
    }

    const childNodes = await User.find(nodeFilter)
      .select('_id username role commissionRate superDistributorId distributorId retailerId parentId')
      .lean();

    if (childNodes.length === 0) {
      return { success: true as const, data: { report: [] as Record<string, unknown>[] }, generatedAt };
    }

    // For each child node, gather all descendant player ids
    const childNodeIds = childNodes.map((n) => n._id as mongoose.Types.ObjectId);

    // Players are 'user' or 'retailer' role descendants of these child nodes
    const allPlayerDocs = await User.find({ role: { $in: ['user', 'retailer'] } })
      .select('_id role commissionRate superDistributorId distributorId retailerId createdBy parentId')
      .lean();

    // Map player -> which child node they belong to
    const playerToChildNode = new Map<string, string>();
    const childNodeIdStrings = new Set(childNodeIds.map((id) => String(id)));

    for (const player of allPlayerDocs) {
      const pId = String(player._id);
      if (childNodeIdStrings.has(pId)) {
        playerToChildNode.set(pId, pId);
        continue;
      }
      if (player.retailerId && childNodeIdStrings.has(String(player.retailerId))) {
        playerToChildNode.set(pId, String(player.retailerId));
        continue;
      }
      if (player.createdBy && childNodeIdStrings.has(String(player.createdBy))) {
        playerToChildNode.set(pId, String(player.createdBy));
        continue;
      }
      if (player.distributorId && childNodeIdStrings.has(String(player.distributorId))) {
        playerToChildNode.set(pId, String(player.distributorId));
        continue;
      }
      if (player.superDistributorId && childNodeIdStrings.has(String(player.superDistributorId))) {
        playerToChildNode.set(pId, String(player.superDistributorId));
        continue;
      }
      if (player.parentId && childNodeIdStrings.has(String(player.parentId))) {
        playerToChildNode.set(pId, String(player.parentId));
        continue;
      }
    }

    const scopedPlayerIds = [...playerToChildNode.keys()].map((id) => this.oid(id));
    if (scopedPlayerIds.length === 0) {
      return { success: true as const, data: { report: [] as Record<string, unknown>[] }, generatedAt };
    }

    const ticketMatch = this.buildTicketMatch(scopedPlayerIds, range);

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
            $sum: { $cond: [{ $and: ['$claimed', { $gt: ['$winPoint', 0] }] }, '$winPoint', 0] }
          },
          unclaimPoints: {
            $sum: {
              $cond: [{ $and: [{ $eq: ['$claimed', false] }, { $gt: ['$winPoint', 0] }] }, '$winPoint', 0]
            }
          }
        }
      },
      { $match: { playPoints: { $gt: 0 } } }
    ]);

    // Fetch commission rates for the hierarchy nodes
    const nodeIdSet = new Set<string>();
    for (const player of allPlayerDocs) {
      // Include retailer players themselves so their own commission rate is available
      if (player.role === 'retailer') nodeIdSet.add(String(player._id));
      if (player.retailerId) nodeIdSet.add(String(player.retailerId));
      if (player.distributorId) nodeIdSet.add(String(player.distributorId));
      if (player.superDistributorId) nodeIdSet.add(String(player.superDistributorId));
    }
    const rateMap = new Map<string, number>();
    if (nodeIdSet.size > 0) {
      const nodes = await User.find({ _id: { $in: [...nodeIdSet].map((id) => this.oid(id)) } })
        .select('_id commissionRate')
        .lean();
      for (const n of nodes) rateMap.set(String(n._id), n.commissionRate ?? 0);
    }
    // Also add child nodes themselves
    for (const n of childNodes) rateMap.set(String(n._id), n.commissionRate ?? 0);

    const playerMap = new Map(allPlayerDocs.map((p) => [String(p._id), p]));

    // Aggregate per child node
    const playByNode = new Map<string, { play: number; win: number; claim: number; unclaim: number; retailerAmount: number; distributorAmount: number; superAmount: number }>();
    for (const nodeId of childNodeIds) {
      playByNode.set(String(nodeId), { play: 0, win: 0, claim: 0, unclaim: 0, retailerAmount: 0, distributorAmount: 0, superAmount: 0 });
    }

    for (const t of ticketAgg) {
      const nodeId = playerToChildNode.get(String(t._id));
      if (!nodeId) continue;
      const bucket = playByNode.get(nodeId);
      if (!bucket) continue;
      const player = playerMap.get(String(t._id));
      const play = t.playPoints ?? 0;

      // Use the leaf's own commission rate (same approach as skill-game-admin-backend)
      const leafRate = player?.role === 'retailer'
        ? rateMap.get(String(player._id)) ?? 0
        : (player?.retailerId
          ? rateMap.get(String(player.retailerId)) ?? 0
          : (player?.commissionRate ?? 0));
      const distributorRate = player?.distributorId ? rateMap.get(String(player.distributorId)) ?? 0 : 0;
      const superRate = player?.superDistributorId ? rateMap.get(String(player.superDistributorId)) ?? 0 : 0;

      bucket.play += play;
      bucket.win += t.winPoints ?? 0;
      bucket.claim += t.claimPoints ?? 0;
      bucket.unclaim += t.unclaimPoints ?? 0;
      bucket.retailerAmount += (play * Math.max(leafRate, 0)) / 100;
      bucket.distributorAmount += (play * Math.max(0, distributorRate - leafRate)) / 100;
      bucket.superAmount += (play * Math.max(0, superRate - distributorRate)) / 100;
    }

    const report = childNodes
      .map((node) => {
        const bucket = playByNode.get(String(node._id));
        if (!bucket || bucket.play === 0) return null;
        const play = bucket.play;
        const retailerAmount = bucket.retailerAmount;
        const distributorAmount = bucket.distributorAmount;
        const superAmount = bucket.superAmount;
        const retailerRate = play > 0 ? (retailerAmount / play) * 100 : 0;
        const distributorRate = play > 0 ? (distributorAmount / play) * 100 : 0;
        const superRate = play > 0 ? (superAmount / play) * 100 : 0;
        return {
          id: String(node._id),
          username: node.username,
          role: node.role,
          play_amount: play,
          win_amount: bucket.win,
          claim_amount: bucket.claim,
          unclaim_amount: bucket.unclaim,
          end_amount: play - bucket.win,
          retailer_commission_rate: retailerRate,
          distributor_commission_rate: distributorRate,
          super_commission_rate: superRate,
          retailer_commission_amount: retailerAmount,
          distributor_commission_amount: distributorAmount,
          super_commission_amount: superAmount
        };
      })
      .filter((r): r is NonNullable<typeof r> => r !== null)
      .sort((a, b) => b.play_amount - a.play_amount);

    return { success: true as const, data: { report }, generatedAt };
  }

  /**
   * Flat turnover report scoped to the current user's own subtree (self + own players),
   * one row per leaf ticket-user. Used when no node-based drill-down applies
   * (retailer/user roles), matching skill-game-admin-backend's fallback behavior.
   */
  private static async getFlatTurnoverReport(
    currentUser: ReportCurrentUser,
    range: ReportDateRange | undefined,
    generatedAt: string
  ) {
    const subtreeFilter = this.buildSubtreeScopeFilter(currentUser);
    const scopedUsers = await User.find(subtreeFilter)
      .select('_id username role commissionRate distributorId superDistributorId')
      .lean();

    if (scopedUsers.length === 0) {
      return { success: true as const, data: { report: [] as Record<string, unknown>[] }, generatedAt };
    }

    const scopedIds = scopedUsers.map((u) => u._id as mongoose.Types.ObjectId);
    const ticketMatch = this.buildTicketMatch(scopedIds, range);

    const ticketAgg = await getTicketModel().aggregate<{
      _id: mongoose.Types.ObjectId;
      playPoints: number;
      winPoints: number;
    }>([
      { $match: ticketMatch },
      {
        $group: {
          _id: '$userId',
          playPoints: { $sum: '$totalPoint' },
          winPoints: { $sum: '$winPoint' }
        }
      },
      { $match: { playPoints: { $gt: 0 } } }
    ]);

    if (ticketAgg.length === 0) {
      return { success: true as const, data: { report: [] as Record<string, unknown>[] }, generatedAt };
    }

    const userMap = new Map(scopedUsers.map((u) => [String(u._id), u]));

    const ancestorIds = new Set<string>();
    for (const u of scopedUsers) {
      if (u.distributorId) ancestorIds.add(String(u.distributorId));
      if (u.superDistributorId) ancestorIds.add(String(u.superDistributorId));
    }
    const ancestorRateMap = new Map<string, number>();
    if (ancestorIds.size > 0) {
      const ancestors = await User.find({ _id: { $in: [...ancestorIds].map((id) => this.oid(id)) } })
        .select('_id commissionRate')
        .lean();
      for (const a of ancestors) ancestorRateMap.set(String(a._id), a.commissionRate ?? 0);
    }

    const report = ticketAgg
      .map((row) => {
        const user = userMap.get(String(row._id));
        if (!user) return null;
        const play = row.playPoints ?? 0;
        const win = row.winPoints ?? 0;
        const nodeRate = user.commissionRate ?? 0;
        const role = user.role;

        let retailerAmount = 0;
        let distributorAmount = 0;
        let superAmount = 0;

        if (role === 'retailer' || role === 'user') {
          const dtRate = user.distributorId ? ancestorRateMap.get(String(user.distributorId)) ?? 0 : 0;
          const sdRate = user.superDistributorId ? ancestorRateMap.get(String(user.superDistributorId)) ?? 0 : 0;
          retailerAmount = (play * nodeRate) / 100;
          distributorAmount = (play * Math.max(0, dtRate - nodeRate)) / 100;
          superAmount = (play * Math.max(0, sdRate - dtRate)) / 100;
        } else if (role === 'distributor') {
          const sdRate = user.superDistributorId ? ancestorRateMap.get(String(user.superDistributorId)) ?? 0 : 0;
          distributorAmount = (play * nodeRate) / 100;
          superAmount = (play * Math.max(0, sdRate - nodeRate)) / 100;
        } else if (role === 'super_distributor') {
          superAmount = (play * nodeRate) / 100;
        }

        return {
          id: String(user._id),
          username: user.username,
          role,
          play_amount: play,
          win_amount: win,
          claim_amount: 0,
          unclaim_amount: 0,
          end_amount: play - win,
          retailer_commission_rate: play > 0 ? (retailerAmount / play) * 100 : 0,
          distributor_commission_rate: play > 0 ? (distributorAmount / play) * 100 : 0,
          super_commission_rate: play > 0 ? (superAmount / play) * 100 : 0,
          retailer_commission_amount: retailerAmount,
          distributor_commission_amount: distributorAmount,
          super_commission_amount: superAmount
        };
      })
      .filter((r): r is NonNullable<typeof r> => r !== null)
      .sort((a, b) => b.play_amount - a.play_amount);

    return { success: true as const, data: { report }, generatedAt };
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

    const createdAt = buildCreatedAtMatch({ fromYmd: query.fromYmd, toYmd: query.toYmd });
    if (createdAt) {
      logQuery.createdAt = createdAt;
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

  /** Commission payout: each eligible user's own direct ticket total × their own commissionRate (same approach as skill-game-admin-backend). */
  static async getCommissionPayoutReport(currentUser: ReportCurrentUser, range?: ReportDateRange) {
    const subtreeFilter = this.buildSubtreeScopeFilter(currentUser);
    const scopedUsers = await User.find(subtreeFilter)
      .select('_id username role commissionRate')
      .lean();

    if (scopedUsers.length === 0) {
      return {
        success: true as const,
        data: { report: [] as Record<string, unknown>[] },
        generatedAt: new Date().toISOString()
      };
    }

    const payoutRoles = new Set(['super_distributor', 'distributor', 'retailer']);
    const eligibleUsers = scopedUsers.filter((u) => payoutRoles.has(u.role));

    const scopedIds = scopedUsers.map((u) => u._id as mongoose.Types.ObjectId);
    const ticketMatch = this.buildTicketMatch(scopedIds, range);

    const totalsByUser = await getTicketModel().aggregate<{
      _id: mongoose.Types.ObjectId;
      totalBet: number;
    }>([{ $match: ticketMatch }, { $group: { _id: '$userId', totalBet: { $sum: '$totalPoint' } } }]);

    const directTotals = new Map<string, number>();
    for (const row of totalsByUser) {
      directTotals.set(String(row._id), Number(row.totalBet || 0));
    }

    const rows = eligibleUsers.map((n) => {
      const totalBet = directTotals.get(String(n._id)) ?? 0;
      const rate = n.commissionRate ?? 0;
      return {
        id: String(n._id),
        username: n.username,
        role: n.role,
        commission_rate: rate,
        total_bet: totalBet,
        commission_earned: (totalBet * rate) / 100
      };
    });

    rows.sort((a, b) => b.commission_earned - a.commission_earned);

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
    if (fromYmd > toYmd) {
      throw new Error('Invalid date range');
    }
    const playerIds = await this.adminPlayerIdsForDelete();
    if (playerIds.length === 0) {
      return { previewCount: 0, confirmToken: '', message: 'No player scope' };
    }
    const match = this.buildTicketMatch(playerIds, { fromYmd, toYmd });
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
    const playerIds = await this.adminPlayerIdsForDelete();
    if (playerIds.length === 0) {
      return { deletedCount: 0, message: 'No tickets deleted' };
    }
    const match = this.buildTicketMatch(playerIds, { fromYmd, toYmd });
    const res = await getTicketModel().deleteMany(match);
    return {
      deletedCount: res.deletedCount ?? 0,
      message: `Deleted ${res.deletedCount ?? 0} ticket record(s).`
    };
  }

  static async previewDeleteHistoryTickets(fromYmd: string, toYmd: string) {
    if (fromYmd > toYmd) {
      throw new Error('Invalid date range');
    }
    const playerIds = await this.adminPlayerIdsForDelete();
    if (playerIds.length === 0) {
      return { previewCount: 0, confirmToken: '', message: 'No player scope' };
    }
    const match = this.buildTicketMatch(playerIds, { fromYmd, toYmd });
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
    const playerIds = await this.adminPlayerIdsForDelete();
    if (playerIds.length === 0) {
      return { deletedCount: 0, message: 'No records deleted' };
    }
    const match = this.buildTicketMatch(playerIds, { fromYmd, toYmd });
    const res = await getTicketModel().deleteMany(match);
    return {
      deletedCount: res.deletedCount ?? 0,
      message: `Deleted ${res.deletedCount ?? 0} game history record(s).`
    };
  }
}
