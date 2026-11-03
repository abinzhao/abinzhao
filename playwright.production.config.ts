import { defineConfig } from '@playwright/test';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/** 复用真实生产制品，覆盖开发服务器无法验证的分包与 Service Worker。 */
export default defineConfig({
  testDir: './tests/production',
  testMatch: '**/*.prod.ts',
  outputDir: join(tmpdir(), 'abinzhao-production-results'),
  workers: 1,
  timeout: 60_000,
  use: {
    baseURL: 'http://127.0.0.1:5203/abinzhao/',
    screenshot: 'only-on-failure', trace: 'retain-on-failure',
  },
  webServer: {
    command: 'pnpm exec vitepress preview docs --host 127.0.0.1 --port 5203',
    url: 'http://127.0.0.1:5203/abinzhao/', reuseExistingServer: false,
  },
});
