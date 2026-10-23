import { defineConfig } from '@playwright/test';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const host = '127.0.0.1';
const port = 5176;
const baseURL = `http://${host}:${port}/abinzhao/`;

export default defineConfig({
  testDir: './tests/e2e',
  testMatch: '**/*.e2e.ts',
  outputDir: process.env.CI ? 'test-results' : join(tmpdir(), 'abinzhao-playwright-results'),
  fullyParallel: false,
  // 用例共用一个开发服务；串行冷启动避免索引变换与动效争用主机资源。
  workers: 1,
  timeout: 30_000,
  use: {
    baseURL,
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },
  webServer: {
    command: `pnpm exec vitepress dev docs --host ${host} --port ${port} --strictPort`,
    reuseExistingServer: false,
    timeout: 30_000,
    url: baseURL,
  },
});
