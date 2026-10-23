import { buildApp } from './app.js';
import { createPool } from './db.js';

const origin = process.env.APP_ORIGIN ?? 'http://127.0.0.1:5173';
const production = process.env.NODE_ENV === 'production';
if (production && !origin.startsWith('https://')) throw new Error('Production APP_ORIGIN must use HTTPS');
const port = Number(process.env.PORT ?? 3000);
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Invalid PORT');
const pool = createPool();
const app = await buildApp(pool, { origin, secureCookie: production });
let closing = false;
async function close() {
  if (closing) return;
  closing = true;
  const deadline = setTimeout(() => process.exit(1), 10000).unref();
  try {
    await app.close();
    await pool.end();
  } catch {
    process.exitCode = 1;
  } finally { clearTimeout(deadline); }
}
process.once('SIGINT', close);
process.once('SIGTERM', close);
try {
  await app.listen({ host: process.env.HOST ?? '127.0.0.1', port });
  console.info(`API listening on port ${port}`);
} catch {
  await close();
  process.exitCode = 1;
}
