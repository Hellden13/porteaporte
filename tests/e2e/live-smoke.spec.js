const { test, expect } = require('@playwright/test');

test.skip(!process.env.E2E_BASE_URL, 'Ces contrôles ciblent uniquement un déploiement réel.');

test('production répond et conserve les protections HTTP', async ({ request }) => {
  const response = await request.get('/');
  expect(response.ok()).toBeTruthy();
  expect(response.headers()['strict-transport-security']).toContain('max-age=');
  expect(response.headers()['content-security-policy']).toContain("default-src 'self'");
  expect(response.headers()['x-content-type-options']).toBe('nosniff');
  expect(response.headers()['x-frame-options']).toBe('DENY');
});

test('le cron de production refuse un appel anonyme', async ({ request }) => {
  const response = await request.get('/api/cron-cleanup');
  expect(response.status()).toBe(401);
});
