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

const supabaseAuthStorageKey = (() => {
  const url = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || '';
  try {
    const ref = new URL(url).hostname.split('.')[0];
    return ref ? `sb-${ref}-auth-token` : null;
  } catch {
    return null;
  }
})();

const supabaseAuthUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || '';
const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY || '';

const createSupabasePasswordSession = async (email, password) => {
  if (!supabaseAuthUrl || !supabaseAnonKey || !email || !password) return null;
  const response = await fetch(`${supabaseAuthUrl}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: {
      apikey: supabaseAnonKey,
      authorization: `Bearer ${supabaseAnonKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ email, password }),
  }).catch(() => null);
  if (!response?.ok) return null;
  return response.json().catch(() => null);
};

const buildSupabaseStoredSession = (payload) => ({
  access_token: payload.access_token,
  token_type: payload.token_type || 'bearer',
  expires_in: payload.expires_in,
  expires_at: payload.expires_at || Math.floor(Date.now() / 1000) + (payload.expires_in || 3600),
  refresh_token: payload.refresh_token,
  user: payload.user,
});

const setSupabaseSession = ({ key, session }) => {
  Object.keys(localStorage).forEach(existingKey => {
    if (existingKey.startsWith('sb-') && existingKey.endsWith('-auth-token') && existingKey !== key) {
      localStorage.removeItem(existingKey);
    }
  });
  localStorage.setItem(key, JSON.stringify(session));
};

const installSupabaseSession = async (page, authPayload) => {
  if (!supabaseAuthStorageKey || !authPayload?.access_token || !authPayload?.refresh_token) return false;
  const session = buildSupabaseStoredSession(authPayload);
  const payload = { key: supabaseAuthStorageKey, session };
  await page.context().addInitScript(setSupabaseSession, payload);
  await page.evaluate(setSupabaseSession, payload).catch(() => null);
  return true;
};

const persistSupabaseSessionIfNeeded = async (page, authPayload) => {
  if (!supabaseAuthStorageKey || !authPayload?.access_token || !authPayload?.refresh_token) return;
  await page.evaluate(({ key, payload }) => {
    localStorage.setItem(key, JSON.stringify({
      access_token: payload.access_token,
      token_type: payload.token_type || 'bearer',
      expires_in: payload.expires_in,
      expires_at: payload.expires_at || Math.floor(Date.now() / 1000) + (payload.expires_in || 3600),
      refresh_token: payload.refresh_token,
      user: payload.user,
    }));
  }, { key: supabaseAuthStorageKey, payload: authPayload });
};

export const navItem = (page, name) => page.getByRole('link', { name, exact: true })
  .or(page.getByRole('button', { name, exact: true }))
  .first();

const waitForVisible = async (locator, timeout = 12000) => {
  await locator.waitFor({ state: 'visible', timeout });
  return true;
};

const isSignedInShellVisible = async (page, timeout = 12000) => Promise.any([
  waitForVisible(navItem(page, 'Dashboard'), timeout),
  waitForVisible(page.locator('.brief-overlay, .brief-paper, .mobile-topbar, .dashboard-page').first(), timeout),
  waitForVisible(page.getByRole('button', { name: 'User settings' }), timeout),
]).then(() => true).catch(() => false);

const finishLoginIfSignedIn = async (page, timeout = 12000) => {
  if (await isSignedInShellVisible(page, timeout)) {
    await dismissDailyBrief(page);
    await dismissGuidance(page);
    return true;
  }
  if (await waitForVisible(page.locator('.brief-overlay'), 500).catch(() => false)) {
    await dismissDailyBrief(page);
    if (await isSignedInShellVisible(page, 2500)) {
      await dismissGuidance(page);
      return true;
    }
  }
  return false;
};

export const login = async (page, email, password) => {
  const authPayload = await createSupabasePasswordSession(email, password);
  if (authPayload?.access_token && await installSupabaseSession(page, authPayload)) {
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    if (await finishLoginIfSignedIn(page, 25000)) return;
  }

  const fillStable = async (locator, value) => {
    for (let attempt = 0; attempt < 8; attempt += 1) {
      await locator.fill(value);
      await page.waitForTimeout(250);
      if (await locator.inputValue().then(current => current === value).catch(() => false)) return;
    }
    await expect(locator).toHaveValue(value);
  };

  for (let attempt = 0; attempt < 3; attempt += 1) {
    await page.goto('/');
    if (await finishLoginIfSignedIn(page, 15000)) return;
    await expect(page.getByText('Objective Management Platform')).toBeVisible();
    await page.waitForTimeout(1000);
    const emailInput = page.locator('input[placeholder="you@sandpro.com"]').filter({ visible: true }).first();
    const passwordInput = page.locator('input[placeholder="Min 6 characters"]').filter({ visible: true }).first();
    await expect(emailInput).toBeEditable();
    await expect(passwordInput).toBeEditable();
    await fillStable(emailInput, email);
    await fillStable(passwordInput, password);
    const authResponse = page.waitForResponse(response => (
      response.url().includes('/auth/v1/token') && response.request().method() === 'POST'
    ), { timeout: 8000 }).catch(() => null);
    await page.locator('form button[type="submit"]').filter({ visible: true }).first().click();
    const authResult = await authResponse;
    const authPayload = authResult?.ok?.() ? await authResult.json().catch(() => null) : null;
    if (await isSignedInShellVisible(page, 12000)) {
      if (!(await installSupabaseSession(page, authPayload))) {
        await persistSupabaseSessionIfNeeded(page, authPayload);
      }
      await page.waitForFunction(() => (
        Object.keys(localStorage).some(key => key.startsWith('sb-') && key.endsWith('-auth-token'))
      ), null, { timeout: 5000 }).catch(() => null);
      break;
    }
    if (attempt === 2) await expect(navItem(page, 'Dashboard')).toBeVisible();
    await page.context().clearCookies();
    await page.evaluate(() => {
      localStorage.clear();
      sessionStorage.clear();
    }).catch(() => {});
  }
  await dismissDailyBrief(page);
  await dismissGuidance(page);
};

export const dismissDailyBrief = async (page) => {
  const overlay = page.locator('.brief-overlay');
  if (await waitForVisible(overlay, 2500).catch(() => false)) {
    const closeButton = page.locator('.brief-close');
    if (await waitForVisible(closeButton, 500).catch(() => false)) {
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
