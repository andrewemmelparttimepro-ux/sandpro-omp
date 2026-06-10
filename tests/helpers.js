import { expect, test } from '@playwright/test';
import './env-loader.js';

export const env = {
  baseUrl: process.env.SANDPRO_BASE_URL || process.env.SANDPRO_SMOKE_BASE_URL || 'http://127.0.0.1:5173',
  smokeAdminEmail: process.env.SANDPRO_SMOKE_ADMIN_EMAIL || process.env.SANDPRO_JAKE_EMAIL,
  smokeAdminPassword: process.env.SANDPRO_SMOKE_ADMIN_PASSWORD || process.env.SANDPRO_JAKE_PASSWORD,
  smokeMemberEmail: process.env.SANDPRO_SMOKE_MEMBER_EMAIL || process.env.SANDPRO_MERCI_EMAIL,
  smokeMemberPassword: process.env.SANDPRO_SMOKE_MEMBER_PASSWORD || process.env.SANDPRO_MERCI_PASSWORD,
  jakeEmail: process.env.SANDPRO_JAKE_EMAIL,
  jakePassword: process.env.SANDPRO_JAKE_PASSWORD,
  merciEmail: process.env.SANDPRO_MERCI_EMAIL,
  merciPassword: process.env.SANDPRO_MERCI_PASSWORD,
  e2eEmail: process.env.SANDPRO_E2E_EMAIL || process.env.SANDPRO_SMOKE_ADMIN_EMAIL || process.env.SANDPRO_JAKE_EMAIL,
  e2ePassword: process.env.SANDPRO_E2E_PASSWORD || process.env.SANDPRO_SMOKE_ADMIN_PASSWORD || process.env.SANDPRO_JAKE_PASSWORD,
  e2eMentionEmail: process.env.SANDPRO_E2E_MENTION_EMAIL,
  e2eMentionPassword: process.env.SANDPRO_E2E_MENTION_PASSWORD,
  allowMutation: process.env.SANDPRO_E2E_ALLOW_MUTATION === '1',
  agentE2e: process.env.SANDPRO_AGENT_E2E === '1',
  aiOwnerE2e: process.env.SANDPRO_AI_OWNER_E2E === '1',
};

export const requireCredentials = (email, password, label = 'credentials') => {
  test.skip(!email || !password, `Set ${label} environment variables to run this credentialed check.`);
};

export const navItem = (page, name) => page.getByRole('link', { name, exact: true })
  .or(page.getByRole('button', { name, exact: true }))
  .first();

export const login = async (page, email, password) => {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    await page.goto('/');
    await expect(page.getByText('Objective Management Platform')).toBeVisible();
    await page.getByPlaceholder('you@sandpro.com').fill(email);
    await page.getByPlaceholder('Min 6 characters').fill(password);
    await page.locator('form').getByRole('button', { name: 'Sign In' }).click();
    if (await navItem(page, 'Dashboard').isVisible({ timeout: 12000 }).catch(() => false)) break;
    if (attempt === 1) await expect(navItem(page, 'Dashboard')).toBeVisible();
    await page.context().clearCookies();
  }
  await dismissDailyBrief(page);
  await dismissGuidance(page);
};

export const dismissDailyBrief = async (page) => {
  const overlay = page.locator('.brief-overlay');
  if (await overlay.isVisible({ timeout: 2500 }).catch(() => false)) {
    const closeButton = page.locator('.brief-close');
    if (await closeButton.isVisible().catch(() => false)) {
      await closeButton.click({ force: true });
    } else {
      await page.keyboard.press('Escape');
    }
    await expect(overlay).toHaveCount(0);
  }
};

export const dismissGuidance = async (page) => {
  await dismissDailyBrief(page);

  const featureAnnouncement = page.locator('.new-feature-close');
  if (await featureAnnouncement.isVisible({ timeout: 1000 }).catch(() => false)) {
    await featureAnnouncement.click({ force: true });
  }

  for (let i = 0; i < 4; i += 1) {
    const closeButton = page.locator('.feature-help-close').first();
    if (!(await closeButton.isVisible({ timeout: 500 }).catch(() => false))) break;
    await closeButton.click();
  }
};

export const signOutIfPossible = async (page) => {
  const userMenu = page.locator('header').getByText(/executive|manager|contributor/i).first();
  if (await userMenu.isVisible().catch(() => false)) {
    await userMenu.click();
    await page.getByRole('button', { name: /Sign Out/i }).click();
  }
};

export const objectiveResult = (page, title) => (
  page.locator('tbody tr, .objectives-grid .card, .kanban-card')
    .filter({ hasText: title })
    .first()
);

export const openObjectiveByTitle = async (page, title) => {
  await dismissGuidance(page);
  const button = page.getByRole('button', { name: `Open objective: ${title}` });
  await button.scrollIntoViewIfNeeded();
  await button.click();
};

export const assertNoMobileCrop = async (page, label = 'mobile screen') => {
  const failures = await page.evaluate(() => {
    const viewportWidth = window.visualViewport?.width || window.innerWidth;
    const viewportHeight = window.visualViewport?.height || window.innerHeight;
    const selectors = [
      'body',
      '#root',
      '.layout',
      '.main-content',
      '.mobile-topbar',
      '.mobile-nav',
      '.mobile-new-fab',
      '.new-feature-popover',
      '.modal-content',
      '.objective-form-modal',
      '.objective-detail-modal',
      '.mobile-objective-card',
      '.card',
      '.fixit-post',
      '.fixit-composer',
      '.ncr-mobile-card',
      '.org-mobile-person',
      'input',
      'textarea',
      'select',
      'button',
      'a',
    ];
    const visible = (el) => {
      const style = window.getComputedStyle(el);
      const rect = el.getBoundingClientRect();
      return style.display !== 'none' && style.visibility !== 'hidden' && Number(style.opacity) !== 0 && rect.width > 0 && rect.height > 0;
    };
    const result = [];
    for (const el of document.querySelectorAll(selectors.join(','))) {
      if (!visible(el)) continue;
      const rect = el.getBoundingClientRect();
      const tag = el.getAttribute('data-testid') || el.getAttribute('aria-label') || el.textContent?.trim()?.slice(0, 48) || el.className || el.tagName;
      if (rect.left < -2 || rect.right > viewportWidth + 2) {
        result.push(`${tag}: left=${rect.left.toFixed(1)} right=${rect.right.toFixed(1)} viewport=${viewportWidth.toFixed(1)}`);
      }
      if (rect.top < -2 && !el.closest('.mobile-sheet-overlay')) {
        result.push(`${tag}: top=${rect.top.toFixed(1)} viewport=${viewportHeight.toFixed(1)}`);
      }
    }
    const docOverflow = Math.max(
      document.documentElement.scrollWidth - viewportWidth,
      document.body.scrollWidth - viewportWidth,
    );
    if (docOverflow > 2) result.push(`document horizontal overflow=${docOverflow.toFixed(1)} viewport=${viewportWidth.toFixed(1)}`);
    return result.slice(0, 20);
  });
  expect(failures, `${label} has clipped mobile content`).toEqual([]);
};
