import { defineConfig } from '@playwright/test';

const host = '127.0.0.1';
const port = 5176;
const baseURL = `http://${host}:${port}/abinzhao/`;

export default defineConfig({
  testDir: './tests/e2e',
  testMatch: '**/*.e2e.ts',
  fullyParallel: false,
  timeout: 30_000,
  use: {
    baseURL,
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },
  webServer: {
    command: `pnpm dev --host ${host} --port ${port}`,
    reuseExistingServer: false,
    timeout: 30_000,
    url: baseURL,
  },
});
