const { test, expect } = require('@playwright/test');

const pages = [
  ['accueil', '/index.html'],
  ['connexion', '/login.html'],
  ['inscription', '/signup.html'],
  ['covoiturage', '/covoiturage.html'],
  ['livraison', '/livraison.html'],
  ['confidentialité', '/confidentialite.html'],
  ['conditions', '/cgu.html'],
];

for (const [name, url] of pages) {
  test(`${name} charge sans erreur HTTP`, async ({ page }) => {
    const response = await page.goto(url, { waitUntil: 'domcontentloaded' });
    expect(response?.ok(), `${url} doit répondre avec succès`).toBeTruthy();
    await expect(page.locator('html')).toHaveAttribute('lang', /fr/i);
    await expect(page).toHaveTitle(/Porte/i);
  });
}

test('connexion expose les champs essentiels', async ({ page }) => {
  await page.goto('/login.html');
  await expect(page.locator('input[type="email"]')).toBeVisible();
  await expect(page.locator('input[type="password"]')).toBeVisible();
  await expect(page.locator('button[type="submit"]').first()).toBeVisible();
});

test('inscription expose les champs essentiels et les mentions légales', async ({ page }) => {
  await page.goto('/signup.html');
  await expect(page.locator('input[type="email"]')).toBeVisible();
  await expect(page.locator('input[type="password"]')).toBeVisible();
  await expect(page.locator('a[href="/cgu.html"]')).toBeVisible();
  await expect(page.locator('a[href="/confidentialite.html"]').first()).toBeVisible();
});
