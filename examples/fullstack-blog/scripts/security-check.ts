import assert from 'node:assert/strict';
import { hashPassword, verifyPassword, sessionDigest, csrfFor, sameToken } from '../api/security.js';

const password = 'Learning-only-password-42!';
const hash = await hashPassword(password);
assert.notEqual(hash, password);
assert.equal(await verifyPassword(password, hash), true, 'correct password must verify');
assert.equal(await verifyPassword('not-the-password', hash), false);
assert.equal(await verifyPassword(password, 'broken'), false);
assert.notEqual(await hashPassword(password), hash, 'each hash must have an independent salt');
assert.equal(sessionDigest('a'.repeat(43)).length, 64);
assert.notEqual(csrfFor('a'.repeat(43)), csrfFor('b'.repeat(43)));
assert.equal(sameToken('token', 'token'), true);
assert.equal(sameToken('token', 'tok'), false);
assert.equal(sameToken('token', undefined), false);
console.info('PASS: password salt/verification, session digest, CSRF comparison');
