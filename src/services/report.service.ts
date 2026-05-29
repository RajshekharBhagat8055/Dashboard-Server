import { ObjectId } from 'mongodb';
import { getArkaDb, getSkillGameDb } from '../config/connectDB';
import {
  buildCreatedAtMatch,
  buildDrawDateFilter,
  type ReportYmdRange,
} from '../utils/reportDateRange';

type UserRole = 'admin' | 'super_distributor' | 'distributor' | 'retailer' | 'user';

interface AuthUser {
  _id: string;
  role: UserRole;
}

/** Calendar-day range (YYYY-MM-DD) in REPORT_TIMEZONE */
type ReportDateFilter = ReportYmdRange;

const applyTicketDateFilter = (matchStage: Record<string, unknown>, dateFilter: ReportDateFilter) => {
  const drawDateClause = buildDrawDateFilter(dateFilter);
  if (drawDateClause) Object.assign(matchStage, drawDateClause);
};

/** Map a leaf bettor to a drill-down child node (retailer / distributor / etc.). */
const resolveLeafToChildNode = (
  leaf: {
    _id: ObjectId;
    retailerId?: ObjectId;
    createdBy?: ObjectId;
    distributorId?: ObjectId;
    superDistributorId?: ObjectId;
    parentId?: ObjectId;
  },
  childNodeIdStrings: Set<string>,
): string | undefined => {
  const pId = leaf._id.toString();
  if (childNodeIdStrings.has(pId)) return pId;
  if (leaf.retailerId && childNodeIdStrings.has(leaf.retailerId.toString())) {
    return leaf.retailerId.toString();
  }
  if (leaf.createdBy && childNodeIdStrings.has(leaf.createdBy.toString())) {
    return leaf.createdBy.toString();
  }
  if (leaf.distributorId && childNodeIdStrings.has(leaf.distributorId.toString())) {
    return leaf.distributorId.toString();
  }
  if (leaf.superDistributorId && childNodeIdStrings.has(leaf.superDistributorId.toString())) {
    return leaf.superDistributorId.toString();
  }
  if (leaf.parentId && childNodeIdStrings.has(leaf.parentId.toString())) {
    return leaf.parentId.toString();
  }
  return undefined;
};

const ticketUserIdGroupStage = {
  $group: {
    _id: { $toString: '$userId' },
    playPoint: { $sum: { $ifNull: ['$totalPoint', 0] } },
    winPoint: { $sum: { $ifNull: ['$winPoint', 0] } },
  },
};

const applyTransactionDateFilter = (query: Record<string, unknown>, dateFilter: ReportDateFilter) => {
  const createdAt = buildCreatedAtMatch(dateFilter);
  if (createdAt) query.createdAt = createdAt;
};

interface ScopedUser {
  _id: ObjectId;
  username: string;
  role: UserRole;
  commissionRate?: number;
}

interface ScopedContext {
  users: ScopedUser[];
  scopedUserIdStrings: string[];
  scopedUserObjectIds: ObjectId[];
  scopedTicketUserIds: Array<string | ObjectId>;
  userMap: Map<string, ScopedUser>;
}

const getScopedUsers = async (currentUser: AuthUser): Promise<ScopedContext> => {
  const arkaDb = getArkaDb();
  const userCollection = arkaDb.collection('users');
  const currentObjectId = new ObjectId(currentUser._id);

  const query: Record<string, unknown> = {};

  if (currentUser.role !== 'admin') {
    if (currentUser.role === 'super_distributor') {
      query.$or = [
        { _id: currentObjectId },
        { superDistributorId: currentObjectId },
      ];
    } else if (currentUser.role === 'distributor') {
      query.$or = [
        { _id: currentObjectId },
        { distributorId: currentObjectId },
      ];
    } else if (currentUser.role === 'retailer') {
      query.$or = [
        { _id: currentObjectId },
        { retailerId: currentObjectId },
        { createdBy: currentObjectId },
      ];
    } else {
      query._id = currentObjectId;
    }
  }

  const users = (await userCollection.find(query).project({
    username: 1,
    role: 1,
    commissionRate: 1,
    distributorId: 1,
    superDistributorId: 1,
  }).toArray()) as ScopedUser[];

  const userMap = new Map<string, ScopedUser>();
  const scopedUserIdStrings: string[] = [];
  const scopedUserObjectIds: ObjectId[] = [];
  const scopedTicketUserIds: Array<string | ObjectId> = [];

  for (const user of users) {
    const idString = user._id.toString();
    userMap.set(idString, user);
    scopedUserIdStrings.push(idString);
    scopedUserObjectIds.push(user._id);
    scopedTicketUserIds.push(idString, user._id);
  }

  return { users, scopedUserIdStrings, scopedUserObjectIds, scopedTicketUserIds, userMap };
};

const getUserByTicketUserId = (userMap: Map<string, ScopedUser>, ticketUserId: unknown): ScopedUser | undefined => {
  if (!ticketUserId) return undefined;
  const asString = String(ticketUserId);
  return userMap.get(asString);
};

const getTransactionTypeFilter = (type?: string): string[] | null => {
  if (!type || type === 'all') return null;

  const normalized = type.toLowerCase();
  const legacyMap: Record<string, string[]> = {
    bet: ['BET_PLACEMENT'],
    win: ['WINNING_PAYOUT'],
    claim: ['WITHDRAWAL', 'HOUSE_WITHDRAWAL'],
    transfer: ['DEPOSIT', 'WITHDRAWAL', 'ADMIN_ADJUSTMENT'],
    adjust: ['ADMIN_ADJUSTMENT', 'SYSTEM_CORRECTION'],
    admin_add: ['DEPOSIT', 'HOUSE_DEPOSIT'],
  };

  if (legacyMap[normalized]) {
    return legacyMap[normalized];
  }

  return [type.toUpperCase()];
};

export class ReportService {
  static async getTurnoverReport(
    currentUser: AuthUser,
    dateFilter: ReportDateFilter,
    opts?: { search?: string; parentId?: string; childRole?: string },
  ) {
    const arkaDb = getArkaDb();
    const userCollection = arkaDb.collection('users');
    const currentObjectId = new ObjectId(currentUser._id);

    // Determine the set of "child nodes" to aggregate under (hierarchical drill-down)
    let nodeFilter: Record<string, unknown> | null = null;

    if (opts?.parentId) {
      // Drill down into a specific parent node
      const parentDoc = await userCollection.findOne(
        { _id: new ObjectId(opts.parentId) },
        { projection: { role: 1 } },
      );
      if (!parentDoc) {
        return { rows: [], totals: { playPoint: 0, winPoint: 0, endPoint: 0 } };
      }
      const parentRole = parentDoc.role as string;
      const parentOid = new ObjectId(opts.parentId);

      if (parentRole === 'distributor') {
        const roles = opts.childRole ? [opts.childRole] : ['retailer', 'user'];
        nodeFilter = { role: { $in: roles }, distributorId: parentOid };
      } else if (parentRole === 'super_distributor') {
        nodeFilter = opts.childRole
          ? { role: opts.childRole, superDistributorId: parentOid }
          : { role: 'distributor', superDistributorId: parentOid };
      } else if (parentRole === 'admin') {
        nodeFilter = opts.childRole ? { role: opts.childRole } : { role: 'super_distributor' };
      } else {
        nodeFilter = opts.childRole
          ? { role: opts.childRole, parentId: parentOid }
          : { parentId: parentOid };
      }
    } else {
      // Default: scope to direct children of the current user
      const role = currentUser.role;
      if (role === 'admin') {
        nodeFilter = opts?.childRole ? { role: opts.childRole } : { role: 'super_distributor' };
      } else if (role === 'super_distributor') {
        nodeFilter = opts?.childRole
          ? { role: opts.childRole, superDistributorId: currentObjectId }
          : { role: 'distributor', superDistributorId: currentObjectId };
      } else if (role === 'distributor') {
        const roles = opts?.childRole ? [opts.childRole] : ['retailer', 'user'];
        nodeFilter = { role: { $in: roles }, distributorId: currentObjectId };
      }
      // retailer/user: fall back to the flat scoped report below
    }

    // If drill-down mode is active, use node-aggregation approach.
    // Commissions are ALWAYS computed from leaf retailer/user nodes upward — regardless
    // of the child node level — matching sai-lucky-admin's recursive CTE approach.
    if (nodeFilter) {
      const childNodes = (await userCollection.find(nodeFilter).project({
        username: 1,
        role: 1,
        commissionRate: 1,
        superDistributorId: 1,
        distributorId: 1,
        retailerId: 1,
        parentId: 1,
      }).toArray()) as (ScopedUser & {
        superDistributorId?: ObjectId;
        distributorId?: ObjectId;
        retailerId?: ObjectId;
        parentId?: ObjectId;
      })[];

      if (!childNodes.length) {
        return { rows: [], totals: { playPoint: 0, winPoint: 0, endPoint: 0 } };
      }

      const childNodeIdStrings = new Set(childNodes.map((n) => n._id.toString()));

      // Fetch all leaf bettors with full ancestor chain for commission backtracking
      const allLeafDocs = (await userCollection.find({
        role: { $in: ['user', 'retailer'] },
      }).project({
        role: 1,
        commissionRate: 1,
        createdBy: 1,
        superDistributorId: 1,
        distributorId: 1,
        retailerId: 1,
        parentId: 1,
      }).toArray()) as Array<{
        _id: ObjectId;
        role: string;
        commissionRate?: number;
        createdBy?: ObjectId;
        superDistributorId?: ObjectId;
        distributorId?: ObjectId;
        retailerId?: ObjectId;
        parentId?: ObjectId;
      }>;

      const playerToChildNode = new Map<string, string>();
      for (const leaf of allLeafDocs) {
        const nodeId = resolveLeafToChildNode(leaf, childNodeIdStrings);
        if (nodeId) playerToChildNode.set(leaf._id.toString(), nodeId);
      }

      // Store leaf metadata for commission calculation during ticket aggregation
      const leafMetaMap = new Map<string, {
        commissionRate: number;
        distributorId?: string;
        superDistributorId?: string;
      }>();
      for (const leaf of allLeafDocs) {
        if (playerToChildNode.has(leaf._id.toString())) {
          leafMetaMap.set(leaf._id.toString(), {
            commissionRate: Number(leaf.commissionRate || 0),
            distributorId: leaf.distributorId?.toString(),
            superDistributorId: leaf.superDistributorId?.toString(),
          });
        }
      }

      // Two-pass ancestor rate lookup so we can resolve SD rate even from a retailer leaf
      // (retailers only store distributorId, not superDistributorId directly)
      const pass1Ids = new Set<string>();
      for (const meta of leafMetaMap.values()) {
        if (meta.distributorId) pass1Ids.add(meta.distributorId);
        if (meta.superDistributorId) pass1Ids.add(meta.superDistributorId);
      }
      const ancestorRateMap = new Map<string, number>();
      const distributorToSDMap = new Map<string, string>();
      if (pass1Ids.size > 0) {
        const pass1Docs = await userCollection.find(
          { _id: { $in: [...pass1Ids].map((id) => new ObjectId(id)) } },
          { projection: { commissionRate: 1, superDistributorId: 1, role: 1 } },
        ).toArray();
        const pass2Ids = new Set<string>();
        for (const a of pass1Docs) {
          const idStr = a._id.toString();
          ancestorRateMap.set(idStr, Number((a as any).commissionRate || 0));
          if ((a as any).role === 'distributor' && (a as any).superDistributorId) {
            const sdId = (a as any).superDistributorId.toString();
            distributorToSDMap.set(idStr, sdId);
            if (!ancestorRateMap.has(sdId)) pass2Ids.add(sdId);
          }
        }
        if (pass2Ids.size > 0) {
          const pass2Docs = await userCollection.find(
            { _id: { $in: [...pass2Ids].map((id) => new ObjectId(id)) } },
            { projection: { commissionRate: 1 } },
          ).toArray();
          for (const a of pass2Docs) {
            ancestorRateMap.set(a._id.toString(), Number((a as any).commissionRate || 0));
          }
        }
      }

      const scopedPlayerIds = [...playerToChildNode.keys()].map((id) => new ObjectId(id));
      if (!scopedPlayerIds.length) {
        return { rows: [], totals: { playPoint: 0, winPoint: 0, endPoint: 0 } };
      }

      const scopedTicketUserIds: Array<string | ObjectId> = [];
      for (const oid of scopedPlayerIds) scopedTicketUserIds.push(oid.toString(), oid);

      const matchStage: Record<string, unknown> = {
        userId: { $in: scopedTicketUserIds },
        status: { $ne: 'cancelled' },
      };
      applyTicketDateFilter(matchStage, dateFilter);

      const ticketCollection = getSkillGameDb().collection('tickets');
      const ticketAgg = await ticketCollection.aggregate([
        { $match: matchStage },
        ticketUserIdGroupStage,
      ]).toArray();

      // Accumulate per child-node: play/win + all three commission tiers from each leaf's rate chain
      type NodeBucket = {
        play: number; win: number;
        retailer_commission: number;
        distributor_commission: number;
        super_commission: number;
      };
      const bucketByNode = new Map<string, NodeBucket>();
      for (const n of childNodes) {
        bucketByNode.set(n._id.toString(), { play: 0, win: 0, retailer_commission: 0, distributor_commission: 0, super_commission: 0 });
      }

      for (const t of ticketAgg) {
        const leafId = String(t._id);
        const nodeId = playerToChildNode.get(leafId);
        if (!nodeId) continue;
        const bucket = bucketByNode.get(nodeId);
        if (!bucket) continue;

        const play = Number(t.playPoint || 0);
        bucket.play += play;
        bucket.win += Number(t.winPoint || 0);

        // Always compute commissions from the leaf's own rate chain (backtracking)
        const meta = leafMetaMap.get(leafId);
        const leafRate = meta?.commissionRate ?? 0;
        const dtId = meta?.distributorId;
        const dtRate = dtId ? (ancestorRateMap.get(dtId) ?? 0) : 0;
        const sdId = meta?.superDistributorId ?? (dtId ? distributorToSDMap.get(dtId) : undefined);
        const sdRate = sdId ? (ancestorRateMap.get(sdId) ?? 0) : 0;

        bucket.retailer_commission    += (play * leafRate) / 100;
        bucket.distributor_commission += (play * Math.max(0, dtRate - leafRate)) / 100;
        bucket.super_commission       += (play * Math.max(0, sdRate - dtRate)) / 100;
      }

      const normalizedSearch = opts?.search?.trim().toLowerCase();
      const rows = childNodes
        .map((node) => {
          const b = bucketByNode.get(node._id.toString());
          if (!b || b.play === 0) return null;
          return {
            userId: node._id.toString(),
            username: node.username,
            role: node.role,
            playPoint: b.play,
            winPoint: b.win,
            endPoint: b.play - b.win,
            commissionRate: Number(node.commissionRate || 0),
            retailer_commission_amount: b.retailer_commission,
            distributor_commission_amount: b.distributor_commission,
            super_commission_amount: b.super_commission,
            commissionAmount: b.retailer_commission + b.distributor_commission + b.super_commission,
          };
        })
        .filter((r): r is NonNullable<typeof r> => r !== null)
        .filter((r) => !normalizedSearch || r.username.toLowerCase().includes(normalizedSearch))
        .sort((a, b) => b.playPoint - a.playPoint);

      const totals = rows.reduce(
        (acc, r) => { acc.playPoint += r.playPoint; acc.winPoint += r.winPoint; acc.endPoint += r.endPoint; return acc; },
        { playPoint: 0, winPoint: 0, endPoint: 0 },
      );

      return { rows, totals };
    }

    // Flat scoped report (retailer/user role, or when no drill-down filter applies)
    const { scopedTicketUserIds, userMap } = await getScopedUsers(currentUser);
    if (!scopedTicketUserIds.length) {
      return { rows: [], totals: { playPoint: 0, winPoint: 0, endPoint: 0 } };
    }

    const matchStage: Record<string, unknown> = {
      userId: { $in: scopedTicketUserIds },
      status: { $ne: 'cancelled' },
    };
    applyTicketDateFilter(matchStage, dateFilter);

    const ticketCollection = getSkillGameDb().collection('tickets');
    const rows = await ticketCollection.aggregate([
      { $match: matchStage },
      ticketUserIdGroupStage,
      {
        $project: {
          _id: 0,
          userId: '$_id',
          playPoint: 1,
          winPoint: 1,
          endPoint: { $subtract: ['$playPoint', '$winPoint'] },
        },
      },
      { $sort: { playPoint: -1 } },
    ]).toArray();

    // Build ancestor rate lookup for tiered commission calculation
    const flatAncestorIds = new Set<string>();
    for (const [, u] of userMap) {
      const ux = u as any;
      if (ux.distributorId) flatAncestorIds.add(ux.distributorId.toString());
      if (ux.superDistributorId) flatAncestorIds.add(ux.superDistributorId.toString());
    }
    const flatAncestorRateMap = new Map<string, number>();
    if (flatAncestorIds.size > 0) {
      const aDocs = await userCollection.find(
        { _id: { $in: [...flatAncestorIds].map((id) => new ObjectId(id)) } },
        { projection: { commissionRate: 1 } },
      ).toArray();
      for (const a of aDocs) {
        flatAncestorRateMap.set(a._id.toString(), Number((a as any).commissionRate || 0));
      }
    }

    const normalizedSearch = opts?.search?.trim().toLowerCase();
    const enrichedRows = rows.map((row) => {
      const user = getUserByTicketUserId(userMap, row.userId) as any;
      const play = Number(row.playPoint || 0);
      const nodeRate = Number(user?.commissionRate || 0);
      const role: string = user?.role || 'user';

      let retailer_commission_amount = 0;
      let distributor_commission_amount = 0;
      let super_commission_amount = 0;

      if (role === 'retailer' || role === 'user') {
        const dtRate = user?.distributorId ? (flatAncestorRateMap.get(user.distributorId.toString()) ?? 0) : 0;
        const sdRate = user?.superDistributorId ? (flatAncestorRateMap.get(user.superDistributorId.toString()) ?? 0) : 0;
        retailer_commission_amount = (play * nodeRate) / 100;
        distributor_commission_amount = (play * Math.max(0, dtRate - nodeRate)) / 100;
        super_commission_amount = (play * Math.max(0, sdRate - dtRate)) / 100;
      } else if (role === 'distributor') {
        const sdRate = user?.superDistributorId ? (flatAncestorRateMap.get(user.superDistributorId.toString()) ?? 0) : 0;
        distributor_commission_amount = (play * nodeRate) / 100;
        super_commission_amount = (play * Math.max(0, sdRate - nodeRate)) / 100;
      } else if (role === 'super_distributor') {
        super_commission_amount = (play * nodeRate) / 100;
      }

      return {
        userId: String(row.userId),
        username: user?.username || 'unknown_user',
        role,
        playPoint: play,
        winPoint: Number(row.winPoint || 0),
        endPoint: Number(row.endPoint || 0),
        commissionRate: nodeRate,
        retailer_commission_amount,
        distributor_commission_amount,
        super_commission_amount,
        commissionAmount: retailer_commission_amount + distributor_commission_amount + super_commission_amount,
      };
    }).filter((row) => !normalizedSearch || row.username.toLowerCase().includes(normalizedSearch));

    const totals = enrichedRows.reduce((acc, row) => {
      acc.playPoint += row.playPoint;
      acc.winPoint += row.winPoint;
      acc.endPoint += row.endPoint;
      return acc;
    }, { playPoint: 0, winPoint: 0, endPoint: 0 });

    return { rows: enrichedRows, totals };
  }

  static async getTransactionsReport(
    currentUser: AuthUser,
    dateFilter: ReportDateFilter,
    options: { search?: string; type?: string; page: number; limit: number },
  ) {
    const { scopedUserObjectIds, userMap } = await getScopedUsers(currentUser);
    if (!scopedUserObjectIds.length) {
      return { transactions: [], total: 0, page: options.page, limit: options.limit };
    }

    const query: Record<string, unknown> = {
      $or: [
        { 'source.userId': { $in: scopedUserObjectIds } },
        { 'destination.userId': { $in: scopedUserObjectIds } },
      ],
    };
    applyTransactionDateFilter(query, dateFilter);

    const typeFilter = getTransactionTypeFilter(options.type);
    if (typeFilter) {
      query.type = { $in: typeFilter };
    }

    if (options.search?.trim()) {
      const pattern = new RegExp(options.search.trim(), 'i');
      const matchedObjectIds = Array.from(userMap.entries())
        .filter(([, user]) => pattern.test(user.username))
        .map(([userId]) => new ObjectId(userId));

      query.$and = [
        {
          $or: [
            { 'source.userId': { $in: matchedObjectIds } },
            { 'destination.userId': { $in: matchedObjectIds } },
            { 'source.username': pattern },
            { 'destination.username': pattern },
            { 'metadata.reason': pattern },
          ],
        },
      ];
    }

    const transactionCollection = getSkillGameDb().collection('transactions');
    const total = await transactionCollection.countDocuments(query);
    const skip = (options.page - 1) * options.limit;

    const transactions = await transactionCollection.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(options.limit)
      .toArray();

    const rows = transactions.map((tx) => ({
      id: tx._id.toString(),
      userId: String(tx.destination?.userId || tx.source?.userId || ''),
      username:
        getUserByTicketUserId(userMap, tx.destination?.userId)?.username ||
        getUserByTicketUserId(userMap, tx.source?.userId)?.username ||
        tx.destination?.username ||
        tx.source?.username ||
        'unknown_user',
      type: String(tx.type || ''),
      amount: Number(tx.amount || 0),
      balanceAfter: Number(tx.balances?.destinationBalanceAfter ?? tx.balances?.sourceBalanceAfter ?? 0),
      createdAt: tx.createdAt,
      description: String(tx.metadata?.reason || tx.type || ''),
    }));

    return { transactions: rows, total, page: options.page, limit: options.limit };
  }

  static async getCommissionPayoutReport(currentUser: AuthUser, dateFilter: ReportDateFilter, roleFilter?: string, search?: string) {
    const { users, scopedTicketUserIds } = await getScopedUsers(currentUser);
    if (!scopedTicketUserIds.length) {
      return { rows: [], totals: { totalBet: 0, totalCommission: 0 } };
    }

    const payoutRoleSet = new Set<UserRole>(['super_distributor', 'distributor', 'retailer']);
    const eligibleRows = users.filter((user) => payoutRoleSet.has(user.role));

    const matchStage: Record<string, unknown> = {
      userId: { $in: scopedTicketUserIds },
      status: { $ne: 'cancelled' },
    };
    applyTicketDateFilter(matchStage, dateFilter);

    const ticketCollection = getSkillGameDb().collection('tickets');
    const totalsByUser = await ticketCollection.aggregate([
      { $match: matchStage },
      {
        $group: {
          _id: '$userId',
          totalBet: { $sum: { $ifNull: ['$totalPoint', 0] } },
        },
      },
    ]).toArray();

    const directTotals = new Map<string, number>();
    for (const row of totalsByUser) {
      directTotals.set(String(row._id), Number(row.totalBet || 0));
    }

    const rows = eligibleRows.map((user) => {
      const userId = user._id.toString();
      const userTotal = directTotals.get(userId) || 0;
      const commissionRate = Number(user.commissionRate || 0);
      return {
        userId,
        username: user.username,
        role: user.role,
        commissionRate,
        totalBet: userTotal,
        commissionEarned: (userTotal * commissionRate) / 100,
      };
    }).filter((row) => {
      const matchesRole = !roleFilter || roleFilter === 'all' || row.role === roleFilter;
      const matchesSearch = !search || row.username.toLowerCase().includes(search.trim().toLowerCase());
      return matchesRole && matchesSearch;
    }).sort((a, b) => b.commissionEarned - a.commissionEarned);

    const totals = rows.reduce((acc, row) => {
      acc.totalBet += row.totalBet;
      acc.totalCommission += row.commissionEarned;
      return acc;
    }, { totalBet: 0, totalCommission: 0 });

    return { rows, totals };
  }

  static async getAdminCommissionReport(currentUser: AuthUser, dateFilter: ReportDateFilter, search?: string) {
    if (currentUser.role !== 'admin') {
      throw new Error('Access denied - Admin only');
    }

    const matchStage: Record<string, unknown> = { status: { $ne: 'cancelled' } };
    applyTicketDateFilter(matchStage, dateFilter);

    const ticketCollection = getSkillGameDb().collection('tickets');
    const rows = await ticketCollection.aggregate([
      { $match: matchStage },
      {
        $group: {
          _id: '$gameType',
          totalBetPoint: { $sum: { $ifNull: ['$totalPoint', 0] } },
          totalWonPoint: { $sum: { $ifNull: ['$winPoint', 0] } },
        },
      },
      {
        $project: {
          _id: 0,
          gameName: { $concat: [{ $toUpper: { $ifNull: ['$_id', 'UNKNOWN'] } }, ' Game'] },
          gameType: { $ifNull: ['$_id', 'unknown'] },
          totalBetPoint: 1,
          totalWonPoint: 1,
          commissionAmount: { $subtract: ['$totalBetPoint', '$totalWonPoint'] },
        },
      },
      { $sort: { totalBetPoint: -1 } },
    ]).toArray();

    const normalizedSearch = search?.trim().toLowerCase();
    const filteredRows = rows.filter((row) => !normalizedSearch || String(row.gameName).toLowerCase().includes(normalizedSearch));

    const totals = filteredRows.reduce((acc, row) => {
      acc.totalBetPoint += Number(row.totalBetPoint || 0);
      acc.totalWonPoint += Number(row.totalWonPoint || 0);
      acc.commissionAmount += Number(row.commissionAmount || 0);
      return acc;
    }, { totalBetPoint: 0, totalWonPoint: 0, commissionAmount: 0 });

    return { rows: filteredRows, totals };
  }

  static deriveTicketHistoryStatus(ticket: {
    status?: string;
    winPoint?: number;
    claimed?: boolean;
  }): 'claimed' | 'not claim' | 'loss' | 'No Result Declare' {
    if (ticket.status === 'cancelled') return 'loss';
    if (ticket.status === 'result_pending') return 'No Result Declare';
    const win = Number(ticket.winPoint || 0);
    if (win > 0) return ticket.claimed ? 'claimed' : 'not claim';
    return 'loss';
  }

  private static makeDeleteConfirmToken(payload: {
    target: string;
    from: string;
    to: string;
    count: number;
  }): string {
    return Buffer.from(JSON.stringify(payload)).toString('base64');
  }

  static async getGameHistoryReport(
    currentUser: AuthUser,
    dateFilter: ReportDateFilter,
    options: {
      gameType?: string;
      username?: string;
      search?: string;
      exactDate?: string;
      limit?: number;
    },
  ) {
    const { scopedTicketUserIds } = await getScopedUsers(currentUser);
    if (!scopedTicketUserIds.length) {
      return { rows: [] as Array<Record<string, unknown>> };
    }

    const matchStage: Record<string, unknown> = {
      userId: { $in: scopedTicketUserIds },
    };

    if (options.exactDate && /^\d{4}-\d{2}-\d{2}$/.test(options.exactDate)) {
      const exactClause = buildDrawDateFilter({ fromYmd: options.exactDate, toYmd: options.exactDate });
      if (exactClause) Object.assign(matchStage, exactClause);
    } else {
      applyTicketDateFilter(matchStage, dateFilter);
    }

    const normalizedGameType = options.gameType?.trim().toLowerCase();
    if (normalizedGameType && normalizedGameType !== 'all') {
      matchStage.gameType = normalizedGameType;
    }

    if (options.username?.trim()) {
      matchStage.username = options.username.trim();
    }

    const limit = Math.min(500, Math.max(1, options.limit ?? 500));
    const ticketCollection = getSkillGameDb().collection('tickets');
    const tickets = await ticketCollection.find(matchStage)
      .sort({ createdAt: -1 })
      .limit(limit)
      .toArray();

    const resultCollection = getSkillGameDb().collection('results');
    const slotKeys = new Set<string>();
    for (const ticket of tickets) {
      if (ticket.status === 'result_pending') continue;
      const drawDate = String(ticket.drawDate || '');
      const drawTime = String(ticket.drawTime || '');
      if (drawDate && drawTime) slotKeys.add(`${drawDate}|${drawTime}`);
    }

    const gameTypeBySlot = new Map<string, string>();
    for (const ticket of tickets) {
      const drawDate = String(ticket.drawDate || '');
      const drawTime = String(ticket.drawTime || '');
      if (!drawDate || !drawTime) continue;
      const key = `${drawDate}|${drawTime}`;
      if (!gameTypeBySlot.has(key)) {
        gameTypeBySlot.set(key, String(ticket.gameType || '2d'));
      }
    }

    const resultBySlot = new Map<string, string>();
    await Promise.all(
      Array.from(slotKeys).map(async (key) => {
        const [drawDate, drawTime] = key.split('|');
        const dateStart = new Date(`${drawDate}T00:00:00`);
        const dateEnd = new Date(`${drawDate}T23:59:59.999`);
        const resultDoc = await resultCollection.findOne({
          time: drawTime,
          date: { $gte: dateStart, $lte: dateEnd },
          isPublished: true,
        });
        if (!resultDoc) {
          resultBySlot.set(key, `${drawDate} ${drawTime}`);
          return;
        }
        const gameType = gameTypeBySlot.get(key) || '2d';
        if (gameType === '3d' && resultDoc.results3D) {
          const r3d = resultDoc.results3D as { A?: string; B?: string; C?: string };
          resultBySlot.set(key, `${r3d.A ?? '000'}-${r3d.B ?? '000'}-${r3d.C ?? '000'}`);
          return;
        }
        const filters = Array.isArray(resultDoc.results) ? resultDoc.results : [];
        const first = filters[0] as { columns?: string[] } | undefined;
        const sample = first?.columns?.[0];
        resultBySlot.set(key, sample ? `${drawTime} · ${sample}` : `${drawDate} ${drawTime}`);
      }),
    );

    const normalizedSearch = options.search?.trim().toLowerCase();
    const rows = tickets.map((ticket) => {
      const playPoint = Number(ticket.totalPoint || 0);
      const wonPoint = Number(ticket.winPoint || 0);
      const drawDate = String(ticket.drawDate || '');
      const drawTime = String(ticket.drawTime || '');
      const slotKey = drawDate && drawTime ? `${drawDate}|${drawTime}` : '';
      const status = ReportService.deriveTicketHistoryStatus({
        status: ticket.status as string | undefined,
        winPoint: ticket.winPoint as number | undefined,
        claimed: ticket.claimed as boolean | undefined,
      });
      const gameResult =
        status === 'No Result Declare'
          ? null
          : (slotKey ? resultBySlot.get(slotKey) ?? `${drawDate} ${drawTime}` : null);

      return {
        id: ticket._id.toString(),
        createdAt: ticket.createdAt,
        username: String(ticket.username || ''),
        gameType: String(ticket.gameType || '2d'),
        gameId: String(ticket.gameId || ''),
        ticketId: ticket._id.toString(),
        barcode: String(ticket.barcode || ''),
        drawDate,
        drawTime,
        playPoint,
        wonPoint,
        endPoint: playPoint - wonPoint,
        gameResult,
        status,
        items: Array.isArray(ticket.items)
          ? ticket.items.map((item: Record<string, unknown>) => ({
            label: String(item.label || ''),
            amount: Number(item.amount || 0),
            seriesKey: String(item.seriesKey || ''),
            seriesLetter: String(item.seriesLetter || ''),
            format: item.format ? String(item.format) : undefined,
          }))
          : [],
      };
    }).filter((row) => {
      if (!normalizedSearch) return true;
      const hay = [
        row.username,
        row.gameType,
        row.gameId,
        row.ticketId,
        row.barcode,
        row.status,
        row.drawDate,
        row.drawTime,
        row.gameResult,
        String(row.playPoint),
        String(row.wonPoint),
        String(row.endPoint),
      ]
        .join(' ')
        .toLowerCase();
      return hay.includes(normalizedSearch);
    });

    return { rows };
  }

  static async previewDeleteGameHistory(
    currentUser: AuthUser,
    from: string,
    to: string,
  ) {
    if (currentUser.role !== 'admin') {
      throw new Error('Access denied - Admin only');
    }

    if (from > to) {
      throw new Error('Invalid date range');
    }

    const drawDateClause = buildDrawDateFilter({ fromYmd: from, toYmd: to });
    const ticketCollection = getSkillGameDb().collection('tickets');
    const previewCount = await ticketCollection.countDocuments(drawDateClause ?? {});

    const confirmToken = ReportService.makeDeleteConfirmToken({
      target: 'history',
      from,
      to,
      count: previewCount,
    });

    return {
      previewCount,
      confirmToken,
      message:
        previewCount > 0
          ? `This will delete ${previewCount} ticket records.`
          : 'No records found for this range.',
    };
  }

  static async confirmDeleteGameHistory(
    currentUser: AuthUser,
    from: string,
    to: string,
    confirmToken: string,
  ) {
    if (currentUser.role !== 'admin') {
      throw new Error('Access denied - Admin only');
    }

    if (from > to) {
      throw new Error('Invalid date range');
    }

    const drawDateClause = buildDrawDateFilter({ fromYmd: from, toYmd: to });
    const ticketCollection = getSkillGameDb().collection('tickets');
    const previewCount = await ticketCollection.countDocuments(drawDateClause ?? {});

    const expectedToken = ReportService.makeDeleteConfirmToken({
      target: 'history',
      from,
      to,
      count: previewCount,
    });

    if (!confirmToken || confirmToken !== expectedToken) {
      throw new Error('Confirmation required. Please preview again and confirm with the latest token.');
    }

    const deleteResult = await ticketCollection.deleteMany(drawDateClause ?? {});

    return {
      deletedCount: deleteResult.deletedCount ?? 0,
      message:
        (deleteResult.deletedCount ?? 0) > 0
          ? `Deleted ${deleteResult.deletedCount} ticket records.`
          : 'No records deleted for this range.',
    };
  }
}
