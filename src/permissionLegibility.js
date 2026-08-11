// ============================================================================
// PERMISSION LEGIBILITY — Over-The-Top item 9 (pure logic)
// ----------------------------------------------------------------------------
// Disabled controls say why, name who can, and offer one-tap request-access
// that pings the right person. Two role-visibility bugs shipped this month
// precisely because permissions are invisible even to admins — this makes
// authority legible. The chip/popover lives in src/LockedHint.jsx.
// ============================================================================
import { canManageOkrs, canManageOrgChart } from './data.js';

const ADMIN_DELETE_EMAILS = ['jfeil@sandpro.com', 'tdibben@sandpro.com', 'andrew@ndai.pro'];

// Pilot rollout (standing rule, Andrew 8/11): visible to Andrew + the QA
// accounts that walk the proof gates; the `permission_legibility` app flag
// opens it to everyone — SQL flip, no deploy.
export const PERMISSION_LEGIBILITY_PILOT_EMAILS = [
  'andrew@ndai.pro',
  'release-smoke-admin@objectivetracker.net',
  'release-smoke-member@objectivetracker.net',
];
export const canSeePermissionLegibility = (user, flagOn = false) => (
  flagOn || PERMISSION_LEGIBILITY_PILOT_EMAILS.includes((user?.email || '').toLowerCase())
);

// Each capability: plain-English why-copy (the control speaks for itself) and
// the SAME predicate the UI gate uses — one truth, so the hint can never
// disagree with the lock.
export const CAPABILITIES = {
  manage_okrs: {
    label: 'OKR editing',
    why: 'OKRs are the company scoreboard. Only executives and the named OKR editors can change targets, owners, and check-ins.',
    allows: (user) => canManageOkrs(user),
  },
  team_scope: {
    label: 'My team view',
    why: 'The team view shows a manager their crew’s work. It unlocks when people report to you on the org chart.',
    allows: (user) => user?.role === 'executive' || user?.role === 'manager',
  },
  manage_org: {
    label: 'Org chart editing',
    why: 'The org chart decides who reports to whom — and that drives crew views and digests. Managers and executives keep it accurate.',
    allows: (user) => canManageOrgChart(user),
  },
  delete_objective: {
    label: 'Deleting this item',
    why: 'Deleting takes work off everyone’s board, so it belongs to the person who created the item — or an admin.',
    allows: (user, ctx = {}) => Boolean(
      (ctx.createdBy && user?.id === ctx.createdBy)
      || user?.role === 'executive'
      || ADMIN_DELETE_EMAILS.includes((user?.email || '').toLowerCase()),
    ),
  },
};

// Executives lead the "who can" list — they are who you would actually ask.
const byAskPriority = (a, b) => {
  const rank = (p) => (p.role === 'executive' ? 0 : p.role === 'manager' ? 1 : 2);
  return rank(a) - rank(b) || String(a.name || '').localeCompare(String(b.name || ''));
};

export const resolveCapability = (capabilityId, user, profiles = [], ctx = {}) => {
  const capability = CAPABILITIES[capabilityId];
  if (!capability) return null;
  const allowedUsers = profiles
    .filter((profile) => profile?.id && capability.allows(profile, ctx))
    .sort(byAskPriority);
  return {
    id: capabilityId,
    label: capability.label,
    why: capability.why,
    locked: !capability.allows(user, ctx),
    allowedUsers,
  };
};

// One tap pings the right people — capped so a request never carpet-bombs
// the org. Executives first: they can actually grant it.
export const requestRecipients = (allowedUsers = [], max = 4) => allowedUsers.slice(0, max);

// One request per capability per person per day. The stamp lives in
// localStorage; asking twice in a day is a toast, not a second ping.
export const requestStampKey = (userId, capabilityId, now = new Date()) => (
  `omp-access-request-${userId}-${capabilityId}-${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
);

export const buildRequestMessage = (requester, capability) => (
  `${requester?.name || 'Someone'} is asking for access: ${capability.label.toLowerCase()}. They hit a locked control and you can grant or explain it.`
);
