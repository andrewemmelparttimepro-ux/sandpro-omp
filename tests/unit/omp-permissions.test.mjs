import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildPermissionContext,
  canAddLines,
  canEditField,
  getFieldPermission,
  isAdminRole,
} from '../../src/ompPermissions.js';

test('admin = executive or manager role', () => {
  assert.equal(isAdminRole('executive'), true);
  assert.equal(isAdminRole('Manager'), true);
  assert.equal(isAdminRole('contributor'), false);
  assert.equal(isAdminRole(undefined), false);
});

test('calculation fields are immutable for everyone including admins', () => {
  const adminCtx = { isAdmin: true, isAssignee: true, isTagged: true, taggedFields: null };
  assert.equal(getFieldPermission('rollingAvg', adminCtx), 'view');
  assert.equal(getFieldPermission('rollupProgress', adminCtx), 'view');
  // Derived progress is immutable; manual progress is editable by admin.
  assert.equal(getFieldPermission('progress', { ...adminCtx, progressSource: 'metric' }), 'view');
  assert.equal(getFieldPermission('progress', { ...adminCtx, progressSource: 'manual' }), 'edit');
});

test('status is editable only by the assignee or an admin', () => {
  assert.equal(canEditField('status', { isAssignee: true }), true);
  assert.equal(canEditField('status', { isAdmin: true }), true);
  assert.equal(canEditField('status', { isTagged: true, isAssignee: false, isAdmin: false }), false);
});

test('tagged employees edit only the line fields they are tagged in', () => {
  const tagged = { isTagged: true, taggedFields: ['target', 'description'] };
  assert.equal(canEditField('target', tagged), true);
  assert.equal(canEditField('description', tagged), true);
  assert.equal(canEditField('priority', tagged), false);
  // null taggedFields = all line fields until per-field tags exist.
  assert.equal(canEditField('priority', { isTagged: true, taggedFields: null }), true);
});

test('everyone with access can view everything; only admins add lines', () => {
  const viewer = { isAdmin: false, isAssignee: false, isTagged: false, taggedFields: null };
  assert.equal(getFieldPermission('priority', viewer), 'view');
  assert.equal(getFieldPermission('status', viewer), 'view');
  assert.equal(canAddLines(viewer), false);
  assert.equal(canAddLines({ isAdmin: true }), true);
});

test('buildPermissionContext derives admin/assignee/tagged from real objective shapes', () => {
  const objective = {
    ownerId: 'u-owner',
    progressSource: 'rollup',
    members: [
      { userId: 'u-assignee', role: 'assignee' },
      { userId: 'u-watcher', role: 'watcher' },
    ],
  };
  const ownerCtx = buildPermissionContext(objective, { id: 'u-owner', role: 'contributor' });
  assert.equal(ownerCtx.isAssignee, true);
  assert.equal(ownerCtx.isTagged, true);
  assert.equal(ownerCtx.isAdmin, false);

  const assigneeCtx = buildPermissionContext(objective, { id: 'u-assignee', role: 'contributor' });
  assert.equal(assigneeCtx.isAssignee, true);
  assert.equal(canEditField('status', assigneeCtx), true);

  const watcherCtx = buildPermissionContext(objective, { id: 'u-watcher', role: 'contributor' });
  assert.equal(watcherCtx.isAssignee, false);
  assert.equal(watcherCtx.isTagged, false);
  assert.equal(canEditField('status', watcherCtx), false);

  const execCtx = buildPermissionContext(objective, { id: 'u-x', role: 'executive' });
  assert.equal(execCtx.isAdmin, true);
  assert.equal(canEditField('priority', execCtx), true);
  assert.equal(canEditField('rollupProgress', execCtx), false);
});
