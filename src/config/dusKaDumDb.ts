import { Pool, type PoolClient, type QueryResultRow } from 'pg';

let pool: Pool | null = null;
let warnedMissingUrl = false;

export function isDusKaDumDbConfigured(): boolean {
  return Boolean(process.env.DUS_KA_DUM_DATABASE_URL?.trim());
}

function getPool(): Pool | null {
  const connectionString = process.env.DUS_KA_DUM_DATABASE_URL?.trim();
  if (!connectionString) {
    if (!warnedMissingUrl) {
      console.warn(
        '[dus-ka-dum] DUS_KA_DUM_DATABASE_URL is not set; dus tickets omitted from reports.',
      );
      warnedMissingUrl = true;
    }
    return null;
  }

  if (!pool) {
    pool = new Pool({
      connectionString,
      max: 5,
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 10_000,
    });
    pool.on('error', (err) => {
      console.error('[dus-ka-dum] unexpected Postgres pool error:', err.message);
    });
  }

  return pool;
}

export async function dusKaDumQuery<T extends QueryResultRow = QueryResultRow>(
  text: string,
  params: unknown[] = [],
): Promise<T[]> {
  const db = getPool();
  if (!db) return [];

  try {
    const result = await db.query<T>(text, params);
    return result.rows;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('[dus-ka-dum] query failed:', message);
    return [];
  }
}

export async function withDusKaDumClient<T>(
  fn: (client: PoolClient) => Promise<T>,
): Promise<T | null> {
  const db = getPool();
  if (!db) return null;
  const client = await db.connect();
  try {
    return await fn(client);
  } finally {
    client.release();
  }
}

export async function closeDusKaDumDb(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = null;
  }
}
