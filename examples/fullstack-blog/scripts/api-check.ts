import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import { buildApp } from '../api/app.js';

const pool = new Pool({ connectionString: process.env.DATABASE_URL, connectionTimeoutMillis: 3000 });
const app = await buildApp(pool, { origin: 'http://127.0.0.1:5173', secureCookie: false });
const origin = 'http://127.0.0.1:5173';
const tenantIds: string[] = [];
const userIds: string[] = [];
try {
  await app.ready();
  assert.equal((await app.inject('/health/live')).statusCode, 200);
  assert.equal((await app.inject('/api/session')).json().user, null);
  assert.equal((await app.inject({
    method: 'POST', url: '/api/register', payload: {}, headers: { origin: 'https://attacker.invalid' },
  })).statusCode, 403);
  const signup = async () => {
    const slug = `verify-${randomUUID()}`;
    const result = await app.inject({
      method: 'POST', url: '/api/register', headers: { origin },
      payload: { email: `${slug}@example.org`, password: 'Learning-only-password-42!', tenantSlug: slug, tenantName: 'Verification' },
    });
    assert.equal(result.statusCode, 201, result.body);
    const session = result.json();
    userIds.push(session.user.id);
    tenantIds.push(session.tenants[0].id);
    const setCookie = result.headers['set-cookie'];
    assert.equal(typeof setCookie, 'string');
    const cookie = String(setCookie).split(';')[0]!;
    assert.match(String(setCookie), /HttpOnly/i);
    return { session, cookie, slug };
  };
  const a = await signup();
  const b = await signup();
  const route = `/api/tenants/${a.session.tenants[0].id}/posts`;
  const headers = { origin, cookie: a.cookie, 'x-csrf-token': a.session.csrfToken };
  const unsafeLogout = await app.inject({ method: 'POST', url: '/api/logout?x=1', headers: { origin, cookie: a.cookie } });
  assert.equal(unsafeLogout.statusCode, 403, 'query strings must not bypass logout CSRF');
  assert.equal(unsafeLogout.json().code, 'CSRF_DENIED');
  for (let count = 0; count < 11; count++) {
    const attempt = await app.inject({
      method: 'POST', url: `/api/login?attempt=${count}`, remoteAddress: '198.51.100.23',
      headers: { origin }, payload: { email: a.session.user.email, password: 'Wrong-learning-password!' },
    });
    assert.equal(attempt.statusCode, count < 10 ? 401 : 429, 'query strings must not bypass login limits');
    if (count === 10) assert.equal(attempt.json().code, 'RATE_LIMITED');
  }
  assert.equal((await app.inject({ method: 'POST', url: route, headers: { origin, cookie: a.cookie }, payload: {} })).statusCode, 403);
  assert.equal((await app.inject({ url: route, headers: { cookie: b.cookie } })).statusCode, 404);
  assert.equal((await app.inject({ method: 'POST', url: route, headers, payload: { slug: 'first', title: '   ', summary: '', body: 'text' } })).statusCode, 400);
  const created = await app.inject({
    method: 'POST', url: route, headers,
    payload: { slug: 'first', title: 'First post', summary: 'Summary', body: '<script>not HTML</script>' },
  });
  assert.equal(created.statusCode, 201, created.body);
  const post = created.json();
  assert.equal((await app.inject(`/api/public/${a.slug}/posts/first`)).statusCode, 404);
  assert.equal((await app.inject({
    method: 'PATCH', url: `${route}/${post.id}`, headers,
    payload: { revision: post.revision, title: 'Edited', summary: '', body: 'Persisted body' },
  })).statusCode, 200);
  assert.equal((await app.inject({
    method: 'PATCH', url: `${route}/${post.id}`, headers,
    payload: { revision: post.revision, title: 'Stale', summary: '', body: 'Do not overwrite' },
  })).statusCode, 409);
  const published = await app.inject({
    method: 'POST', url: `${route}/${post.id}/publish`, headers, payload: { revision: 2 },
  });
  assert.equal(published.statusCode, 200, published.body);
  assert.equal((await app.inject({
    method: 'POST', url: `${route}/${post.id}/publish`, headers, payload: { revision: 2 },
  })).statusCode, 409);
  await pool.query("UPDATE memberships SET role='reader' WHERE tenant_id=$1 AND user_id=$2", [tenantIds[0], userIds[0]]);
  assert.equal((await app.inject({
    method: 'PATCH', url: `${route}/${post.id}`, headers,
    payload: { revision: 3, title: 'Forbidden', summary: '', body: 'Must not write' },
  })).statusCode, 403);
  const publicPost = (await app.inject(`/api/public/${a.slug}/posts/first`)).json();
  assert.equal(publicPost.body, 'Persisted body');
  assert.equal('author_id' in publicPost, false);
  assert.equal((await app.inject({ method: 'POST', url: '/api/logout', headers })).statusCode, 204);
  assert.equal((await app.inject({ url: route, headers: { cookie: a.cookie } })).statusCode, 401);
  assert.equal((await app.inject({
    method: 'POST', url: '/api/login', headers: { origin },
    payload: { email: a.session.user.email, password: 'Wrong-learning-password!' },
  })).statusCode, 401);
  const login = await app.inject({
    method: 'POST', url: '/api/login', headers: { origin },
    payload: { email: a.session.user.email, password: 'Learning-only-password-42!' },
  });
  assert.equal(login.statusCode, 200, login.body);
  assert.equal(login.json().user.id, a.session.user.id);
  const loginCookie = String(login.headers['set-cookie']).split(';')[0]!;
  assert.notEqual(loginCookie, a.cookie);
  assert.equal((await app.inject({ url: route, headers: { cookie: loginCookie } })).statusCode, 200);
  console.info('PASS: real DB registration/password login, query-safe origin/CSRF/rate limit, tenant/role denial, draft privacy, revision/repeat-publish conflict, logout');
} finally {
  await app.close();
  // Delete only records created by this verification run, never clear shared tables.
  for (const id of tenantIds) {
    await pool.query('DELETE FROM posts WHERE tenant_id = $1', [id]);
    await pool.query('DELETE FROM memberships WHERE tenant_id = $1', [id]);
    await pool.query('DELETE FROM tenants WHERE id = $1', [id]);
  }
  for (const id of userIds) {
    await pool.query('DELETE FROM sessions WHERE user_id = $1', [id]);
    await pool.query('DELETE FROM users WHERE id = $1', [id]);
  }
  await pool.end();
}
