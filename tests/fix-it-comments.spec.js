import { expect, test } from '@playwright/test';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { dismissGuidance, env, login, requireCredentials } from './helpers.js';

test.describe('Fix-It item comments', () => {
  test('users can reply to one Fix-It card and attach files to that reply', async ({ page }) => {
    requireCredentials(env.e2eEmail, env.e2ePassword, 'SANDPRO_E2E_EMAIL and SANDPRO_E2E_PASSWORD');

    const token = Date.now();
    const postBody = `Fix-It QA Comment Thread ${token}`;
    const replyBody = `QA reply for Tim import clarification ${token}`;
    const uploadDir = mkdtempSync(join(tmpdir(), 'sandpro-fixit-comment-'));
    const uploadPath = join(uploadDir, `fixit-comment-${token}.txt`);
    writeFileSync(uploadPath, 'Temporary Fix-It comment attachment validation.');

    await login(page, env.e2eEmail, env.e2ePassword);
    await page.goto('/?page=fixit');
    await expect(page.locator('aside.admin-sidebar-fixit')).toBeVisible();
    await dismissGuidance(page);

    await page.locator('.fixit-composer textarea').fill(postBody);
    await page.locator('.fixit-composer').getByRole('button', { name: /Post/i }).click();

    const card = page.locator('.fixit-post').filter({ hasText: postBody }).first();
    await expect(card).toBeVisible();

    await card.locator('.fixit-comment-textarea').fill(replyBody);
    await card.locator('.fixit-comment-composer input[type="file"]').setInputFiles(uploadPath);
    await expect(card.locator('.fixit-comment-files')).toContainText(`fixit-comment-${token}.txt`);
    await card.locator('.fixit-comment-composer').getByRole('button', { name: /Reply/i }).click();

    await expect(card.getByText('Task comments')).toBeVisible();
    await expect(card).toContainText(replyBody);
    await expect(card).toContainText(`fixit-comment-${token}.txt`);

    await card.getByTitle('Delete item').click();
    await expect(page.locator('.fixit-post').filter({ hasText: postBody })).toHaveCount(0);
  });
});
