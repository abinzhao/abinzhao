import { readdir, readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { createPool } from './db.js';

const pool = createPool();
try {
  const client = await pool.connect();
  let discard = false;
  try {
    await client.query("SET lock_timeout = '5s'");
    await client.query('SELECT pg_advisory_lock($1)', [741001]);
    await client.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
      name text PRIMARY KEY, checksum text NOT NULL, applied_at timestamptz NOT NULL DEFAULT now()
    )`);
    const directory = new URL('../migrations/', import.meta.url);
    const names = (await readdir(directory)).filter(name => /^\d{3}_[a-z0-9_]+\.sql$/.test(name)).sort();
    for (const name of names) {
      const sql = await readFile(new URL(name, directory), 'utf8');
      const checksum = createHash('sha256').update(sql).digest('hex');
      const previous = await client.query<{ checksum: string }>('SELECT checksum FROM schema_migrations WHERE name=$1', [name]);
      if (previous.rows[0]) {
        if (previous.rows[0].checksum !== checksum) throw new Error(`Applied migration changed: ${name}`);
        continue;
      }
      await client.query('BEGIN');
      try {
        await client.query("SET LOCAL statement_timeout = '30s'");
        await client.query(sql);
        await client.query('INSERT INTO schema_migrations(name,checksum) VALUES($1,$2)', [name, checksum]);
        await client.query('COMMIT');
        console.info(`Applied ${name}`);
      } catch (error) {
        try { await client.query('ROLLBACK'); } catch (rollbackError) {
          discard = true;
          throw new AggregateError([error, rollbackError], 'Migration and rollback failed');
        }
        throw error;
      }
    }
  } finally {
    if (!discard) {
      try { await client.query('SELECT pg_advisory_unlock($1)', [741001]); } catch { discard = true; }
    }
    client.release(discard);
  }
} finally { await pool.end(); }
