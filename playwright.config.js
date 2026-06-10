import { defineConfig, devices } from '@playwright/test';
import './tests/env-loader.js';

const hasExternalBaseUrl = Boolean(process.env.SANDPRO_BASE_URL || process.env.SANDPRO_SMOKE_BASE_URL);
const localPort = process.env.SANDPRO_E2E_PORT || '5199';
const localBaseUrl = `http://127.0.0.1:${localPort}`;

export default defineConfig({
  testDir: './tests',
  timeout: 45_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: process.env.SANDPRO_BASE_URL || process.env.SANDPRO_SMOKE_BASE_URL || localBaseUrl,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'mobile-chrome', use: { ...devices['Pixel 7'] } },
  ],
  webServer: hasExternalBaseUrl ? undefined : {
    command: `npm run dev -- --host 127.0.0.1 --port ${localPort} --strictPort`,
    url: localBaseUrl,
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
