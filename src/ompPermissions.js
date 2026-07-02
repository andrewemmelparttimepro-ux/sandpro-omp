// ============================================================================
// OMP FIELD-LEVEL PERMISSIONS (bridge plan, Domain 7 — edit vs view contract)
// ----------------------------------------------------------------------------
// One enforced rule for "who may edit which field", from the framework R10–R16
// + the June 24 transcript:
//   - Admins edit anything (and add lines).            [admin = executive|manager]
//   - Tagged employees edit only the line fields they are tagged in.
//   - Status is editable ONLY by the assigned person (or an admin).
//   - Calculation fields (Rolling AVG, derived progress) are immutable for ALL.
//   - Everyone with access can VIEW everything ("on the team, you're on the team").
//
// Pure module: no React, no Supabase — same logic backs the UI affordances and
// (mirrored) the Supabase RLS policies. Decision Q10 (client-confirmed):
// profiles.role of executive OR manager = admin.
// ============================================================================

// Roles on profiles.role that get edit-anything (except calc fields) rights.
export const ADMIN_ROLES = ["executive", "manager"];

export const isAdminRole = (role) => ADMIN_ROLES.includes(String(role || "").toLowerCase());

// Object-member roles that count as "tagged into the line" for field editing.
export const TAGGED_MEMBER_ROLES = ["assignee", "manager", "owner"];

// Fields that are ALWAYS computed — immutable for everyone, including admins.
export const IMMUTABLE_CALC_FIELDS = new Set([
  "rollingAvg",
  "rolling_avg",
  "rollupProgress",
]);

// Progress is immutable only when it is DERIVED (metric/rollup/workflow); a
// truly manual objective keeps a hand-editable progress field.
const isDerivedProgressSource = (source) =>
  source && source !== "manual" && source !== "none";

/**
 * Build the permission context for the current user against one objective.
 * @param {object} objective  the rich objective (ownerId, members[], progressSource)
 * @param {object} user       the current profile ({ id, role })
 * @returns {{ isAdmin:boolean, isAssignee:boolean, isTagged:boolean, taggedFields:(string[]|null), progressSource:string }}
 */
export const buildPermissionContext = (objective = {}, user = {}) => {
  const userId = user.id;
  const isAdmin = isAdminRole(user.role);
  const members = objective.members || [];
  const myMemberships = members.filter(m => m.userId === userId);
  const isOwner = (objective.ownerId || objective.owner_id) === userId;
  const isAssignee = isOwner || myMemberships.some(m =>
    ["assignee", "owner"].includes(String(m.role || "").toLowerCase()));
  const isTagged = isOwner || myMemberships.some(m =>
    TAGGED_MEMBER_ROLES.includes(String(m.role || "").toLowerCase()));
  // taggedFields: null = all line fields (no per-field tagging recorded yet).
  // When per-field tags exist on a membership, restrict edits to them.
  const taggedFields = myMemberships.reduce((acc, m) => {
    if (Array.isArray(m.fields) && m.fields.length) return [...(acc || []), ...m.fields];
    return acc;
  }, null);
  return {
    isAdmin,
    isAssignee,
    isTagged,
    taggedFields,
    progressSource: objective.progressSource || objective.progress_source || "manual",
  };
};

/**
 * @returns {"edit"|"view"} the permission for a single field given a context.
 */
export const getFieldPermission = (field, ctx = {}) => {
  const { isAdmin, isAssignee, isTagged, taggedFields, progressSource } = ctx;

  // 1. Calculation fields are immutable for everyone.
  if (IMMUTABLE_CALC_FIELDS.has(field)) return "view";
  if (field === "progress" && isDerivedProgressSource(progressSource)) return "view";

  // 2. Status is editable only by the assignee (or an admin).
  if (field === "status") return (isAdmin || isAssignee) ? "edit" : "view";

  // 3. Admins edit anything else.
  if (isAdmin) return "edit";

  // 4. Tagged employees edit only the line fields they are tagged in
  //    (taggedFields === null means "all line fields" until per-field tags exist).
  if (isTagged && (taggedFields === null || taggedFields.includes(field))) return "edit";

  // 5. Default: view-only but visible.
  return "view";
};

export const canEditField = (field, ctx = {}) => getFieldPermission(field, ctx) === "edit";

// Admins may add new lines / objectives; everyone else cannot.
export const canAddLines = (ctx = {}) => Boolean(ctx.isAdmin);
