import { expect, test } from '@playwright/test';
import { dismissGuidance, env, login, requireCredentials } from './helpers.js';

const runAltDashboardE2E = process.env.SANDPRO_ALT_DASHBOARD_E2E === '1';

const ensureStandardDashboard = async (page) => {
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await dismissGuidance(page);
  if (await page.locator('.alt-dashboard-view').isVisible().catch(() => false)) {
    await page.getByRole('button', { name: 'Company' }).click();
    await expect(page.locator('.alt-dashboard-view')).toHaveCount(0);
  }
  await dismissGuidance(page);
  await expect(page.locator('.framework-explainer-overlay')).toHaveCount(0);
};

const openAlternativeDashboard = async (page) => {
  await ensureStandardDashboard(page);
  await dismissGuidance(page);
  if (await page.locator('.alt-dashboard-view').isVisible().catch(() => false)) return;
  const altKey = page.locator('.dashboard-alt-mode-key');
  if (await altKey.getAttribute('aria-pressed') !== 'true') {
    await altKey.click();
  }
  await dismissGuidance(page);
  await expect(page.locator('.alt-dashboard-view')).toBeVisible();
};

test.describe('alternative dashboard mode', () => {
  test.describe.configure({ mode: 'serial' });
  test.setTimeout(90_000);
  test.skip(!runAltDashboardE2E, 'Set SANDPRO_ALT_DASHBOARD_E2E=1 to run Alternative dashboard browser coverage.');

  test.beforeEach(async ({ page }) => {
    requireCredentials(env.e2eEmail, env.e2ePassword, 'SANDPRO_E2E_EMAIL/SANDPRO_E2E_PASSWORD or Jake credentials');
    await login(page, env.e2eEmail, env.e2ePassword);
    await dismissGuidance(page);
  });

  test('switches URL mode, persists after reload, and updates time and complete/open lenses', async ({ page }) => {
    await openAlternativeDashboard(page);
    await expect(page).toHaveURL(/dashboard=alternative/);

    await page.reload({ waitUntil: 'domcontentloaded' });
    await dismissGuidance(page);
    await expect(page.locator('.alt-dashboard-view')).toBeVisible();
    await expect(page).toHaveURL(/dashboard=alternative/);
    await page.evaluate(() => {
      window.__altAudioStarts = 0;
      class FakeAudioContext {
        constructor() {
          this.currentTime = 0;
          this.destination = {};
        }
        createOscillator() {
          return {
            type: 'square',
            frequency: { setValueAtTime() {}, exponentialRampToValueAtTime() {} },
            connect() {},
            start() { window.__altAudioStarts += 1; },
            stop() {},
          };
        }
        createGain() {
          return {
            gain: { setValueAtTime() {}, exponentialRampToValueAtTime() {} },
            connect() {},
          };
        }
        close() {}
      }
      window.AudioContext = FakeAudioContext;
      window.webkitAudioContext = FakeAudioContext;
    });
    const soundToggle = page.locator('.alt-sound-toggle');
    if (await soundToggle.getAttribute('aria-pressed') === 'true') {
      await soundToggle.click();
    }
    const audioStarts = () => page.evaluate(() => window.__altAudioStarts || 0);

    await page.locator('.alt-key-button', { hasText: 'Today' }).click();
    expect(await audioStarts()).toBe(0);
    await expect(page.locator('.alt-lens-state')).toContainText('Past due + today');
    const keyBoxes = await page.locator('.alt-key-button').evaluateAll(nodes => nodes.slice(0, 3).map(node => {
      const rect = node.getBoundingClientRect();
      return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
    }));
    expect(keyBoxes).toHaveLength(3);
    expect(Math.abs(keyBoxes[0].x - keyBoxes[1].x)).toBeLessThan(4);
    expect(Math.abs(keyBoxes[1].x - keyBoxes[2].x)).toBeLessThan(4);
    expect(keyBoxes[1].y).toBeGreaterThan(keyBoxes[0].y + keyBoxes[0].height * 0.8);
    expect(keyBoxes[2].y).toBeGreaterThan(keyBoxes[1].y + keyBoxes[1].height * 0.8);
    expect(keyBoxes[0].width).toBeGreaterThanOrEqual(88);
    expect(keyBoxes[0].height).toBeGreaterThanOrEqual(64);
    expect(keyBoxes[0].width / keyBoxes[0].height).toBeGreaterThan(1.25);
    const modeLabels = await page.locator('.alt-co-switch button').evaluateAll(nodes => nodes.map(node => node.textContent.trim()));
    expect(modeLabels).toEqual(['A', 'O', 'C']);
    const modeBoxes = await page.locator('.alt-co-switch button').evaluateAll(nodes => nodes.map(node => {
      const rect = node.getBoundingClientRect();
      return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
    }));
    expect(Math.abs(modeBoxes[0].y - modeBoxes[1].y)).toBeLessThan(4);
    expect(modeBoxes[1].x).toBeGreaterThan(modeBoxes[0].x + modeBoxes[0].width * 0.8);
    expect(modeBoxes[2].x).toBeGreaterThan(modeBoxes[1].x + modeBoxes[1].width * 0.8);
    const muteBox = await soundToggle.boundingBox();
    expect(muteBox.x).toBeGreaterThan(modeBoxes[2].x + modeBoxes[2].width * 0.8);
    expect(Math.abs(muteBox.y - modeBoxes[0].y)).toBeLessThan(6);
    await expect(page.locator('.alt-objective-score')).toHaveCount(0);
    await expect(page.locator('.alt-roster-panel .alt-signal-dot')).toHaveCount(0);
    if (await page.locator('.alt-person-row').count()) {
      await expect(page.locator('.alt-roster-panel .alt-traffic-light').first()).toBeVisible();
    }
    const todayMacro = await page.locator('.alt-macro-gauge').innerText();
    const todayTrendPath = await page.locator('.alt-macro-sparkline polyline').getAttribute('points');
    expect(todayTrendPath).toBeTruthy();
    await soundToggle.click();
    await page.locator('.alt-key-button', { hasText: 'Next 3' }).click();
    const afterKeySound = await audioStarts();
    expect(afterKeySound).toBeGreaterThan(0);
    await expect(page.locator('.alt-stack-head')).toContainText('Next 3');
    await expect(page.locator('.alt-lens-state')).toContainText('Tomorrow - next 3 days');
    await expect(page.locator('.alt-trend-panel')).toContainText('Next 3 trends');
    const next3Macro = await page.locator('.alt-macro-gauge').innerText();
    expect(next3Macro).not.toEqual(todayMacro);

    await page.locator('.alt-co-switch button', { hasText: 'C' }).click();
    await expect(page.locator('.alt-stack-head')).toContainText('Complete');
    await expect(page.locator('.alt-stack-head')).not.toContainText('Compute');
    await expect(page.locator('.alt-stack-head')).not.toContainText('Closed');
    expect(await audioStarts()).toBeGreaterThan(afterKeySound);
    await soundToggle.click();
    const afterMute = await audioStarts();
    await page.locator('.alt-key-button', { hasText: 'This Wk' }).click();
    expect(await audioStarts()).toBe(afterMute);
    await expect(page.locator('.alt-stack-head')).toContainText('This Wk');
    await expect(page.locator('.alt-lens-state')).toContainText('Days 4-7');
    const weekMacro = await page.locator('.alt-macro-gauge').innerText();
    expect(weekMacro).not.toEqual(next3Macro);
    await expect(page.locator('.alt-ps1-card')).toBeVisible();
    await expect(page.locator('.alt-ps2-card')).toBeVisible();
    await expect(page.locator('.alt-ps2-card')).not.toContainText('To-do');
    await page.locator('.alt-notes-launcher').click();
    await expect(page.locator('.alt-notes-window')).toBeVisible();
    await expect(page.locator('.alt-notes-sidebar')).toContainText('All Notes');
    await expect(page.locator('.alt-notes-list-pane')).toBeVisible();
    await expect(page.locator('.alt-notes-editor-pane')).toBeVisible();
    await expect(page.locator('.alt-notes-window-toolbar')).toBeVisible();
    await page.getByRole('button', { name: 'Close Notes' }).click();
    await expect(page.locator('.alt-notes-window')).toHaveCount(0);

    const dockBox = await page.locator('.alt-recents-dock').boundingBox();
    const viewBox = await page.locator('.alt-dashboard-view').boundingBox();
    expect(dockBox.width).toBeGreaterThan(viewBox.width * 0.92);
    await expect(page.locator('.alt-recents-dock-header')).toHaveText('Recent');
    await expect(page.locator('.alt-recents-dock-header')).not.toContainText('operating trail');
    await expect(page.locator('.alt-personal-widgets')).toHaveCount(0);
    await expect(page.locator('.alt-recent-tile')).toHaveCount(5);
    const recentHeaderBoxes = await page.locator('.alt-recents-dock-header').evaluate(node => {
      const header = node.getBoundingClientRect();
      const label = node.querySelector('span').getBoundingClientRect();
      return {
        headerCenter: header.x + header.width / 2,
        labelCenter: label.x + label.width / 2,
      };
    });
    expect(Math.abs(recentHeaderBoxes.headerCenter - recentHeaderBoxes.labelCenter)).toBeLessThan(2);

    await page.locator('.alt-co-switch button', { hasText: 'A' }).click();
    await expect(page.locator('.alt-stack-head')).toContainText('All');
    await page.locator('.alt-co-switch button', { hasText: 'O' }).click();
    await expect(page.locator('.alt-stack-head')).toContainText('Open');
    await expect(page.locator('.alt-roster-panel')).not.toContainText(/touch/i);
  });

  test('mobile alternative layout stacks without horizontal clipping', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/?dashboard=alternative', { waitUntil: 'domcontentloaded' });
    await dismissGuidance(page);
    await expect(page.locator('.alt-dashboard-view')).toBeVisible();
    await expect(page.locator('.alt-key-row')).toBeVisible();
    await expect(page.locator('.alt-recents-dock')).toBeVisible();
    await page.locator('.alt-notes-launcher').click();
    await expect(page.locator('.alt-notes-window')).toBeVisible();
    await expect(page.locator('.alt-notes-window')).toHaveAttribute('data-mobile-pane', /folders|list|editor/);
    await page.getByRole('button', { name: /Objective Links|All Notes|Pinned/ }).first().click();
    await expect(page.locator('.alt-notes-window')).toHaveAttribute('data-mobile-pane', 'list');
    const metrics = await page.evaluate(() => ({
      body: document.body.scrollWidth,
      root: document.documentElement.scrollWidth,
      viewport: window.innerWidth,
    }));
    expect(Math.max(metrics.body, metrics.root)).toBeLessThanOrEqual(metrics.viewport + 2);
  });

  test('PS.2 Notes can create, edit, persist, search, and delete a private note', async ({ page }) => {
    test.skip(!env.allowMutation, 'Set SANDPRO_E2E_ALLOW_MUTATION=1 to run Notes mutation coverage.');
    await openAlternativeDashboard(page);
    await page.locator('.alt-notes-launcher').click();
    await expect(page.locator('.alt-notes-window')).toBeVisible();

    const title = `QA PS.2 note ${Date.now()}`;
    await page.getByRole('button', { name: 'New note' }).last().click();
    await page.getByLabel('Note title').fill(title);
    await page.locator('.alt-notes-editor-prose').click();
    await page.keyboard.type('Checklist autosave proof from Playwright.');
    await expect(page.locator('.alt-notes-save-state')).toContainText(/Saved|Saving/);
    await expect(page.locator('.alt-notes-save-state')).toContainText('Saved', { timeout: 10000 });

    await page.reload({ waitUntil: 'domcontentloaded' });
    await dismissGuidance(page);
    await expect(page.locator('.alt-dashboard-view')).toBeVisible();
    await page.locator('.alt-notes-launcher').click();
    await expect(page.locator('.alt-notes-window')).toBeVisible();
    await page.locator('.alt-notes-search input').fill(title);
    await expect(page.locator('.alt-notes-date-group button', { hasText: title })).toBeVisible();
    await page.locator('.alt-notes-date-group button', { hasText: title }).click();
    await expect(page.getByLabel('Note title')).toHaveValue(title);

    await page.getByRole('button', { name: 'Delete note' }).click();
    await page.getByRole('button', { name: 'Delete forever' }).click();
    await page.locator('.alt-notes-search input').fill(title);
    await expect(page.locator('.alt-notes-date-group button', { hasText: title })).toHaveCount(0);
  });

  test('roster drag can tag an objective without owner reassignment', async ({ page }) => {
    test.skip(!env.allowMutation, 'Set SANDPRO_E2E_ALLOW_MUTATION=1 to run drag-to-tag mutation coverage.');
    await openAlternativeDashboard(page);

    const person = page.locator('.alt-person-row').first();
    const objective = page.locator('.alt-objective-card').first();
    await expect(person).toBeVisible();
    await expect(objective).toBeVisible();
    const ownerBefore = await objective.locator('.alt-objective-meta span').first().innerText();

    await person.dragTo(objective);
    await expect(objective.locator('.alt-objective-meta span').first()).toHaveText(ownerBefore);
  });
});
