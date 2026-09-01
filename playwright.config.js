const { defineConfig, devices } = require('@playwright/test');

const liveBaseUrl = process.env.E2E_BASE_URL;

module.exports = defineConfig({
  testDir: './tests/e2e',
  timeout: 30_000,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: liveBaseUrl || 'http://127.0.0.1:4173',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'chromium-desktop', use: { ...devices['Desktop Chrome'] } },
    { name: 'mobile-safari', use: { ...devices['iPhone 13'] } },
  ],
  webServer: liveBaseUrl ? undefined : {
    command: 'node tests/e2e/static-server.js',
    url: 'http://127.0.0.1:4173',
    reuseExistingServer: !process.env.CI,
  },
});
