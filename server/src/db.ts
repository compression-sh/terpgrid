import pg from 'pg';

export type Db = pg.Pool;
export type Tx = pg.PoolClient;

export function createPool(url: string, max = 10): Db {
  const pool = new pg.Pool({ connectionString: url, max, idleTimeoutMillis: 30_000, connectionTimeoutMillis: 5_000, statement_timeout: 15_000 });
  pool.on('error', () => {
    /* Verbindungsfehler werden bei der nächsten Abfrage gemeldet */
  });
  return pool;
}

export async function tx<T>(db: Db, fn: (c: Tx) => Promise<T>): Promise<T> {
  const c = await db.connect();
  try {
    await c.query('BEGIN');
    const r = await fn(c);
    await c.query('COMMIT');
    return r;
  } catch (e) {
    await c.query('ROLLBACK').catch(() => {});
    throw e;
  } finally {
    c.release();
  }
}

/**
 * Transaktion im Kontext eines Benutzers: setzt `app.user_id` lokal, sodass die
 * Row-Level-Security-Policies greifen. Zusätzlich filtern alle Abfragen selbst
 * nach user_id (Defense in Depth).
 */
export async function withUser<T>(db: Db, userId: string, fn: (c: Tx) => Promise<T>): Promise<T> {
  return tx(db, async (c) => {
    await c.query("SELECT set_config('app.user_id', $1, true)", [userId]);
    return fn(c);
  });
}
