/**
 * Report calendar boundaries (default: Asia/Kolkata).
 * Tickets filter by drawDate (YYYY-MM-DD); wallet/transactions use createdAt in this TZ.
 */

const DEFAULT_REPORT_TIMEZONE = 'Asia/Kolkata';

export type ReportYmdRange = { fromYmd?: string; toYmd?: string };

export function reportTimezone(): string {
  const tz = process.env.REPORT_TIMEZONE?.trim();
  return tz || DEFAULT_REPORT_TIMEZONE;
}

export function isValidYmd(ymd: string): boolean {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd);
  if (!m) return false;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  if (!Number.isFinite(y) || !Number.isFinite(mo) || !Number.isFinite(d)) return false;
  const dt = new Date(y, mo - 1, d);
  return dt.getFullYear() === y && dt.getMonth() === mo - 1 && dt.getDate() === d;
}

export function parseYmdQueryParam(v: unknown): string | undefined {
  if (v === undefined || v === null) return undefined;
  const s = String(v).trim();
  return isValidYmd(s) ? s : undefined;
}

export function ymdFromQueryParam(v: unknown): string | undefined {
  const direct = parseYmdQueryParam(v);
  if (direct) return direct;

  if (v === undefined || v === null) return undefined;
  const s = String(v).trim();
  if (!s) return undefined;

  const datePrefix = /^(\d{4}-\d{2}-\d{2})/.exec(s);
  if (datePrefix && isValidYmd(datePrefix[1])) {
    return datePrefix[1];
  }

  const normalized = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(s) ? s.replace(' ', 'T') : s;
  const parsed = new Date(normalized);
  if (Number.isNaN(parsed.getTime())) return undefined;
  return formatUtcAsYmdInReportTz(parsed);
}

export function parseReportYmdRange(query: Record<string, unknown>): ReportYmdRange | undefined {
  const fromYmd =
    ymdFromQueryParam(query.from_date) ??
    ymdFromQueryParam(query.fromDate) ??
    ymdFromQueryParam(query.startDate);
  const toYmd =
    ymdFromQueryParam(query.to_date) ??
    ymdFromQueryParam(query.toDate) ??
    ymdFromQueryParam(query.endDate);
  if (!fromYmd && !toYmd) return undefined;
  return { fromYmd, toYmd };
}

export function formatUtcAsYmdInReportTz(utc: Date): string {
  const tz = reportTimezone();
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(utc);
  const y = parts.find((p) => p.type === 'year')?.value ?? '0000';
  const m = parts.find((p) => p.type === 'month')?.value ?? '01';
  const d = parts.find((p) => p.type === 'day')?.value ?? '01';
  return `${y}-${m}-${d}`;
}

type ZonedParts = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
};

function partsInTimeZone(utc: Date, timeZone: string): ZonedParts {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: 'numeric',
    minute: 'numeric',
    second: 'numeric',
    hour12: false,
  });
  const map: Record<string, string> = {};
  for (const p of fmt.formatToParts(utc)) {
    if (p.type !== 'literal') map[p.type] = p.value;
  }
  return {
    year: Number(map.year),
    month: Number(map.month),
    day: Number(map.day),
    hour: Number(map.hour === '24' ? '0' : map.hour),
    minute: Number(map.minute),
    second: Number(map.second),
  };
}

function zonedBoundaryUtc(
  ymd: string,
  hour: number,
  minute: number,
  second: number,
  ms: number,
  timeZone: string,
): Date {
  const [y, mo, d] = ymd.split('-').map(Number);
  let t = Date.UTC(y, mo - 1, d, hour, minute, second, ms);
  for (let i = 0; i < 4; i++) {
    const p = partsInTimeZone(new Date(t), timeZone);
    const diffMinutes =
      (y - p.year) * 525600 +
      (mo - p.month) * 43200 +
      (d - p.day) * 1440 +
      (hour - p.hour) * 60 +
      (minute - p.minute) +
      (second - p.second) / 60;
    if (diffMinutes === 0) break;
    t += diffMinutes * 60 * 1000;
  }
  return new Date(t);
}

export function reportDayStartUtc(ymd: string): Date {
  const tz = reportTimezone();
  if (tz === 'Asia/Kolkata' || tz === 'Asia/Calcutta') {
    return new Date(`${ymd}T00:00:00+05:30`);
  }
  return zonedBoundaryUtc(ymd, 0, 0, 0, 0, tz);
}

export function reportDayEndUtc(ymd: string): Date {
  const tz = reportTimezone();
  if (tz === 'Asia/Kolkata' || tz === 'Asia/Calcutta') {
    return new Date(`${ymd}T23:59:59.999+05:30`);
  }
  return zonedBoundaryUtc(ymd, 23, 59, 59, 999, tz);
}

const pad2 = (n: number) => String(n).padStart(2, '0');

/** Same calendar day as YYYY-MM-DD, formats used in game clients (Account_panel._parseTicketDate). */
export function drawDateVariantsForYmd(ymd: string): string[] {
  const [y, mo, d] = ymd.split('-').map(Number);
  if (!Number.isFinite(y) || !Number.isFinite(mo) || !Number.isFinite(d)) return [ymd];
  const iso = `${y}-${pad2(mo)}-${pad2(d)}`;
  const dmy = `${pad2(d)}-${pad2(mo)}-${y}`;
  return [...new Set([iso, dmy])];
}

function listYmdDaysInclusive(fromYmd: string, toYmd: string): string[] {
  const [fy, fmo, fd] = fromYmd.split('-').map(Number);
  const [ty, tmo, td] = toYmd.split('-').map(Number);
  const days: string[] = [];
  const cursor = new Date(fy, fmo - 1, fd);
  const end = new Date(ty, tmo - 1, td);
  while (cursor.getTime() <= end.getTime()) {
    days.push(
      `${cursor.getFullYear()}-${pad2(cursor.getMonth() + 1)}-${pad2(cursor.getDate())}`,
    );
    cursor.setDate(cursor.getDate() + 1);
  }
  return days;
}

/**
 * Match tickets by drawDate using all string formats the desktop app understands.
 * Lexicographic $gte/$lte fails for DD-MM-YYYY values in Mongo.
 */
export function buildDrawDateFilter(range?: ReportYmdRange): Record<string, unknown> | undefined {
  if (!range?.fromYmd && !range?.toYmd) return undefined;

  const fromYmd = range.fromYmd ?? range.toYmd!;
  const toYmd = range.toYmd ?? range.fromYmd!;
  const days = listYmdDaysInclusive(fromYmd, toYmd);
  const variants = new Set<string>();
  for (const day of days) {
    for (const v of drawDateVariantsForYmd(day)) variants.add(v);
  }
  if (variants.size === 0) return undefined;
  return { drawDate: { $in: [...variants] } };
}

export function buildCreatedAtMatch(range?: ReportYmdRange): Record<string, Date> | undefined {
  if (!range?.fromYmd && !range?.toYmd) return undefined;
  const clause: Record<string, Date> = {};
  if (range.fromYmd) clause.$gte = reportDayStartUtc(range.fromYmd);
  if (range.toYmd) clause.$lte = reportDayEndUtc(range.toYmd);
  return clause;
}
