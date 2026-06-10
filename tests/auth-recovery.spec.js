import { expect, test } from '@playwright/test';
import { randomBytes } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { env, navItem } from './helpers.js';

const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;

const createAdmin = () => createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

test.describe('password recovery', () => {
  test.beforeEach(async () => {
    test.skip(!env.allowMutation, 'Set SANDPRO_E2E_ALLOW_MUTATION=1 for isolated password recovery checks.');
    test.skip(!supabaseUrl || !serviceRoleKey, 'Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY for password recovery checks.');
  });

  test('recovery links force a reset password screen before entering the app', async ({ page }) => {
    const admin = createAdmin();
    const token = `${Date.now()}-${randomBytes(3).toString('hex')}`;
    const email = `merci-feedback-reset-${token}@ndai.pro`;
    const oldPassword = `${randomBytes(16).toString('base64url')}Aa1!`;
    const newPassword = `${randomBytes(16).toString('base64url')}Aa1!`;
    let userId;

    try {
      const { data: created, error: createError } = await admin.auth.admin.createUser({
        email,
        password: oldPassword,
        email_confirm: true,
        user_metadata: {
          name: 'Recovery QA',
          initials: 'RQ',
          title: 'Reset Validator',
          department: 'Admin',
          role: 'manager',
          color: '#ff7f02',
          must_change_password: false,
        },
      });
      if (createError) throw createError;
      userId = created.user.id;

      const { data: link, error: linkError } = await admin.auth.admin.generateLink({
        type: 'recovery',
        email,
        options: { redirectTo: env.baseUrl },
      });
      if (linkError) throw linkError;

      const actionLink = link?.properties?.action_link || link?.action_link;
      expect(actionLink).toBeTruthy();
      expect(actionLink).not.toContain('localhost');

      await page.goto(actionLink);
      await expect(page.getByText('Reset Your Password')).toBeVisible();
      await expect(page.getByText('Enter a new password below.')).toBeVisible();
      await page.locator('input[type="password"]').first().fill(newPassword);
      await page.locator('input[type="password"]').nth(1).fill(newPassword);
      await page.getByRole('button', { name: 'Save Password' }).click();
      await expect(page.getByText('Reset Your Password')).toHaveCount(0);
      await expect(navItem(page, 'Dashboard')).toBeVisible();
    } finally {
      if (userId) {
        await admin.from('profiles').delete().eq('id', userId);
        await admin.auth.admin.deleteUser(userId);
      }
    }
  });
});
