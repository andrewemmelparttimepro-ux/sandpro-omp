import { expect, test } from '@playwright/test';

test.describe('PWA installability and cache safety', () => {
  test('manifest exposes standalone app metadata and reusable icon', async ({ page }) => {
    const response = await page.goto('/manifest.webmanifest');
    expect(response?.ok()).toBeTruthy();
    const manifest = JSON.parse(await response.text());
    expect(manifest.name).toBe('SandPro OMP');
    expect(manifest.short_name).toBe('SandPro');
    expect(manifest.display).toBe('standalone');
    expect(manifest.start_url).toBe('/?source=pwa');
    expect(manifest.orientation).toBe('portrait-primary');
    expect(manifest.icons.some((icon) => icon.src === '/pwa/sandpro-omp-icon-192-v2.png' && icon.purpose.includes('maskable'))).toBeTruthy();
    expect(manifest.icons.some((icon) => icon.src === '/pwa/sandpro-omp-icon-512-v2.png' && icon.purpose.includes('maskable'))).toBeTruthy();
    expect(manifest.shortcuts.map((shortcut) => shortcut.url)).toEqual(expect.arrayContaining(['/?page=objectives', '/?page=fixit', '/?page=ncr']));
  });

  test('service worker is network-first, online-safe, and has a clear offline fallback', async ({ page }) => {
    const response = await page.goto('/sw.js');
    const sw = await response.text();
    expect(sw).toContain('CACHE_NAME');
    expect(sw).not.toContain("CACHE_NAME = 'sandpro-omp-shell-v1'");
    expect(sw).toContain("CACHE_NAME = 'sandpro-omp-shell-v10'");
    expect(sw).toContain('fetch(request)');
    expect(sw).toContain('OFFLINE_HTML');
    expect(sw).toContain('supabase.co');
    expect(sw).toContain('/api/');
    expect(sw).toContain("addEventListener('push'");
    expect(sw).toContain("addEventListener('notificationclick'");
    expect(sw).toContain('showNotification');
  });

  test('iPhone install metadata is present in the app shell', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('link[rel="apple-touch-icon"][href="/pwa/sandpro-omp-apple-touch-icon-v2.png"]')).toHaveCount(1);
    await expect(page.locator('meta[name="viewport"]')).toHaveAttribute('content', /viewport-fit=cover/);
    await expect(page.locator('meta[name="apple-mobile-web-app-title"]')).toHaveAttribute('content', 'SandPro');
  });

  test('app registers service worker on localhost without blanking the shell', async ({ page, browserName }, testInfo) => {
    test.skip(browserName !== 'chromium' || testInfo.project.name !== 'chromium', 'Service worker registration check is desktop Chromium-only.');
    await page.goto('/');
    await expect(page.getByText('Objective Management Platform')).toBeVisible();
    let ready = false;
    for (let attempt = 0; attempt < 3 && !ready; attempt += 1) {
      try {
        await page.waitForLoadState('load', { timeout: 10000 }).catch(() => {});
        await expect(page.getByText('Objective Management Platform')).toBeVisible({ timeout: 15000 });
        ready = await page.evaluate(async () => {
          if (!('serviceWorker' in navigator)) return false;
          const timeout = new Promise(resolve => {
            window.setTimeout(() => resolve(false), 10000);
          });
          const serviceWorkerReady = navigator.serviceWorker.ready.then(registration => Boolean(registration?.active));
          return Promise.race([serviceWorkerReady, timeout]);
        });
      } catch (error) {
        if (!/Execution context was destroyed|navigation/i.test(String(error))) throw error;
      }
    }
    expect(ready).toBeTruthy();
  });
});
