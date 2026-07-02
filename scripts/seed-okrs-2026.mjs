// ============================================================================
// SEED — 2026 Consolidated OKRs into Supabase (OMP bridge plan, Domain 4)
// ----------------------------------------------------------------------------
// Loads the 1 company top-line + 17 group scorecards + 91 OKRs from
// src/data/okr2026Consolidated.json and writes them into `objectives` as a
// Company -> Department(group) -> Key Result tree, plus monthly actuals into
// objective_metric_checkins.
//
// SAFE BY DEFAULT:
//   - Runs as a DRY RUN unless BOTH `--commit` AND env SANDPRO_SEED_OKRS_CONFIRM=1.
//   - Idempotent: seeded rows are tagged classification_reason='seed:okr2026-consolidated'
//     and re-running --commit deletes the prior seeded set first (start-clean,
//     the confirmed decision) — it never touches hand-created objectives.
//
// STILL-OPEN DECISIONS this seed surfaces rather than guessing (see plan §4):
//   - Q3 unresolved/compound OKR owners -> seeded with owner_id = NULL and listed.
//   - Q4 baseline/target normalization -> numeric values go to baseline_metric/
//     target_metric; everything else is preserved verbatim in baseline_text/
//     target_text (no fabricated numbers).
//   - Group->department rows flagged `confirmed:false` in OKR_GROUP_TO_DEPARTMENT
//     are seeded with their best-guess department and reported for confirmation.
//
// Run:
//   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/seed-okrs-2026.mjs            # dry run
//   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... SANDPRO_SEED_OKRS_CONFIRM=1 \
//     node scripts/seed-okrs-2026.mjs --commit                                                # writes
// ============================================================================
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { createClient } from '@supabase/supabase-js';
import { OKR_GROUP_TO_DEPARTMENT, getDepartmentClasses } from '../src/ompFramework.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SEED_MARKER = 'seed:okr2026-consolidated';
const COMMIT = process.argv.includes('--commit') && process.env.SANDPRO_SEED_OKRS_CONFIRM === '1';

// Owner initials/name -> SandPro email. Mirror of OKR_OWNER_MAP in
// src/data/okr2026Consolidated.js (kept inline so this script needs no JSON
// import attribute). Unknown/compound owners resolve to null and are reported.
const OKR_OWNER_MAP = {
  JF: 'jfeil@sandpro.com', JB: 'jblackaby@sandpro.com', MB: 'mblackaby@sandpro.com',
  DA: 'danderson@sandpro.com', KK: 'kkraft@sandpro.com', HA: 'hallard-kotaska@sandpro.com',
  Heather: 'hallard-kotaska@sandpro.com', CL: 'cloving@sandpro.com', Casey: 'cloving@sandpro.com',
  TD: 'tdibben@sandpro.com', Tim: 'tdibben@sandpro.com', AA: 'aallan@sandpro.com',
  JM: 'jmaslowski@sandpro.com', Jaelen: 'jmaslowski@sandpro.com', KS: 'ksebastian@sandpro.com',
  Malcolm: 'mblackaby@sandpro.com',
};
const resolveOwnerEmail = (owner) => OKR_OWNER_MAP[String(owner || '').trim()] || null;

const STATUS_MAP = {
  'on track': 'on_track', 'at risk': 'at_risk', 'off track': 'blocked',
};
const mapStatus = (manualStatus) => STATUS_MAP[String(manualStatus || '').trim().toLowerCase()] || 'not_started';

// Parse a sheet value into numeric vs qualitative. Returns { num, unit, text }.
const parseMetricValue = (raw) => {
  if (raw === null || raw === undefined) return { num: null, unit: '', text: '' };
  const str = String(raw).trim();
  if (!str) return { num: null, unit: '', text: '' };
  const unit = str.includes('%') ? '%' : (str.includes('$') ? '$' : '');
  const cleaned = str.replace(/[%$,\s]/g, '');
  const num = Number(cleaned);
  if (cleaned !== '' && Number.isFinite(num)) return { num, unit, text: '' };
  return { num: null, unit: '', text: str };
};

const MONTHS = ['jan','feb','mar','apr','may','jun','jul','aug','sep','oct','nov','dec'];

function loadConsolidated() {
  const json = JSON.parse(readFileSync(join(__dirname, '../src/data/okr2026Consolidated.json'), 'utf8'));
  return json.groups || [];
}

async function main() {
  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;
  if (!supabaseUrl || !serviceRoleKey) {
    console.error('Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY first.');
    process.exit(1);
  }
  const supabase = createClient(supabaseUrl, serviceRoleKey, { auth: { autoRefreshToken: false, persistSession: false } });

  // Resolve profile emails -> ids, and pick a created_by (first executive).
  const { data: profiles, error: profErr } = await supabase.from('profiles').select('id,email,role');
  if (profErr) { console.error('Could not read profiles:', profErr.message); process.exit(1); }
  const emailToId = Object.fromEntries((profiles || []).map(p => [String(p.email).toLowerCase(), p.id]));
  const createdBy = (profiles || []).find(p => p.role === 'executive')?.id || (profiles || [])[0]?.id || null;

  const groups = loadConsolidated();
  const unresolvedOwners = new Set();
  const unconfirmedGroups = new Set();
  const rows = [];          // { tempId, parentTempId, fields, checkins:[{month,value}] }
  let counter = 0;
  const nextId = () => `t${++counter}`;

  // Root company node.
  const rootId = nextId();
  rows.push({ tempId: rootId, parentTempId: null, checkins: [], fields: {
    title: 'SandPro — Company OKRs 2026', okr_level: 'company', okr_group: 'COMPANY - TOP LINE',
    department: null, status: 'on_track',
  }});

  for (const group of groups) {
    const isCompany = group.isCompany;
    const map = OKR_GROUP_TO_DEPARTMENT[group.group] || {};
    if (!isCompany && (!map.confirmed || !map.department)) unconfirmedGroups.add(group.group);
    const dept = map.department || null;
    const classes = dept ? getDepartmentClasses(dept) : [];
    const groupClass = map.class && classes.includes(map.class) ? map.class : null;

    // Non-company groups get a department parent node; company OKRs hang off root.
    let parentForOkrs = rootId;
    if (!isCompany) {
      const groupId = nextId();
      rows.push({ tempId: groupId, parentTempId: rootId, checkins: [], fields: {
        title: group.group, okr_level: 'department', okr_group: group.group,
        department: dept, class: groupClass, status: 'on_track',
      }});
      parentForOkrs = groupId;
    }

    for (const okr of (group.okrs || [])) {
      const ownerEmail = resolveOwnerEmail(okr.owner);
      if (okr.owner && !ownerEmail) unresolvedOwners.add(String(okr.owner).trim());
      const ownerId = ownerEmail ? emailToId[ownerEmail.toLowerCase()] || null : null;
      const baseline = parseMetricValue(okr.baseline);
      const target = parseMetricValue(okr.target);
      const unit = baseline.unit || target.unit || '';

      const checkins = MONTHS
        .map((m, i) => ({ m: i, value: parseMetricValue(okr.actuals?.[m]).num }))
        .filter(c => c.value !== null);

      rows.push({ tempId: nextId(), parentTempId: parentForOkrs, checkins, fields: {
        title: okr.title || 'Untitled OKR',
        okr_level: isCompany ? 'company' : 'key_result',
        okr_group: group.group,
        department: dept,
        class: groupClass,
        owner_id: ownerId,
        status: mapStatus(okr.manualStatus),
        audit_form_use: okr.auditForm || null,
        baseline_metric: baseline.num, baseline_text: baseline.text || null,
        target_metric: target.num, target_text: target.text || null,
        metric_unit: unit,
        measurement_cadence: /quarter/i.test(okr.reportingCadence || '') ? 'quarterly' : 'monthly',
      }});
    }
  }

  const okrLeafCount = rows.filter(r => r.fields.okr_level === 'key_result' || (r.fields.okr_level === 'company' && r.parentTempId === rootId)).length;
  console.log(`Parsed ${groups.length} groups -> ${rows.length} objective rows (${okrLeafCount} OKR leaves), ${rows.reduce((n,r)=>n+r.checkins.length,0)} monthly check-ins.`);
  if (unresolvedOwners.size) console.log('UNRESOLVED OWNERS (seeded with no owner — needs Q3):', [...unresolvedOwners].join(', '));
  if (unconfirmedGroups.size) console.log('UNCONFIRMED group->department (needs Q2 confirm):', [...unconfirmedGroups].join(', '));

  if (!COMMIT) {
    console.log('\nDRY RUN — nothing written. Re-run with --commit and SANDPRO_SEED_OKRS_CONFIRM=1 to seed.');
    return;
  }

  // Idempotent reset: remove prior seeded rows (and their check-ins) only.
  const { data: priorObjs } = await supabase.from('objectives').select('id').eq('classification_reason', SEED_MARKER);
  const priorIds = (priorObjs || []).map(o => o.id);
  if (priorIds.length) {
    await supabase.from('objective_metric_checkins').delete().in('objective_id', priorIds);
    await supabase.from('objectives').delete().in('id', priorIds);
    console.log(`Removed ${priorIds.length} previously seeded objectives.`);
  }

  // Insert in dependency order (parents before children); map tempId -> real id.
  const realId = {};
  for (const row of rows) {
    const insert = {
      ...row.fields,
      parent_id: row.parentTempId ? realId[row.parentTempId] : null,
      created_by: createdBy,
      okr_period: '2026',
      classification_status: 'manual',
      classification_reason: SEED_MARKER,
      rollup_method: row.fields.okr_level === 'key_result' ? 'manual' : 'average',
    };
    const { data, error } = await supabase.from('objectives').insert(insert).select('id').single();
    if (error) { console.error(`Insert failed for "${row.fields.title}":`, error.message); process.exit(1); }
    realId[row.tempId] = data.id;
    for (const c of row.checkins) {
      await supabase.from('objective_metric_checkins').insert({
        objective_id: data.id, checkin_date: `2026-${String(c.m + 1).padStart(2, '0')}-01`,
        value: c.value, created_by: createdBy, note: 'Seeded from 2026 consolidated sheet',
      });
    }
  }
  console.log(`Seeded ${rows.length} objectives with monthly check-ins. Done.`);
}

main().catch(err => { console.error(err); process.exit(1); });
