import { defineConfig } from '@playwright/test'

const baseURL = process.env.LAB2_BASE_URL
if (!baseURL || !/^https?:\/\//.test(baseURL)) {
  throw new Error('运行真实集群浏览器回归前，须设置 LAB2_BASE_URL 为前端 port-forward 地址')
}

export default defineConfig({
  testDir: './e2e',
  testMatch: '**/cluster.e2e.ts',
  timeout: 120_000,
  workers: 1,
  use: {
    baseURL,
    browserName: 'chromium',
    headless: true,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
})
