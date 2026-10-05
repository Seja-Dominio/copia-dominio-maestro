import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/authenticated-regressions',
  fullyParallel: false,
  workers: 1,
  reporter: 'list',
  use: {
    ...devices['Desktop Chrome'],
    baseURL: 'http://127.0.0.1:4181',
  },
  webServer: {
    command: 'npm run dev -- --host 127.0.0.1 --port 4181 --strictPort',
    url: 'http://127.0.0.1:4181/login',
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
    env: {
      VITE_SUPABASE_URL: 'https://tqmfuskvllpqmvayjuqu.supabase.co',
      VITE_SUPABASE_ANON_KEY: 'maestro-auth-regression-public-test-key',
      VITE_MAESTRO_ENV: 'test',
      VITE_MAESTRO_AUTH_PROVIDER: 'supabase',
      VITE_MAESTRO_DATA_PROVIDER: 'supabase',
    },
  },
});
