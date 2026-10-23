import { execFile, execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { promisify } from 'node:util';
import { afterEach, expect, test } from 'vitest';

const roots: string[] = [];
const script = resolve('scripts/verify-site.mjs');
const execFileAsync = promisify(execFile);
afterEach(() => roots.splice(0).forEach((root) => rmSync(root, { recursive: true, force: true })));

function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'abin-audit-'));
  roots.push(root);
  mkdirSync(join(root, 'guide'));
  writeFileSync(join(root, 'index.html'), '<h1>Home</h1><a href="/abinzhao/guide/#setup">Guide</a>');
  writeFileSync(join(root, 'guide/index.html'), '<h1 id="setup">Setup</h1><a href="../">Home</a>');
  writeFileSync(join(root, 'release.json'), JSON.stringify({ base: '/abinzhao/', sha: 'fixture' }));
  return root;
}

test('accepts a real static site with valid directory links and anchors', () => {
  expect(existsSync(script), 'site link validation must be implemented').toBe(true);
  const output = execFileSync(process.execPath, [script, '--dist', fixture()], { encoding: 'utf8' });
  expect(output).toContain('2 pages');
});

test('rejects a missing page instead of allowing a successful build to hide it', () => {
  expect(existsSync(script), 'site link validation must be implemented').toBe(true);
  const root = fixture();
  writeFileSync(join(root, 'guide/index.html'), '<a href="/abinzhao/missing.html">Missing</a>');
  expect(() => execFileSync(process.execPath, [script, '--dist', root], { stdio: 'pipe' })).toThrow();
});

test('rejects a broken anchor and checks referenced static assets', () => {
  expect(existsSync(script), 'site link validation must be implemented').toBe(true);
  const root = fixture();
  writeFileSync(join(root, 'guide/index.html'), '<h1 id="other">Setup</h1>');
  expect(() => execFileSync(process.execPath, [script, '--dist', root], { stdio: 'pipe' })).toThrow();
  writeFileSync(join(root, 'guide/index.html'), '<h1 data-id="setup">Setup</h1>');
  expect(() => execFileSync(process.execPath, [script, '--dist', root], { stdio: 'pipe' })).toThrow();
  writeFileSync(join(root, 'guide/index.html'), '<h1 id="setup">Setup</h1><script src="/abinzhao/assets/missing.js"></script>');
  expect(() => execFileSync(process.execPath, [script, '--dist', root], { stdio: 'pipe' })).toThrow();
});

test('checks lazy assets in the offline manifest even when no HTML preloads them', () => {
  const root = fixture();
  writeFileSync(join(root, 'assistant-assets.json'), JSON.stringify({
    base: '/abinzhao/', groups: { site: ['/abinzhao/lazy-corpus.js'], modelRuntime: [] },
  }));
  expect(() => execFileSync(process.execPath, [script, '--dist', root], { stdio: 'pipe' })).toThrow();
  writeFileSync(join(root, 'lazy-corpus.js'), 'export const corpus = {};');
  expect(execFileSync(process.execPath, [script, '--dist', root], { encoding: 'utf8' }))
    .toContain('2 pages');
});

test('verifies the live revision and refuses old HTTP 200 pages before auditing their links', async () => {
  const root = fixture();
  let deployedSha = 'fixture';
  let pageRequests = 0;
  const server = createServer((request, response) => {
    const path = new URL(request.url!, 'http://localhost').pathname.slice('/abinzhao/'.length);
    if (path === 'release.json') {
      response.end(JSON.stringify({ base: '/abinzhao/', sha: deployedSha }));
    } else {
      pageRequests++;
      response.end(readFileSync(join(root, path.endsWith('/') || !path ? `${path}index.html` : path)));
    }
  });
  await new Promise<void>((done) => server.listen(0, '127.0.0.1', done));
  try {
    const address = server.address() as { port: number };
    const args = [script, '--dist', root, '--url', `http://127.0.0.1:${address.port}/abinzhao/`, '--expected-sha', 'fixture'];
    const success = await execFileAsync(process.execPath, args);
    expect(success.stdout).toContain('2 pages');
    expect(pageRequests).toBeGreaterThan(0);
    deployedSha = 'previous-release';
    pageRequests = 0;
    const failure = await execFileAsync(process.execPath, args).catch((error) => error);
    expect(failure.code).toBe(1);
    expect(failure.stderr).toContain('Deployed revision does not match this build');
    expect(pageRequests).toBe(0);
  } finally {
    await new Promise<void>((done, reject) => server.close((error) => error ? reject(error) : done()));
  }
}, 15_000);

test('rejects changed live HTML even when the release SHA and page titles match', async () => {
  const root = fixture();
  writeFileSync(join(root, 'index.html'), '<title>Home</title><h1>Home</h1><a href="/abinzhao/guide/#setup">Guide</a>');
  writeFileSync(join(root, 'guide/index.html'), '<title>Guide</title><h1 id="setup">Setup</h1><a href="../">Home</a>');
  const server = createServer((request, response) => {
    const path = new URL(request.url!, 'http://localhost').pathname.slice('/abinzhao/'.length);
    if (path === 'guide/index.html') {
      response.end('<title>Guide</title><h1 id="wrong-anchor">Setup</h1><a href="/abinzhao/missing.html">Missing</a>');
    } else {
      response.end(readFileSync(join(root, path.endsWith('/') || !path ? `${path}index.html` : path)));
    }
  });
  await new Promise<void>((done) => server.listen(0, '127.0.0.1', done));
  try {
    const address = server.address() as { port: number };
    const failure = await execFileAsync(process.execPath, [
      script, '--dist', root, '--url', `http://127.0.0.1:${address.port}/abinzhao/`, '--expected-sha', 'fixture',
    ]).catch((error) => error);
    expect(failure.code).toBe(1);
    expect(failure.stderr).toContain('Deployed HTML differs from the build');
  } finally {
    await new Promise<void>((done, reject) => server.close((error) => error ? reject(error) : done()));
  }
}, 15_000);
