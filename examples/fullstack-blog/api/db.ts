import { Pool, type PoolClient } from 'pg';

export function createPool(): Pool {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required');
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    max: 10, connectionTimeoutMillis: 3000, idleTimeoutMillis: 30000,
    statement_timeout: 10000,
  });
  pool.on('error', () => console.error('DB_POOL_ERROR'));
  return pool;
}

export async function transaction<T>(pool: Pool, work: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  let discard = false;
  try {
    await client.query('BEGIN');
    const result = await work(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    try { await client.query('ROLLBACK'); } catch (rollbackError) {
      discard = true;
      throw new AggregateError([error, rollbackError], 'Transaction and rollback failed');
    }
    throw error;
  } finally {
    client.release(discard);
  }
}
