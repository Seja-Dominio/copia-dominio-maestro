import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/module-isolation',
  fullyParallel: false,
  workers: 1,
  reporter: 'list',
  use: {
    ...devices['Desktop Chrome'],
    baseURL: 'http://127.0.0.1:4180',
  },
  webServer: {
    command: 'npm run dev -- --host 127.0.0.1 --port 4180 --strictPort',
    url: 'http://127.0.0.1:4180/tests/module-isolation/index.html',
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
});
