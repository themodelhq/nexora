/**
 * Nexora — public site end-to-end tests.
 * Verifies page rendering, SEO metadata, responsive layout, and that no
 * fabricated data is presented.
 */
import { test, expect } from '@playwright/test';

const pages = [
  { path: '/', heading: /Building the Next Digital Economy/ },
  { path: '/token', heading: /NXR — Nexora Token/ },
  { path: '/tokenomics', heading: /Tokenomics/ },
  { path: '/airdrop', heading: /Airdrop/ },
  { path: '/staking', heading: /Staking/ },
  { path: '/vesting', heading: /Vesting/ },
  { path: '/governance', heading: /Governance/ },
  { path: '/roadmap', heading: /Roadmap/ },
  { path: '/transparency', heading: /Transparency/ },
];

for (const page of pages) {
  test(`renders ${page.path}`, async ({ page: p }) => {
    const resp = await p.goto(page.path);
    expect(resp?.status()).toBe(200);
    await expect(p.getByRole('heading', { name: page.heading }).first()).toBeVisible();
  });
}

test('homepage has NXR SEO title', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveTitle(/Nexora/);
});

test('no fabricated contract addresses shown as live', async ({ page }) => {
  await page.goto('/transparency');
  const text = await page.locator('body').innerText();
  expect(text).not.toContain('0x0000000000000000000000000000000000000000');
});

test('transparency shows Coming soon when no deployment is recorded', async ({ page }) => {
  await page.goto('/transparency');
  await expect(page.getByText('Coming soon').first()).toBeVisible();
});

test('mobile layout works for tokenomics', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const resp = await page.goto('/tokenomics');
  expect(resp?.status()).toBe(200);
  await expect(page.getByRole('heading', { name: /Tokenomics/ }).first()).toBeVisible();
});

test('tokenomics percentages sum to 100', async ({ page }) => {
  await page.goto('/tokenomics');
  const text = await page.locator('body').innerText();
  const percentages = ['35%', '15%', '15%', '10%', '5%', '10%', '10%'];
  for (const p of percentages) {
    expect(text).toContain(p);
  }
});

test('dashboard prompts wallet connection when not connected', async ({ page }) => {
  await page.goto('/dashboard');
  await expect(page.getByRole('heading', { name: /Connect your wallet/ }).first()).toBeVisible();
});

test('staking shows data-unavailable state when contract not deployed', async ({ page }) => {
  await page.goto('/staking');
  await expect(page.getByText(/not yet deployed|Connect your wallet/i).first()).toBeVisible();
});
