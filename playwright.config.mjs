import {defineConfig} from '@playwright/test';

export default defineConfig({
  testDir: './test/browser',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 45_000,
  expect: {timeout: 8_000},
  use: {
    baseURL: 'http://127.0.0.1:5340',
    headless: true,
    trace: 'retain-on-failure',
    launchOptions: {args: ['--use-gl=swiftshader']},
  },
  webServer: [
    {
      command: 'node test/browser/mock-llm.mjs',
      url: 'http://127.0.0.1:18081/health',
      reuseExistingServer: false,
      timeout: 20_000,
    },
    {
      command: 'npm run dev -- --host 127.0.0.1 --port 5340',
      url: 'http://127.0.0.1:5340',
      reuseExistingServer: false,
      timeout: 30_000,
    },
  ],
});
