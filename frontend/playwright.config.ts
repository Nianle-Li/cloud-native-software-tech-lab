import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './e2e',
  testMatch: '**/*.e2e.ts',
  timeout: 120_000,
  workers: 1,
  use: {
    baseURL: 'http://127.0.0.1:5173',
    browserName: 'chromium',
    headless: true,
  },
  webServer: [
    {
      command: 'npm run mock:api',
      url: 'http://127.0.0.1:8081/api/venues',
      reuseExistingServer: true,
      timeout: 30_000,
    },
    {
      command: 'npm run dev -- --host 127.0.0.1 --strictPort',
      url: 'http://127.0.0.1:5173/',
      reuseExistingServer: true,
      timeout: 30_000,
    },
  ],
})
