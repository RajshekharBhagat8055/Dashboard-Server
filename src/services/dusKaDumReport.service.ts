import { dusKaDumQuery, isDusKaDumDbConfigured } from '../config/dusKaDumDb';
import {
  formatUtcAsYmdInReportTz,
  reportDayEndUtc,
  reportDayStartUtc,
  type ReportYmdRange,
} from '../utils/reportDateRange';

export const DUS_KA_DUM_GAME_TYPE = 'dus-ka-dum';

export type DusHistoryStatus = 'claimed' | 'not claim' | 'loss' | 'No Result Declare';

export interface DusGameHistoryRow {
  id: string;
  createdAt: Date | string | null;
  username: string;
  gameType: typeof DUS_KA_DUM_GAME_TYPE;
  gameId: string;
  ticketId: string;
  barcode: string;
  drawDate: string;
  drawTime: string;
  playPoint: number;
  wonPoint: number;
  endPoint: number;
  gameResult: string | null;
  status: DusHistoryStatus;
  items: Array<{
    label: string;
    amount: number;
    seriesKey: string;
    seriesLetter: string;
  }>;
}

export interface DusUserAgg {
  userId: string;
  playPoint: number;
  winPoint: number;
}

interface DusBetSqlRow {
  id: string;
  user_id: string;
  ticket_id: string;
  total_bet: string | number;
  win_amount: string | number;
  claimed: boolean;
  canceled: boolean;
  bet_details: Record<string, unknown> | string | null;
  created_at: Date | string | null;
  game_id: string | null;
  time_slot: Date | string | null;
  win_number: number | null;
  reward: string | null;
  is_published: boolean | null;
}

interface DusAggSqlRow {
  user_id: string;
  play_point: string | number;
  win_point: string | number;
}

interface DusGameAggSqlRow {
  total_bet_point: string | number;
  total_won_point: string | number;
}

function toNumber(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function formatDrawParts(timeSlot: Date | string | null): { drawDate: string; drawTime: string } {
  if (!timeSlot) return { drawDate: '', drawTime: '' };
  const d = timeSlot instanceof Date ? timeSlot : new Date(timeSlot);
  if (Number.isNaN(d.getTime())) return { drawDate: '', drawTime: '' };

  const drawDate = formatUtcAsYmdInReportTz(d);
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: process.env.REPORT_TIMEZONE?.trim() || 'Asia/Kolkata',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(d);
  const hour = parts.find((p) => p.type === 'hour')?.value ?? '00';
  const minute = parts.find((p) => p.type === 'minute')?.value ?? '00';
  return { drawDate, drawTime: `${hour}:${minute}` };
}

function parseBetDetails(raw: DusBetSqlRow['bet_details']): Array<{
  label: string;
  amount: number;
  seriesKey: string;
  seriesLetter: string;
}> {
  let obj: Record<string, unknown> = {};
  if (typeof raw === 'string') {
    try {
      obj = JSON.parse(raw) as Record<string, unknown>;
    } catch {
      return [];
    }
  } else if (raw && typeof raw === 'object') {
    obj = raw;
  }

  return Object.entries(obj)
    .map(([label, amount]) => ({
      label: String(label),
      amount: toNumber(amount),
      seriesKey: String(label),
      seriesLetter: '',
    }))
    .filter((item) => item.amount > 0);
}

function deriveDusStatus(row: DusBetSqlRow): DusHistoryStatus {
  if (row.canceled) return 'loss';
  if (!row.is_published || row.win_number == null) return 'No Result Declare';
  const win = toNumber(row.win_amount);
  if (win > 0) return row.claimed ? 'claimed' : 'not claim';
  return 'loss';
}

function buildCreatedAtRange(dateFilter?: ReportYmdRange, exactDate?: string): {
  from?: Date;
  to?: Date;
} {
  if (exactDate && /^\d{4}-\d{2}-\d{2}$/.test(exactDate)) {
    return {
      from: reportDayStartUtc(exactDate),
      to: reportDayEndUtc(exactDate),
    };
  }
  if (!dateFilter?.fromYmd && !dateFilter?.toYmd) return {};
  return {
    from: dateFilter.fromYmd ? reportDayStartUtc(dateFilter.fromYmd) : undefined,
    to: dateFilter.toYmd ? reportDayEndUtc(dateFilter.toYmd) : undefined,
  };
}

export async function fetchDusGameHistoryRows(options: {
  userIds: string[];
  usernameByUserId: Map<string, string>;
  dateFilter?: ReportYmdRange;
  exactDate?: string;
  username?: string;
  search?: string;
  limit?: number;
}): Promise<DusGameHistoryRow[]> {
  if (!isDusKaDumDbConfigured() || !options.userIds.length) return [];

  let userIds = options.userIds;
  if (options.username?.trim()) {
    const wanted = options.username.trim().toLowerCase();
    userIds = userIds.filter((id) => (options.usernameByUserId.get(id) || '').toLowerCase() === wanted);
    if (!userIds.length) return [];
  }

  const range = buildCreatedAtRange(options.dateFilter, options.exactDate);
  const limit = Math.min(500, Math.max(1, options.limit ?? 500));
  const params: unknown[] = [userIds];
  let paramIdx = 2;

  let sql = `
    SELECT
      pb.id::text AS id,
      pb.user_id,
      pb.ticket_id,
      pb.total_bet,
      pb.win_amount,
      pb.claimed,
      pb.canceled,
      pb.bet_details,
      pb.created_at,
      d.game_id,
      d.time_slot,
      d.win_number,
      d.reward,
      d.is_published
    FROM player_bets pb
    LEFT JOIN draws d ON d.id = pb.draw_id
    WHERE pb.user_id = ANY($1::text[])
  `;

  if (range.from) {
    sql += ` AND pb.created_at >= $${paramIdx}`;
    params.push(range.from);
    paramIdx += 1;
  }
  if (range.to) {
    sql += ` AND pb.created_at <= $${paramIdx}`;
    params.push(range.to);
    paramIdx += 1;
  }

  sql += ` ORDER BY pb.created_at DESC NULLS LAST LIMIT $${paramIdx}`;
  params.push(limit);

  const rows = await dusKaDumQuery<DusBetSqlRow>(sql, params);
  const normalizedSearch = options.search?.trim().toLowerCase();

  return rows
    .map((row) => {
      const playPoint = toNumber(row.total_bet);
      const wonPoint = toNumber(row.win_amount);
      const { drawDate, drawTime } = formatDrawParts(row.time_slot);
      const status = deriveDusStatus(row);
      const gameResult =
        status === 'No Result Declare'
          ? null
          : row.win_number != null
            ? `${row.win_number}|${row.reward ?? '1'}`
            : drawDate && drawTime
              ? `${drawDate} ${drawTime}`
              : null;
      const username = options.usernameByUserId.get(row.user_id) || '';

      const mapped: DusGameHistoryRow = {
        id: row.id,
        createdAt: row.created_at,
        username,
        gameType: DUS_KA_DUM_GAME_TYPE,
        gameId: String(row.game_id || ''),
        ticketId: String(row.ticket_id || ''),
        barcode: String(row.ticket_id || ''),
        drawDate,
        drawTime,
        playPoint,
        wonPoint,
        endPoint: playPoint - wonPoint,
        gameResult,
        status,
        items: parseBetDetails(row.bet_details),
      };
      return mapped;
    })
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
        String(row.endPoint),
      ]
        .join(' ')
        .toLowerCase();
      return hay.includes(normalizedSearch);
    });
}

export async function fetchDusPlayWinByUser(options: {
  userIds: string[];
  dateFilter?: ReportYmdRange;
}): Promise<Map<string, DusUserAgg>> {
  const result = new Map<string, DusUserAgg>();
  if (!isDusKaDumDbConfigured() || !options.userIds.length) return result;

  const range = buildCreatedAtRange(options.dateFilter);
  const params: unknown[] = [options.userIds];
  let paramIdx = 2;

  let sql = `
    SELECT
      pb.user_id,
      COALESCE(SUM(pb.total_bet), 0) AS play_point,
      COALESCE(SUM(pb.win_amount), 0) AS win_point
    FROM player_bets pb
    WHERE pb.user_id = ANY($1::text[])
      AND pb.canceled = false
  `;

  if (range.from) {
    sql += ` AND pb.created_at >= $${paramIdx}`;
    params.push(range.from);
    paramIdx += 1;
  }
  if (range.to) {
    sql += ` AND pb.created_at <= $${paramIdx}`;
    params.push(range.to);
    paramIdx += 1;
  }

  sql += ` GROUP BY pb.user_id`;

  const rows = await dusKaDumQuery<DusAggSqlRow>(sql, params);
  for (const row of rows) {
    const userId = String(row.user_id);
    result.set(userId, {
      userId,
      playPoint: toNumber(row.play_point),
      winPoint: toNumber(row.win_point),
    });
  }
  return result;
}

export interface DusTransactionRow {
  id: string;
  userId: string;
  username: string;
  type: string;
  amount: number;
  balanceAfter: number;
  createdAt: Date | string | null;
  description: string;
}

interface DusWalletSqlRow {
  id: string;
  user_id: string;
  type: string;
  amount: string | number;
  balance_after: string | number | null;
  created_at: Date | string | null;
  ticket_id: string | null;
}

/**
 * Map wallet_log's lowercase event types onto the uppercase transaction-type
 * vocabulary skill_game_server already writes to Mongo (BET_PLACEMENT,
 * WINNING_PAYOUT, ...) so a merged Transaction Report behaves consistently.
 */
function mapDusWalletType(type: string): string {
  switch (type) {
    case 'bet':
      return 'BET_PLACEMENT';
    case 'bet_cancel':
      return 'BET_REFUND';
    case 'claim':
    case 'claim_all':
      return 'WINNING_PAYOUT';
    default:
      return type.toUpperCase();
  }
}

function dusWalletDescription(type: string, ticketId: string | null): string {
  const suffix = ticketId ? ` (Dus Ka Dum ${ticketId})` : ' (Dus Ka Dum)';
  switch (type) {
    case 'bet':
      return `Game Bet${suffix}`;
    case 'bet_cancel':
      return `Bet Cancel Refund${suffix}`;
    case 'claim':
      return `Claim${suffix}`;
    case 'claim_all':
      return `Claim All${suffix}`;
    default:
      return `${type}${suffix}`;
  }
}

export async function fetchDusWalletTransactions(options: {
  userIds: string[];
  usernameByUserId: Map<string, string>;
  dateFilter?: ReportYmdRange;
  types?: string[];
  search?: string;
  limit?: number;
}): Promise<DusTransactionRow[]> {
  if (!isDusKaDumDbConfigured() || !options.userIds.length) return [];

  const range = buildCreatedAtRange(options.dateFilter);
  const limit = Math.min(2000, Math.max(1, options.limit ?? 2000));
  const params: unknown[] = [options.userIds];
  let paramIdx = 2;

  let sql = `
    SELECT id::text AS id, user_id, type, amount, balance_after, created_at, ticket_id
    FROM wallet_log
    WHERE user_id = ANY($1::text[])
  `;

  if (range.from) {
    sql += ` AND created_at >= $${paramIdx}`;
    params.push(range.from);
    paramIdx += 1;
  }
  if (range.to) {
    sql += ` AND created_at <= $${paramIdx}`;
    params.push(range.to);
    paramIdx += 1;
  }

  sql += ` ORDER BY created_at DESC LIMIT $${paramIdx}`;
  params.push(limit);

  const rows = await dusKaDumQuery<DusWalletSqlRow>(sql, params);
  const normalizedSearch = options.search?.trim().toLowerCase();
  const typeFilter = options.types?.length ? new Set(options.types) : null;

  return rows
    .map((row) => {
      const username = options.usernameByUserId.get(row.user_id) || '';
      const mappedType = mapDusWalletType(row.type);
      const mapped: DusTransactionRow = {
        id: row.id,
        userId: row.user_id,
        username,
        type: mappedType,
        amount: Math.abs(toNumber(row.amount)),
        balanceAfter: toNumber(row.balance_after),
        createdAt: row.created_at,
        description: dusWalletDescription(row.type, row.ticket_id),
      };
      return mapped;
    })
    .filter((row) => !typeFilter || typeFilter.has(row.type))
    .filter((row) => {
      if (!normalizedSearch) return true;
      const hay = [row.username, row.type, row.description].join(' ').toLowerCase();
      return hay.includes(normalizedSearch);
    });
}

export async function fetchDusAdminGameAggregate(options: {
  dateFilter?: ReportYmdRange;
}): Promise<{ totalBetPoint: number; totalWonPoint: number } | null> {
  if (!isDusKaDumDbConfigured()) return null;

  const range = buildCreatedAtRange(options.dateFilter);
  const params: unknown[] = [];
  let paramIdx = 1;

  let sql = `
    SELECT
      COALESCE(SUM(pb.total_bet), 0) AS total_bet_point,
      COALESCE(SUM(pb.win_amount), 0) AS total_won_point
    FROM player_bets pb
    WHERE pb.canceled = false
  `;

  if (range.from) {
    sql += ` AND pb.created_at >= $${paramIdx}`;
    params.push(range.from);
    paramIdx += 1;
  }
  if (range.to) {
    sql += ` AND pb.created_at <= $${paramIdx}`;
    params.push(range.to);
    paramIdx += 1;
  }

  const rows = await dusKaDumQuery<DusGameAggSqlRow>(sql, params);
  const row = rows[0];
  if (!row) return { totalBetPoint: 0, totalWonPoint: 0 };
  return {
    totalBetPoint: toNumber(row.total_bet_point),
    totalWonPoint: toNumber(row.total_won_point),
  };
}
