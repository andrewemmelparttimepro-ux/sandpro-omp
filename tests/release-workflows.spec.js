import { expect, test } from '@playwright/test';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { dismissDailyBrief, dismissGuidance, env, login, navItem, objectiveResult, openObjectiveByTitle, requireCredentials } from './helpers.js';

const dropTextFile = async (page, testId, { name, content, type = 'text/plain' }) => {
  const dataTransfer = await page.evaluateHandle((file) => {
    const transfer = new DataTransfer();
    transfer.items.add(new File([file.content], file.name, { type: file.type }));
    return transfer;
  }, { name, content, type });
  const dropzone = page.getByTestId(testId);
  await dropzone.dispatchEvent('dragenter', { dataTransfer });
  await dropzone.dispatchEvent('dragover', { dataTransfer });
  await dropzone.dispatchEvent('drop', { dataTransfer });
  await dataTransfer.dispose();
};

test.describe('release P0/P1 staging workflows', () => {
  test.beforeEach(async ({ page }) => {
    test.skip(!env.allowMutation, 'Set SANDPRO_E2E_ALLOW_MUTATION=1 for isolated staging release workflows.');
    requireCredentials(env.e2eEmail, env.e2ePassword, 'SANDPRO_E2E_EMAIL and SANDPRO_E2E_PASSWORD');
    await login(page, env.e2eEmail, env.e2ePassword);
  });

  test('messages, file persistence, preview, metrics, subtasks, access, admin test center, and cleanup', async ({ page }) => {
    const title = `Release Gate Objective ${Date.now()}`;
    const due = new Date(Date.now() + 2 * 86400000).toISOString().slice(0, 10);
    const attachmentDir = mkdtempSync(join(tmpdir(), 'sandpro-release-workflow-'));
    const attachmentPath = join(attachmentDir, 'release-note.txt');
    const imageAttachmentPath = join(attachmentDir, 'release-preview.png');
    writeFileSync(attachmentPath, 'release gate attachment');
    writeFileSync(imageAttachmentPath, Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAFgwJ/lk9O3wAAAABJRU5ErkJggg==',
      'base64'
    ));

    await page.getByRole('button', { name: 'New', exact: true }).click();
    await page.getByPlaceholder('What needs to be done?').fill(title);
    await page.getByPlaceholder('Add details...').fill('Release gate validates P0/P1 workflows.');
    await page.locator('input[type="date"]').fill(due);
    await page.getByRole('button', { name: /Create Objective|Delegate Objective/i }).click();
    await expect(page.getByText(/Objective created|Objective delegated/i)).toBeVisible();

    await navItem(page, 'Objectives').click();
    await page.getByPlaceholder('Search objectives...').fill(title);
    await expect(objectiveResult(page, title)).toBeVisible();
	    await openObjectiveByTitle(page, title);
	    await expect(page.getByText(/Objective Assistant/i)).toHaveCount(0);
	    await expect(page.getByRole('button', { name: /Get assistant started/i })).toHaveCount(0);

	    await page.getByRole('button', { name: 'Next Step', exact: true }).click();
	    await expect(page.getByText('Next step tracker', { exact: true })).toBeVisible();
	    await expect(page.getByText('1. Scope', { exact: true })).toBeVisible();
	    await page.getByRole('button', { name: /Mark Scope done/i }).click();
	    await expect(page.getByText(/Workflow updated: Scope/i)).toBeVisible();
	    await expect(page.getByText('2. Plan')).toBeVisible();

	    await page.getByRole('button', { name: 'Messages', exact: true }).click();
    await page.locator('textarea[placeholder^="Type a message"]').fill('Release gate message with attachment');
    await page.locator('input[type="file"]').setInputFiles([attachmentPath, imageAttachmentPath]);
    await expect(page.getByText('release-note.txt')).toBeVisible();
    await expect(page.getByText('release-preview.png')).toBeVisible();
    await page.getByTitle('Send message').click();
    await expect(page.getByText('Release gate message with attachment')).toBeVisible();
    await page.getByRole('button', { name: /Preview release-preview\.png/i }).click();
    await expect(page.getByRole('img', { name: 'release-preview.png' })).toBeVisible();
    await page.getByTitle('Close preview').click();

    await page.getByRole('button', { name: 'Subtasks', exact: true }).click();
    await page.getByPlaceholder('Subtask or milestone title').fill('Release gate milestone');
    await page.getByRole('button', { name: /Milestone/i }).click();
    await page.getByRole('button', { name: /Add/i }).click();
    await expect(page.getByText('Release gate milestone')).toBeVisible();
    await page.getByTestId('subtask-edit-button').click();
    const subtaskEditor = page.getByTestId('subtask-edit-form');
    await expect(subtaskEditor).toBeVisible();
    await subtaskEditor.getByPlaceholder('Subtask title').fill('Release gate milestone edited');
    await subtaskEditor.locator('input[title="Progress percent"]').fill('45');
    await subtaskEditor.getByTestId('subtask-save-button').click();
    await expect(page.getByText('Subtask updated')).toBeVisible();
    await expect(page.getByText('Release gate milestone edited')).toBeVisible();
    await expect(page.getByTestId('subtask-row').getByText('45%')).toBeVisible();
    await page.getByTitle('Delete subtask').click();
    await expect(page.getByText('Delete Subtask')).toBeVisible();
    await page.locator('.modal-content').filter({ hasText: 'Delete Subtask' }).getByRole('button', { name: /^Delete$/ }).click();
    await expect(page.getByText('Subtask deleted')).toBeVisible();
    await expect(page.getByText('Release gate milestone edited')).toHaveCount(0);

    await page.getByRole('button', { name: 'Metrics', exact: true }).click();
    await page.getByPlaceholder('Current value').fill('42');
    await page.getByPlaceholder('Progress note').fill('Release gate check-in');
    await page.getByRole('button', { name: /Log Check-In/i }).click();
    await expect(page.getByText('Release gate check-in')).toBeVisible();

    await page.getByRole('button', { name: 'Files', exact: true }).click();
    await expect(page.getByText('release-note.txt')).toBeVisible();
    await page.getByRole('button', { name: /Preview release-note\.txt/i }).click();
    await expect(page.getByText('release gate attachment')).toBeVisible();
    await page.getByTitle('Close preview').click();

    await dropTextFile(page, 'objective-file-dropzone', {
      name: 'drag-drop-note.txt',
      content: 'drag and drop attachment',
    });
    await expect(page.getByText('drag-drop-note.txt')).toBeVisible({ timeout: 15000 });
    await page.getByRole('button', { name: /Preview drag-drop-note\.txt/i }).click();
    await expect(page.getByText('drag and drop attachment')).toBeVisible();
    await page.getByTitle('Close preview').click();

    await page.reload();
    await expect(page.getByRole('heading', { name: title })).toBeVisible();
    await page.getByRole('button', { name: 'Files', exact: true }).click();
    await expect(page.getByText('release-note.txt')).toBeVisible();
    await expect(page.getByText('drag-drop-note.txt')).toBeVisible();
    await page.getByRole('button', { name: 'Close objective' }).click();

    await page.getByTitle('Open Admin').click();
    await page.getByRole('button', { name: /Settings/i }).click();
    await page.getByRole('button', { name: /Assignment/i }).click();
    await expect(page.getByText(/Test notification sent|Create an objective/i)).toBeVisible();

    await page.keyboard.press('Escape');
    await navItem(page, 'Objectives').click();
    await page.getByPlaceholder('Search objectives...').fill(title);
    await openObjectiveByTitle(page, title);
    await page.getByTitle('Delete').click();
    await page.locator('.btn-danger').filter({ hasText: /^Delete$/ }).click();
    await expect(page.getByText('Objective deleted')).toBeVisible();
  });

  test('mobile objective detail has safe back, bottom nav, message composer, and file tab', async ({ page }) => {
    const title = `Release Gate Mobile ${Date.now()}`;
    const due = new Date(Date.now() + 86400000).toISOString().slice(0, 10);

    await page.setViewportSize({ width: 390, height: 844 });
    await dismissDailyBrief(page);
    await dismissGuidance(page);
    await page.getByRole('button', { name: 'New', exact: true }).click();
    await page.getByPlaceholder('What needs to be done?').fill(title);
    await page.locator('input[type="date"]').fill(due);
    await page.getByRole('button', { name: /Create Objective|Delegate Objective/i }).click();
    await expect(page.getByText(/Objective created|Objective delegated/i)).toBeVisible();

    await navItem(page, 'Objectives').click();
    await expect(page.locator('.mobile-nav')).toBeVisible();
    await expect(page.locator('.mobile-topbar')).toBeVisible();
    await expect(page.locator('.mobile-new-fab')).toBeVisible();
    await page.getByPlaceholder('Search objectives...').fill(title);
    await expect(page.locator('.mobile-objective-list')).toBeVisible();
    await expect(page.locator('.desktop-objective-views')).toBeHidden();
    await page.getByRole('button', { name: /Filters/i }).click();
    await expect(page.getByText('Objective filters')).toBeVisible();
    await page.getByRole('button', { name: 'Apply' }).click();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(2);
    await openObjectiveByTitle(page, title);
    await expect(page.getByRole('button', { name: /Back/i })).toBeVisible();
    await expect(page.locator('.objective-detail-modal')).toBeVisible();
    await expect(page.locator('textarea[placeholder^="Type a message"]')).toBeVisible();
    await page.getByRole('button', { name: 'Files', exact: true }).click();
    await expect(page.getByText('No files attached yet.')).toBeVisible();
    await page.getByRole('button', { name: /Back/i }).click();
    await expect(page.locator('.mobile-nav')).toBeVisible();
  });
});
