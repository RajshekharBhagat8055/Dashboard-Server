import { ObjectId } from 'mongodb';
import { getArkaDb, getSkillGameDb } from '../config/connectDB';

type UserRole = 'admin' | 'super_distributor' | 'distributor' | 'retailer' | 'user';

interface AuthUser {
  _id: string;
  role: UserRole;
}

interface ReportDateFilter {
  from?: Date;
  to?: Date;
}

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

const buildCreatedAtFilter = (dateFilter: ReportDateFilter): Record<string, Date> | undefined => {
  const match: Record<string, Date> = {};
  if (dateFilter.from) match.$gte = dateFilter.from;
  if (dateFilter.to) match.$lte = dateFilter.to;
  return Object.keys(match).length ? match : undefined;
};

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
  static async getTurnoverReport(currentUser: AuthUser, dateFilter: ReportDateFilter, search?: string) {
    const { scopedTicketUserIds, userMap } = await getScopedUsers(currentUser);
    if (!scopedTicketUserIds.length) {
      return { rows: [], totals: { playPoint: 0, winPoint: 0, endPoint: 0 } };
    }

    const createdAtFilter = buildCreatedAtFilter(dateFilter);
    const matchStage: Record<string, unknown> = {
      userId: { $in: scopedTicketUserIds },
    };
    if (createdAtFilter) {
      matchStage.createdAt = createdAtFilter;
    }

    const ticketCollection = getSkillGameDb().collection('tickets');
    const rows = await ticketCollection.aggregate([
      { $match: matchStage },
      {
        $group: {
          _id: '$userId',
          playPoint: { $sum: { $ifNull: ['$totalPoint', 0] } },
          winPoint: { $sum: { $ifNull: ['$winPoint', 0] } },
        },
      },
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

    const normalizedSearch = search?.trim().toLowerCase();
    const enrichedRows = rows.map((row) => {
      const user = getUserByTicketUserId(userMap, row.userId);
      return {
        userId: String(row.userId),
        username: user?.username || 'unknown_user',
        playPoint: Number(row.playPoint || 0),
        winPoint: Number(row.winPoint || 0),
        endPoint: Number(row.endPoint || 0),
        superCommissionRate: 5,
        distributorCommissionRate: 3,
        retailerCommissionRate: 2,
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

    const createdAtFilter = buildCreatedAtFilter(dateFilter);
    const query: Record<string, unknown> = {
      $or: [
        { 'source.userId': { $in: scopedUserObjectIds } },
        { 'destination.userId': { $in: scopedUserObjectIds } },
      ],
    };
    if (createdAtFilter) query.createdAt = createdAtFilter;

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

    const createdAtFilter = buildCreatedAtFilter(dateFilter);
    const matchStage: Record<string, unknown> = {
      userId: { $in: scopedTicketUserIds },
    };
    if (createdAtFilter) matchStage.createdAt = createdAtFilter;

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

    const createdAtFilter = buildCreatedAtFilter(dateFilter);
    const matchStage: Record<string, unknown> = {};
    if (createdAtFilter) {
      matchStage.createdAt = createdAtFilter;
    }

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
}
