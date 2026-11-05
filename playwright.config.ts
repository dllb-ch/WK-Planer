import { defineConfig } from '@playwright/test';

// Runs against the built client served by the API on a throwaway database.
export default defineConfig({
  testDir: 'e2e',
  timeout: 30_000,
  use: { baseURL: 'http://localhost:3101', viewport: { width: 1400, height: 900 } },
  webServer: {
    command: 'npm run build && rm -rf e2e/.tmp && API_PORT=3101 PGLITE_DIR=e2e/.tmp/pglite SEED_DEMO=1 npm start',
    url: 'http://localhost:3101/api/auth/me',
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
