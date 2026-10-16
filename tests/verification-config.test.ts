import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { describe, expect, test } from 'vitest';
import { parse } from 'yaml';

const projectRoot = resolve(import.meta.dirname, '..');

describe('verification configuration', () => {
  test('provides one local command for the complete release gate', async () => {
    const packageJson = JSON.parse(
      await readFile(resolve(projectRoot, 'package.json'), 'utf8'),
    ) as { scripts?: Record<string, string> };

    expect(packageJson.scripts?.verify).toBe(
      'pnpm check && pnpm test && pnpm test:e2e && pnpm build',
    );
  });

  test('runs type, unit, browser and build gates before Pages deployment', async () => {
    const workflow = await readFile(
      resolve(projectRoot, '.github/workflows/deploy-pages.yml'),
      'utf8',
    );

    const commands = [
      'pnpm check',
      'pnpm test',
      'pnpm exec playwright install --with-deps chromium',
      'pnpm test:e2e',
      'pnpm build',
    ];
    let previousIndex = -1;
    for (const command of commands) {
      const index = workflow.indexOf(command);
      expect(index).toBeGreaterThan(previousIndex);
      previousIndex = index;
    }
  });

  test('checks pull requests with read-only permissions and no publishing job', async () => {
    const workflow = parse(await readFile(resolve(projectRoot, '.github/workflows/check-pr.yml'), 'utf8'));
    expect(workflow.on).toEqual({ pull_request: { branches: ['master'] } });
    expect(workflow.permissions).toEqual({ contents: 'read' });
    expect(Object.keys(workflow.jobs)).toEqual(['verify']);
    const steps = workflow.jobs.verify.steps.map((step: { run?: string }) => step.run).filter(Boolean);
    expect(steps).toEqual(['pnpm install --frozen-lockfile', 'pnpm check', 'pnpm test', 'pnpm exec playwright install --with-deps chromium', 'pnpm test:e2e', 'pnpm build']);
  });
});
