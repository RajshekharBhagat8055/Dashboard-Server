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
    claimPoint: {
      $sum: {
        $cond: [
          { $and: [{ $eq: ['$claimed', true] }, { $gt: ['$winPoint', 0] }] },
          { $ifNull: ['$winPoint', 0] },
          0,
        ],
      },
    },
  },
};

const emptyTurnoverTotals = () => ({
  playPoint: 0,
  winPoint: 0,
  claimPoint: 0,
  endPoint: 0,
});

const applyTransactionDateFilter = (query: Record<string, unknown>, dateFilter: ReportDateFilter) => {
  const createdAt = buildCreatedAtMatch(dateFilter);
  if (createdAt) query.createdAt = createdAt;
};

interface ScopedUser {
  _id: ObjectId;
  username: string;
  role: UserRole;
  commissionRate?: number;
  distributorId?: ObjectId;
  superDistributorId?: ObjectId;
  retailerId?: ObjectId;
  parentId?: ObjectId;
}

/** Split play into retailer / distributor / SD commission slices (differential rates). */
const computeTieredCommissions = (
  play: number,
  retailerRate: number,
  distributorRate: number,
  superDistributorRate: number,
) => ({
  retailer_commission: (play * retailerRate) / 100,
  distributor_commission: (play * Math.max(0, distributorRate - retailerRate)) / 100,
  super_commission: (play * Math.max(0, superDistributorRate - distributorRate)) / 100,
});

/**
 * Bottom "retailer" rate for a leaf bettor:
 * - retailer playing: own rate
 * - mobile user under retailer: parent's retailer rate
 * - legacy user under distributor (no retailerId): own rate (usually 0)
 */
const resolveRetailerRateForLeaf = (
  leaf: { role: string; commissionRate?: number; retailerId?: ObjectId | string },
  rateMap: Map<string, number>,
): number => {
  if (leaf.role === 'retailer') {
    return Number(leaf.commissionRate || 0);
  }
  const retailerId = leaf.retailerId?.toString();
  if (retailerId) {
    return rateMap.get(retailerId) ?? 0;
  }
  return Number(leaf.commissionRate || 0);
};

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
    retailerId: 1,
    parentId: 1,
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
        return { rows: [], totals: emptyTurnoverTotals() };
      }
      const parentRole = parentDoc.role as string;
      const parentOid = new ObjectId(opts.parentId);

      if (parentRole === 'distributor') {
        // Apex: distributor children are retailers only (users hang under retailers)
        nodeFilter = opts.childRole
          ? { role: opts.childRole, distributorId: parentOid }
          : { role: 'retailer', distributorId: parentOid };
      } else if (parentRole === 'super_distributor') {
        nodeFilter = opts.childRole
          ? { role: opts.childRole, superDistributorId: parentOid }
          : { role: 'distributor', superDistributorId: parentOid };
      } else if (parentRole === 'admin') {
        nodeFilter = opts.childRole ? { role: opts.childRole } : { role: 'super_distributor' };
      } else if (parentRole === 'retailer') {
        nodeFilter = opts.childRole
          ? { role: opts.childRole, retailerId: parentOid }
          : { role: 'user', retailerId: parentOid };
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
        nodeFilter = opts?.childRole
          ? { role: opts.childRole, distributorId: currentObjectId }
          : { role: 'retailer', distributorId: currentObjectId };
      } else if (role === 'retailer') {
        nodeFilter = opts?.childRole
          ? { role: opts.childRole, retailerId: currentObjectId }
          : { role: 'user', retailerId: currentObjectId };
      }
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
        return { rows: [], totals: emptyTurnoverTotals() };
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
        role: string;
        commissionRate: number;
        retailerId?: string;
        distributorId?: string;
        superDistributorId?: string;
      }>();
      for (const leaf of allLeafDocs) {
        if (playerToChildNode.has(leaf._id.toString())) {
          leafMetaMap.set(leaf._id.toString(), {
            role: leaf.role,
            commissionRate: Number(leaf.commissionRate || 0),
            retailerId: leaf.retailerId?.toString(),
            distributorId: leaf.distributorId?.toString(),
            superDistributorId: leaf.superDistributorId?.toString(),
          });
        }
      }

      // Ancestor rate lookup: retailers + distributors + SDs
      const pass1Ids = new Set<string>();
      for (const meta of leafMetaMap.values()) {
        if (meta.retailerId) pass1Ids.add(meta.retailerId);
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
        return { rows: [], totals: emptyTurnoverTotals() };
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

      // Accumulate per child-node: play/win/claim + all three commission tiers from each leaf's rate chain
      type NodeBucket = {
        play: number;
        win: number;
        claim: number;
        retailer_commission: number;
        distributor_commission: number;
        super_commission: number;
      };
      const bucketByNode = new Map<string, NodeBucket>();
      for (const n of childNodes) {
        bucketByNode.set(n._id.toString(), {
          play: 0,
          win: 0,
          claim: 0,
          retailer_commission: 0,
          distributor_commission: 0,
          super_commission: 0,
        });
      }

      const applyLeafPlayWin = (leafId: string, play: number, win: number, claim: number) => {
        if (play <= 0 && win <= 0 && claim <= 0) return;
        const nodeId = playerToChildNode.get(leafId);
        if (!nodeId) return;
        const bucket = bucketByNode.get(nodeId);
        if (!bucket) return;

        bucket.play += play;
        bucket.win += win;
        bucket.claim += claim;

        // Apex chain: SD → D → R → user
        // Retailer slice uses retailer rate (not mobile user's 0%)
        const meta = leafMetaMap.get(leafId);
        const retailerRate = meta
          ? resolveRetailerRateForLeaf(meta, ancestorRateMap)
          : 0;
        const dtId = meta?.distributorId;
        const dtRate = dtId ? (ancestorRateMap.get(dtId) ?? 0) : 0;
        const sdId = meta?.superDistributorId ?? (dtId ? distributorToSDMap.get(dtId) : undefined);
        const sdRate = sdId ? (ancestorRateMap.get(sdId) ?? 0) : 0;

        const tiers = computeTieredCommissions(play, retailerRate, dtRate, sdRate);
        bucket.retailer_commission += tiers.retailer_commission;
        bucket.distributor_commission += tiers.distributor_commission;
        bucket.super_commission += tiers.super_commission;
      };

      for (const t of ticketAgg) {
        applyLeafPlayWin(
          String(t._id),
          Number(t.playPoint || 0),
          Number(t.winPoint || 0),
          Number(t.claimPoint || 0),
        );
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
            claimPoint: b.claim,
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
        (acc, r) => {
          acc.playPoint += r.playPoint;
          acc.winPoint += r.winPoint;
          acc.claimPoint += r.claimPoint;
          acc.endPoint += r.endPoint;
          return acc;
        },
        emptyTurnoverTotals(),
      );

      return { rows, totals };
    }

    // Flat scoped report (retailer/user role, or when no drill-down filter applies)
    const { scopedTicketUserIds, scopedUserIdStrings, userMap } = await getScopedUsers(currentUser);
    if (!scopedTicketUserIds.length) {
      return { rows: [], totals: emptyTurnoverTotals() };
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
          claimPoint: 1,
          endPoint: { $subtract: ['$playPoint', '$winPoint'] },
        },
      },
      { $sort: { playPoint: -1 } },
    ]).toArray();

    const mergedRows = rows.map((row) => {
      const userId = String(row.userId);
      const playPoint = Number(row.playPoint || 0);
      const winPoint = Number(row.winPoint || 0);
      const claimPoint = Number(row.claimPoint || 0);
      return {
        userId,
        playPoint,
        winPoint,
        claimPoint,
        endPoint: playPoint - winPoint,
      };
    }).sort((a, b) => b.playPoint - a.playPoint);

    // Build ancestor rate lookup for tiered commission calculation (retailer + D + SD)
    const flatAncestorIds = new Set<string>();
    for (const [, u] of userMap) {
      const ux = u as ScopedUser;
      if (ux.retailerId) flatAncestorIds.add(ux.retailerId.toString());
      if (ux.distributorId) flatAncestorIds.add(ux.distributorId.toString());
      if (ux.superDistributorId) flatAncestorIds.add(ux.superDistributorId.toString());
    }
    const flatAncestorRateMap = new Map<string, number>();
    const flatDistributorToSDMap = new Map<string, string>();
    if (flatAncestorIds.size > 0) {
      const aDocs = await userCollection.find(
        { _id: { $in: [...flatAncestorIds].map((id) => new ObjectId(id)) } },
        { projection: { commissionRate: 1, superDistributorId: 1, role: 1 } },
      ).toArray();
      const pass2Ids = new Set<string>();
      for (const a of aDocs) {
        flatAncestorRateMap.set(a._id.toString(), Number((a as any).commissionRate || 0));
        if ((a as any).role === 'distributor' && (a as any).superDistributorId) {
          const sdId = (a as any).superDistributorId.toString();
          flatDistributorToSDMap.set(a._id.toString(), sdId);
          if (!flatAncestorRateMap.has(sdId)) pass2Ids.add(sdId);
        }
      }
      if (pass2Ids.size > 0) {
        const pass2Docs = await userCollection.find(
          { _id: { $in: [...pass2Ids].map((id) => new ObjectId(id)) } },
          { projection: { commissionRate: 1 } },
        ).toArray();
        for (const a of pass2Docs) {
          flatAncestorRateMap.set(a._id.toString(), Number((a as any).commissionRate || 0));
        }
      }
    }

    const normalizedSearch = opts?.search?.trim().toLowerCase();
    const enrichedRows = mergedRows.map((row) => {
      const user = getUserByTicketUserId(userMap, row.userId) as ScopedUser | undefined;
      const play = Number(row.playPoint || 0);
      const nodeRate = Number(user?.commissionRate || 0);
      const role: string = user?.role || 'user';

      let retailer_commission_amount = 0;
      let distributor_commission_amount = 0;
      let super_commission_amount = 0;

      if (role === 'retailer' || role === 'user') {
        const retailerRate = resolveRetailerRateForLeaf(
          {
            role,
            commissionRate: nodeRate,
            retailerId: user?.retailerId,
          },
          flatAncestorRateMap,
        );
        const dtId = user?.distributorId?.toString();
        const dtRate = dtId ? (flatAncestorRateMap.get(dtId) ?? 0) : 0;
        const sdId =
          user?.superDistributorId?.toString() ??
          (dtId ? flatDistributorToSDMap.get(dtId) : undefined);
        const sdRate = sdId ? (flatAncestorRateMap.get(sdId) ?? 0) : 0;
        const tiers = computeTieredCommissions(play, retailerRate, dtRate, sdRate);
        retailer_commission_amount = tiers.retailer_commission;
        distributor_commission_amount = tiers.distributor_commission;
        super_commission_amount = tiers.super_commission;
      } else if (role === 'distributor') {
        const sdRate = user?.superDistributorId
          ? (flatAncestorRateMap.get(user.superDistributorId.toString()) ?? 0)
          : 0;
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
        claimPoint: Number(row.claimPoint || 0),
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
      acc.claimPoint += row.claimPoint;
      acc.endPoint += row.endPoint;
      return acc;
    }, emptyTurnoverTotals());

    return { rows: enrichedRows, totals };
  }

  static async getTransactionsReport(
    currentUser: AuthUser,
    dateFilter: ReportDateFilter,
    options: { search?: string; type?: string; page: number; limit: number },
  ) {
    const { scopedUserObjectIds, scopedUserIdStrings, userMap } = await getScopedUsers(currentUser);
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

    // Two independent stores (Mongo transactions + Postgres wallet_log) can't be
    // paginated with a single DB-level skip/limit, so both sides are fetched up to
    // MERGE_CAP, merged in memory, and re-sliced for the requested page. This is
    // exact for the common date-filtered case; for very large unfiltered ranges
    // (more than MERGE_CAP rows on either side) deep pages may undercount.
    const MERGE_CAP = 2000;
    const transactionCollection = getSkillGameDb().collection('transactions');
    const mongoTotal = await transactionCollection.countDocuments(query);
    const skip = (options.page - 1) * options.limit;

    const transactions = await transactionCollection.find(query)
      .sort({ createdAt: -1 })
      .limit(MERGE_CAP)
      .toArray();

    const skillRows = transactions.map((tx) => ({
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

    const rows = skillRows.slice(skip, skip + options.limit);
    const total = mongoTotal;

    return { transactions: rows, total, page: options.page, limit: options.limit };
  }

  static async getCommissionPayoutReport(currentUser: AuthUser, dateFilter: ReportDateFilter, roleFilter?: string, search?: string) {
    const arkaDb = getArkaDb();
    const userCollection = arkaDb.collection('users');
    const { users, scopedTicketUserIds } = await getScopedUsers(currentUser);
    if (!scopedTicketUserIds.length) {
      return { rows: [], totals: { totalBet: 0, totalCommission: 0 } };
    }

    const payoutRoleSet = new Set<UserRole>(['super_distributor', 'distributor', 'retailer']);
    const eligibleRows = users.filter((user) => payoutRoleSet.has(user.role));

    // Leaf bettors in scope (mobile users + retailers who may play)
    const leafUsers = users.filter((u) => u.role === 'user' || u.role === 'retailer');
    const leafIdSet = new Set(leafUsers.map((u) => u._id.toString()));

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
          _id: { $toString: '$userId' },
          totalBet: { $sum: { $ifNull: ['$totalPoint', 0] } },
        },
      },
    ]).toArray();

    const leafPlayMap = new Map<string, number>();
    for (const row of totalsByUser) {
      const id = String(row._id);
      if (leafIdSet.has(id)) {
        leafPlayMap.set(id, Number(row.totalBet || 0));
      }
    }

    // Rate map for all scoped users + ensure SD rates for distributors
    const rateMap = new Map<string, number>();
    const distributorToSDMap = new Map<string, string>();
    for (const u of users) {
      rateMap.set(u._id.toString(), Number(u.commissionRate || 0));
      if (u.role === 'distributor' && u.superDistributorId) {
        distributorToSDMap.set(u._id.toString(), u.superDistributorId.toString());
      }
    }
    // Fill any missing SD rates referenced by distributors
    const missingSdIds = [...distributorToSDMap.values()].filter((id) => !rateMap.has(id));
    if (missingSdIds.length > 0) {
      const sdDocs = await userCollection.find(
        { _id: { $in: missingSdIds.map((id) => new ObjectId(id)) } },
        { projection: { commissionRate: 1 } },
      ).toArray();
      for (const a of sdDocs) {
        rateMap.set(a._id.toString(), Number((a as any).commissionRate || 0));
      }
    }

    // Accumulate totalBet + earned commission per hierarchy party
    const betUnder = new Map<string, number>();
    const earned = new Map<string, number>();
    for (const u of eligibleRows) {
      betUnder.set(u._id.toString(), 0);
      earned.set(u._id.toString(), 0);
    }

    for (const leaf of leafUsers) {
      const play = leafPlayMap.get(leaf._id.toString()) || 0;
      if (play <= 0) continue;

      const retailerId =
        leaf.role === 'retailer' ? leaf._id.toString() : leaf.retailerId?.toString();
      const distributorId = leaf.distributorId?.toString();
      const sdId =
        leaf.superDistributorId?.toString() ??
        (distributorId ? distributorToSDMap.get(distributorId) : undefined);

      const retailerRate = resolveRetailerRateForLeaf(leaf, rateMap);
      const dtRate = distributorId ? (rateMap.get(distributorId) ?? 0) : 0;
      const sdRate = sdId ? (rateMap.get(sdId) ?? 0) : 0;
      const tiers = computeTieredCommissions(play, retailerRate, dtRate, sdRate);

      if (retailerId && betUnder.has(retailerId)) {
        betUnder.set(retailerId, (betUnder.get(retailerId) || 0) + play);
        earned.set(retailerId, (earned.get(retailerId) || 0) + tiers.retailer_commission);
      }
      if (distributorId && betUnder.has(distributorId)) {
        betUnder.set(distributorId, (betUnder.get(distributorId) || 0) + play);
        earned.set(distributorId, (earned.get(distributorId) || 0) + tiers.distributor_commission);
      }
      if (sdId && betUnder.has(sdId)) {
        betUnder.set(sdId, (betUnder.get(sdId) || 0) + play);
        earned.set(sdId, (earned.get(sdId) || 0) + tiers.super_commission);
      }
    }

    const rows = eligibleRows.map((user) => {
      const userId = user._id.toString();
      return {
        userId,
        username: user.username,
        role: user.role,
        commissionRate: Number(user.commissionRate || 0),
        totalBet: betUnder.get(userId) || 0,
        commissionEarned: earned.get(userId) || 0,
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
    const { scopedTicketUserIds, scopedUserIdStrings, userMap } = await getScopedUsers(currentUser);
    if (!scopedTicketUserIds.length) {
      return { rows: [] as Array<Record<string, unknown>> };
    }

    const normalizedGameType = options.gameType?.trim().toLowerCase();

    const limit = Math.min(500, Math.max(1, options.limit ?? 500));
    const skillRows: Array<Record<string, unknown>> = [];

    {
      const matchStage: Record<string, unknown> = {
        userId: { $in: scopedTicketUserIds },
      };

      if (options.exactDate && /^\d{4}-\d{2}-\d{2}$/.test(options.exactDate)) {
        const exactClause = buildDrawDateFilter({ fromYmd: options.exactDate, toYmd: options.exactDate });
        if (exactClause) Object.assign(matchStage, exactClause);
      } else {
        applyTicketDateFilter(matchStage, dateFilter);
      }

      if (normalizedGameType === '2d' || normalizedGameType === '3d') {
        matchStage.gameType = normalizedGameType;
      }

      if (options.username?.trim()) {
        matchStage.username = options.username.trim();
      }

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

      for (const ticket of tickets) {
        const playPoint = Number(ticket.totalPoint || 0);
        const wonPoint = Number(ticket.winPoint || 0);
        const claimed = Boolean(ticket.claimed);
        const claimPoint = claimed && wonPoint > 0 ? wonPoint : 0;
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

        skillRows.push({
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
          claimPoint,
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
        });
      }
    }

    const normalizedSearch = options.search?.trim().toLowerCase();
    const merged = [...skillRows]
      .filter((row) => {
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
          String(row.claimPoint ?? 0),
          String(row.endPoint),
        ]
          .join(' ')
          .toLowerCase();
        return hay.includes(normalizedSearch);
      })
      .sort((a, b) => {
        const at = new Date(String(a.createdAt || 0)).getTime();
        const bt = new Date(String(b.createdAt || 0)).getTime();
        return (Number.isFinite(bt) ? bt : 0) - (Number.isFinite(at) ? at : 0);
      })
      .slice(0, limit);

    return { rows: merged };
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
          ? `This will delete ${previewCount} skill-game (2d/3d) ticket records. Dus Ka Dum tickets are not deleted.`
          : 'No skill-game records found for this range. Dus Ka Dum tickets are not included in delete.',
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
