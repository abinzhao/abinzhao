import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

test('CLI --help exits without contacting any model', async () => {
  const result = await new Promise((resolve) => {
    const child = spawn(process.execPath, [fileURLToPath(new URL('../src/cli.mjs', import.meta.url)), '--help']);
    let stdout = '';
    child.stdout.on('data', (data) => { stdout += data; });
    child.on('exit', (code) => resolve({ code, stdout }));
  });
  assert.equal(result.code, 0, 'The CLI entrypoint is missing');
  assert.match(result.stdout, /--web/);
  assert.match(result.stdout, /MODEL/);
});

test('a missing workspace is a rejected tool operation, never an unhandled rejection', async () => {
  const entry = new URL('../src/tools.mjs', import.meta.url).href;
  const result = await new Promise((resolve) => {
    const child = spawn(process.execPath, ['--input-type=module', '-e', `
      import { createTools } from ${JSON.stringify(entry)};
      const tools = createTools('/nonexistent-harness-workspace-test');
      await new Promise((done) => setTimeout(done, 30));
      try { await tools.execute('list_files', {}); }
      catch (error) { console.log('caught', error.code); }
    `]);
    let stdout = '';
    child.stdout.on('data', (data) => { stdout += data; });
    child.on('exit', (code) => resolve({ code, stdout }));
  });
  assert.equal(result.code, 0, 'Workspace lookup must be owned by the executing operation');
  assert.match(result.stdout, /caught ENOENT/);
});
