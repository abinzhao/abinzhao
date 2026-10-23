import Fastify, { type FastifyReply, type FastifyRequest } from 'fastify';
import cookie from '@fastify/cookie';
import { randomBytes, randomUUID } from 'node:crypto';
import type { Pool, PoolClient } from 'pg';
import { transaction } from './db.js';
import { hashPassword, verifyPassword, sessionDigest, csrfFor, sameToken } from './security.js';

class AppError extends Error {
  constructor(public statusCode: number, public code: string, message: string) { super(message); }
}
type Session = { user: { id: string; email: string }; csrfToken: string };
type TenantParams = { tenantId: string; id: string };
type Draft = { slug: string; title: string; summary: string; body: string };
type Edit = Omit<Draft, 'slug'> & { revision: number };
const text = (maxLength: number) => ({ type: 'string', minLength: 1, maxLength });
const slugSchema = { ...text(80), pattern: '^[a-z0-9]+(-[a-z0-9]+)*$' };
const uuidSchema = { type: 'string', pattern: '^[a-fA-F0-9]{8}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{12}$' };
const revisionSchema = { type: 'integer', minimum: 1, maximum: 2147483646 };
const contentProperties = { title: { ...text(120), pattern: '\\S' }, summary: { type: 'string', maxLength: 240 }, body: { ...text(100000), pattern: '\\S' } };
const object = (properties: Record<string, unknown>, required = Object.keys(properties)) =>
  ({ type: 'object', additionalProperties: false, required, properties });
const columns = 'id, slug, title, summary, body, status, revision, published_at';

export async function buildApp(pool: Pool, options: { origin: string; secureCookie: boolean }) {
  if (new URL(options.origin).origin !== options.origin) throw new Error('APP_ORIGIN must be an exact origin');
  const app = Fastify({
    bodyLimit: 512 * 1024, genReqId: () => randomUUID(), trustProxy: false,
    ajv: { customOptions: { removeAdditional: false, coerceTypes: false } },
    logger: false,
  });
  await app.register(cookie);
  const cookieName = options.secureCookie ? '__Host-blog-session' : 'blog-session';
  const cookieOptions = { path: '/', httpOnly: true, secure: options.secureCookie, sameSite: 'lax' as const };
  const dummyHash = await hashPassword(randomBytes(32).toString('hex'));
  const attempts = new Map<string, { count: number; expires: number }>();
  let passwordJobs = 0;

  async function passwordWork<T>(work: () => Promise<T>) {
    if (passwordJobs >= 2) throw new AppError(503, 'AUTH_BUSY', 'Authentication is busy; retry later');
    passwordJobs++;
    try { return await work(); } finally { passwordJobs--; }
  }
  function limitLogin(ip: string) {
    const now = Date.now();
    for (const [key, value] of attempts) if (value.expires <= now) attempts.delete(key);
    const entry = attempts.get(ip) ?? { count: 0, expires: now + 60000 };
    if (!attempts.has(ip) && attempts.size >= 10000) throw new AppError(503, 'AUTH_BUSY', 'Retry later');
    entry.count++;
    attempts.set(ip, entry);
    if (entry.count > 10) throw new AppError(429, 'RATE_LIMITED', 'Retry after one minute');
  }
  async function session(request: FastifyRequest): Promise<Session | null> {
    const token = request.cookies[cookieName];
    if (!token || !/^[a-zA-Z0-9_-]{43}$/.test(token)) return null;
    const found = await pool.query<{ id: string; email: string }>(
      `SELECT u.id, u.email_norm AS email FROM sessions s JOIN users u ON u.id=s.user_id
       WHERE s.token_hash=$1 AND s.expires_at > now()`, [sessionDigest(token)],
    );
    const user = found.rows[0];
    return user ? { user, csrfToken: csrfFor(token) } : null;
  }
  async function requireSession(request: FastifyRequest) {
    const value = await session(request);
    if (!value) throw new AppError(401, 'AUTH_REQUIRED', 'Sign in first');
    return value;
  }
  async function tenantList(userId: string) {
    return (await pool.query(
      `SELECT t.id,t.slug,t.name,m.role FROM tenants t JOIN memberships m ON m.tenant_id=t.id
       WHERE m.user_id=$1 ORDER BY t.slug`, [userId],
    )).rows;
  }
  async function authorize(db: Pool | PoolClient, userId: string, tenantId: string, write: boolean) {
    const found = await db.query<{ role: string }>(
      `SELECT role FROM memberships WHERE user_id=$1 AND tenant_id=$2${write ? ' FOR SHARE' : ''}`, [userId, tenantId],
    );
    if (!found.rows[0]) throw new AppError(404, 'NOT_FOUND', 'Resource not found');
    if (write && !['owner', 'editor'].includes(found.rows[0].role)) throw new AppError(403, 'FORBIDDEN', 'Read-only membership');
  }
  async function issueSession(db: PoolClient, userId: string, request: FastifyRequest) {
    const old = request.cookies[cookieName];
    if (old) await db.query('DELETE FROM sessions WHERE token_hash=$1', [sessionDigest(old)]);
    const token = randomBytes(32).toString('base64url');
    await db.query(`INSERT INTO sessions(token_hash,user_id,expires_at) VALUES($1,$2,now()+interval '7 days')`, [sessionDigest(token), userId]);
    return token;
  }
  function setSession(reply: FastifyReply, token: string) {
    reply.setCookie(cookieName, token, { ...cookieOptions, maxAge: 7 * 86400 });
  }
  app.addHook('onRequest', async request => {
    if (!['POST', 'PATCH', 'PUT', 'DELETE'].includes(request.method)) return;
    if (request.headers.origin !== options.origin) throw new AppError(403, 'ORIGIN_DENIED', 'Untrusted origin');
    const pathname = new URL(request.url, options.origin).pathname;
    if (pathname.startsWith('/api/tenants/') || pathname === '/api/logout') {
      const value = await requireSession(request);
      if (!sameToken(value.csrfToken, request.headers['x-csrf-token'])) throw new AppError(403, 'CSRF_DENIED', 'Invalid CSRF token');
    }
    if (pathname === '/api/register' || pathname === '/api/login') limitLogin(request.ip);
  });
  app.addHook('onSend', async (_request, reply) => {
    reply.header('Cache-Control', 'no-store').header('X-Content-Type-Options', 'nosniff');
  });
  app.setErrorHandler((error, request, reply) => {
    if (error instanceof AppError) return reply.code(error.statusCode).send({ code: error.code, message: error.message, requestId: request.id });
    const detail = typeof error === 'object' && error !== null
      ? error as { validation?: unknown; statusCode?: unknown; constraint?: unknown; code?: unknown } : {};
    if (detail.validation || detail.statusCode === 400) return reply.code(400).send({ code: 'INVALID_INPUT', message: 'Invalid request', requestId: request.id });
    if (detail.code === '23505' && ['users_email_norm_key', 'tenants_slug_key', 'posts_tenant_slug_key'].includes(String(detail.constraint))) {
      return reply.code(409).send({ code: 'CONFLICT', message: 'Email or address already used', requestId: request.id });
    }
    console.error(JSON.stringify({ code: 'INTERNAL_ERROR', requestId: request.id }));
    return reply.code(detail.statusCode === 413 ? 413 : 500).send({ code: 'INTERNAL_ERROR', message: 'Request failed', requestId: request.id });
  });
  app.setNotFoundHandler((request, reply) => reply.code(404).send({ code: 'NOT_FOUND', message: 'Resource not found', requestId: request.id }));
  app.get('/health/live', async () => ({ status: 'alive' }));
  app.get('/health/ready', async (_request, reply) => {
    try { await pool.query('SELECT 1'); return { status: 'ready' }; }
    catch { return reply.code(503).send({ status: 'not-ready' }); }
  });
  app.get('/api/session', async request => {
    const value = await session(request);
    return value ? { ...value, tenants: await tenantList(value.user.id) } : { user: null, csrfToken: null, tenants: [] };
  });
  const credentials = { email: { ...text(254), pattern: '^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$' }, password: { type: 'string', minLength: 15, maxLength: 128 } };
  app.post<{ Body: { email: string; password: string; tenantSlug: string; tenantName: string } }>('/api/register', {
    schema: { body: object({ ...credentials, tenantSlug: slugSchema, tenantName: { ...text(120), pattern: '\\S' } }) },
  }, async (request, reply) => {
    const input = request.body;
    const hash = await passwordWork(() => hashPassword(input.password));
    const result = await transaction(pool, async db => {
      const user = (await db.query<{ id: string; email: string }>(
        'INSERT INTO users(email_norm,password_hash) VALUES($1,$2) RETURNING id,email_norm AS email', [input.email.toLowerCase(), hash],
      )).rows[0]!;
      const tenant = (await db.query(
        'INSERT INTO tenants(slug,name) VALUES($1,$2) RETURNING id,slug,name', [input.tenantSlug, input.tenantName.trim()],
      )).rows[0]!;
      await db.query("INSERT INTO memberships(tenant_id,user_id,role) VALUES($1,$2,'owner')", [tenant.id, user.id]);
      return { user, tenant: { ...tenant, role: 'owner' }, token: await issueSession(db, user.id, request) };
    });
    setSession(reply, result.token);
    return reply.code(201).send({ user: result.user, csrfToken: csrfFor(result.token), tenants: [result.tenant] });
  });
  app.post<{ Body: { email: string; password: string } }>('/api/login', { schema: { body: object(credentials) } }, async (request, reply) => {
    const user = (await pool.query<{ id: string; email: string; password_hash: string | null }>(
      'SELECT id,email_norm AS email,password_hash FROM users WHERE email_norm=$1', [request.body.email.toLowerCase()],
    )).rows[0];
    const valid = await passwordWork(() => verifyPassword(request.body.password, user?.password_hash ?? dummyHash));
    if (!user?.password_hash || !valid) throw new AppError(401, 'LOGIN_FAILED', 'Email or password is incorrect');
    const token = await transaction(pool, db => issueSession(db, user.id, request));
    setSession(reply, token);
    return { user: { id: user.id, email: user.email }, csrfToken: csrfFor(token), tenants: await tenantList(user.id) };
  });
  app.post('/api/logout', async (request, reply) => {
    await pool.query('DELETE FROM sessions WHERE token_hash=$1', [sessionDigest(request.cookies[cookieName]!)]);
    reply.clearCookie(cookieName, cookieOptions);
    return reply.code(204).send();
  });
  const tenantParams = object({ tenantId: uuidSchema });
  const postParams = object({ tenantId: uuidSchema, id: uuidSchema });
  app.get<{ Params: TenantParams }>('/api/tenants/:tenantId/posts', { schema: { params: tenantParams } }, async request => {
    const value = await requireSession(request);
    await authorize(pool, value.user.id, request.params.tenantId, false);
    return { items: (await pool.query(`SELECT ${columns} FROM posts WHERE tenant_id=$1 ORDER BY updated_at DESC,id DESC LIMIT 100`, [request.params.tenantId])).rows };
  });
  app.post<{ Params: TenantParams; Body: Draft }>('/api/tenants/:tenantId/posts', {
    schema: { params: tenantParams, body: object({ slug: slugSchema, ...contentProperties }) },
  }, async (request, reply) => {
    const value = await requireSession(request);
    const post = await transaction(pool, async db => {
      await authorize(db, value.user.id, request.params.tenantId, true);
      const { slug, title, summary, body } = request.body;
      return (await db.query(
        `INSERT INTO posts(tenant_id,author_id,slug,title,summary,body) VALUES($1,$2,$3,$4,$5,$6) RETURNING ${columns}`,
        [request.params.tenantId, value.user.id, slug, title.trim(), summary, body],
      )).rows[0];
    });
    return reply.code(201).send(post);
  });
  async function ensureResource(db: PoolClient, tenantId: string, id: string) {
    if (!(await db.query('SELECT 1 FROM posts WHERE tenant_id=$1 AND id=$2', [tenantId, id])).rowCount) throw new AppError(404, 'NOT_FOUND', 'Resource not found');
  }
  app.patch<{ Params: TenantParams; Body: Edit }>('/api/tenants/:tenantId/posts/:id', {
    schema: { params: postParams, body: object({ revision: revisionSchema, ...contentProperties }) },
  }, async request => {
    const value = await requireSession(request);
    return transaction(pool, async db => {
      const { tenantId, id } = request.params;
      await authorize(db, value.user.id, tenantId, true);
      await ensureResource(db, tenantId, id);
      const { revision, title, summary, body } = request.body;
      const post = (await db.query(
        `UPDATE posts SET title=$4,summary=$5,body=$6,revision=revision+1,updated_at=now()
         WHERE tenant_id=$1 AND id=$2 AND revision=$3 RETURNING ${columns}`, [tenantId, id, revision, title.trim(), summary, body],
      )).rows[0];
      if (!post) throw new AppError(409, 'REVISION_CONFLICT', 'Reload the current version before merging');
      return post;
    });
  });
  app.post<{ Params: TenantParams; Body: { revision: number } }>('/api/tenants/:tenantId/posts/:id/publish', {
    schema: { params: postParams, body: object({ revision: revisionSchema }) },
  }, async request => {
    const value = await requireSession(request);
    return transaction(pool, async db => {
      const { tenantId, id } = request.params;
      await authorize(db, value.user.id, tenantId, true);
      await ensureResource(db, tenantId, id);
      const post = (await db.query(
        `UPDATE posts SET status='published',published_at=COALESCE(published_at,now()),revision=revision+1,updated_at=now()
         WHERE tenant_id=$1 AND id=$2 AND revision=$3 AND status='draft' RETURNING ${columns}`, [tenantId, id, request.body.revision],
      )).rows[0];
      if (!post) throw new AppError(409, 'REVISION_CONFLICT', 'Already published or revision changed');
      return post;
    });
  });
  app.get<{ Params: { tenantSlug: string } }>('/api/public/:tenantSlug/posts', {
    schema: { params: object({ tenantSlug: slugSchema }) },
  }, async request => ({ items: (await pool.query(
    `SELECT p.id,p.slug,p.title,p.summary,p.published_at FROM posts p JOIN tenants t ON t.id=p.tenant_id
     WHERE t.slug=$1 AND p.status='published' ORDER BY p.published_at DESC,p.id DESC LIMIT 50`, [request.params.tenantSlug],
  )).rows }));
  app.get<{ Params: { tenantSlug: string; slug: string } }>('/api/public/:tenantSlug/posts/:slug', {
    schema: { params: object({ tenantSlug: slugSchema, slug: slugSchema }) },
  }, async request => {
    const post = (await pool.query(
      `SELECT p.id,p.slug,p.title,p.summary,p.body,p.published_at FROM posts p JOIN tenants t ON t.id=p.tenant_id
       WHERE t.slug=$1 AND p.slug=$2 AND p.status='published'`, [request.params.tenantSlug, request.params.slug],
    )).rows[0];
    if (!post) throw new AppError(404, 'NOT_FOUND', 'Resource not found');
    return post;
  });
  return app;
}
