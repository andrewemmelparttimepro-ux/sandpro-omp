import assert from 'node:assert/strict';
import test from 'node:test';

import {
  canManageAssignmentGroups,
  getDirectReports,
  getObjectiveAssignmentLabel,
  getObjectiveAssignmentMemberIds,
  getProfileManagerIds,
  isObjectiveAssignedToUser,
  setProfiles,
} from '../../src/data.js';

test('objective ownership is exactly one person or one rotating group in the UI model', () => {
  setProfiles([{ id: 'person-1', name: 'One Person' }]);
  const personal = { ownerId: 'person-1', assignmentGroupId: null };
  const rotating = {
    ownerId: null,
    assignmentGroupId: 'group-1',
    assignmentGroupName: 'Dispatch',
    assignmentGroupMemberIds: ['person-1', 'person-2'],
  };

  assert.deepEqual(getObjectiveAssignmentMemberIds(personal), ['person-1']);
  assert.deepEqual(getObjectiveAssignmentMemberIds(rotating), ['person-1', 'person-2']);
  assert.equal(isObjectiveAssignedToUser(rotating, 'person-2'), true);
  assert.equal(getObjectiveAssignmentLabel(personal), 'One Person');
  assert.equal(getObjectiveAssignmentLabel(rotating), 'Dispatch');
});

test('Merci and named platform admins can manage rotating groups', () => {
  assert.equal(canManageAssignmentGroups({ email: 'mjimenez@sandpro.com', role: 'contributor' }), true);
  assert.equal(canManageAssignmentGroups({ email: 'someone@sandpro.com', role: 'contributor' }), false);
  assert.equal(canManageAssignmentGroups({ email: 'leader@sandpro.com', role: 'executive' }), true);
});

test('equal-rank managers both receive the same direct-report relationship', () => {
  const employee = {
    id: 'employee-1',
    reports_to: 'manager-1',
    manager_ids: ['manager-1', 'manager-2'],
  };
  setProfiles([
    { id: 'manager-1', name: 'Isaac' },
    { id: 'manager-2', name: 'Zedek' },
    employee,
  ]);

  assert.deepEqual(getProfileManagerIds(employee), ['manager-1', 'manager-2']);
  assert.deepEqual(getDirectReports('manager-1').map(profile => profile.id), ['employee-1']);
  assert.deepEqual(getDirectReports('manager-2').map(profile => profile.id), ['employee-1']);
});
