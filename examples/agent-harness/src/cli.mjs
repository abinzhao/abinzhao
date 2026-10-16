import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { createScope, createProvider, createTools, openSession, runAgent } from './index.mjs';
import { startWeb } from './web.mjs';

const argv = process.argv.slice(2);
if (argv.includes('--help')) {
  console.log(`Local Harness — Node.js >=22
MODEL=qwen3:4b node src/cli.mjs "阅读 guide.md 并引用路径"
MODEL=qwen3:4b node src/cli.mjs --web

MODEL       Installed Ollama model supporting tool calls
MODEL_URL   Loopback OpenAI-compatible endpoint (default http://127.0.0.1:11434/v1)
WORKSPACE   Read-only source directory (default example workspace)
SESSION_ID  Session name; reuse it to continue completed history
DATA_DIR    Local private session directory (default .harness in current directory)
--web       Serve the local browser UI at http://127.0.0.1:8787`);
} else {
  const scope = createScope();
  const controller = new AbortController();
  const interrupt = () => controller.abort();
  process.once('SIGINT', interrupt);
  let server;
  let activeRun = Promise.resolve();
  try {
    await scope.mount(async (ctx) => ctx.provide('provider', createProvider({
      model: process.env.MODEL ?? 'qwen3:4b', baseURL: process.env.MODEL_URL,
    })));
    await scope.mount(async (ctx) => ctx.provide('tools', createTools(
      process.env.WORKSPACE ?? fileURLToPath(new URL('../workspace/', import.meta.url)),
    )));
    await scope.mount(async (ctx) => ctx.provide('session', await openSession(
      resolve(process.env.DATA_DIR ?? '.harness'), process.env.SESSION_ID ?? 'default',
    )));
    const run = (prompt, { signal, emit }) => {
      activeRun = runAgent({
        provider: scope.get('provider'), tools: scope.get('tools'), session: scope.get('session'),
        prompt, signal: AbortSignal.any([controller.signal, signal]), emit,
      });
      return activeRun;
    };
    if (argv[0] === '--web') {
      if (argv.length !== 1) throw new Error('--web does not accept a prompt');
      server = await startWeb({ run });
      console.log('Local Harness: http://127.0.0.1:8787');
      await new Promise((done) => {
        controller.signal.addEventListener('abort', () => {
          server.closeAllConnections();
          server.close(done);
        }, { once: true });
        if (controller.signal.aborted) {
          server.closeAllConnections();
          server.close(done);
        }
      });
      await activeRun.catch(() => {});
    } else {
      await run(argv.join(' '), {
        signal: AbortSignal.timeout(90_000),
        emit(event) {
          if (event.type === 'text.delta') process.stdout.write(event.text);
          else process.stderr.write(`${JSON.stringify(event)}\n`);
        },
      });
      process.stdout.write('\n');
    }
  } catch (error) {
    console.error(controller.signal.aborted ? 'Run cancelled' : error.message);
    process.exitCode = controller.signal.aborted ? 130 : 1;
  } finally {
    process.removeListener('SIGINT', interrupt);
    await scope.dispose();
  }
}
