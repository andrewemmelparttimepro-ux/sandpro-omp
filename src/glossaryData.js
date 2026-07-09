import { createContext, useContext } from 'react';

// ============================================================================
// FIELD KEY (Decoder) — glossary data + context
// Component implementations live in src/glossary.jsx.
// NCR-first; add new glossaries here and mount FieldKeyProvider with them.
// ============================================================================

export const NCR_GLOSSARY = [
  {
    id: 'roles',
    label: 'People & Roles',
    blurb: 'Who is who on an NCR — the most commonly confused fields.',
    terms: [
      { id: 'observer', term: 'Observer', aka: ['Reported by'], def: 'The person who witnessed or caught the non-conformance and reported it. The analytics "Observers" ranking counts how many NCRs each person filed — a high count usually means strong reporting participation, not a problem with that person.', example: 'A shop tech notices a valve fails bench testing and files the NCR — they are the Observer.' },
      { id: 'author', term: 'Author', aka: ['Author of Report'], def: 'The person who actually entered the report into the system. Usually the same as the Observer, but they differ when someone files on a coworker’s behalf (e.g., office staff entering a field report).', example: 'A field hand calls in an issue; the coordinator types it up. Field hand = Observer, coordinator = Author.' },
      { id: 'personnel_involved', term: 'Personnel Involved', aka: ['Employee', 'Employees Named'], def: 'People named as involved in the event itself — present at, operating, or connected to what went wrong. The analytics "Employees Named" ranking counts these mentions. Being named is context for the investigation, not an assignment of fault.', example: 'Two operators were running the unit when the process loss occurred — both are Personnel Involved even though neither caused it.' },
      { id: 'ncr_owner', term: 'NCR Owner', def: 'The single person accountable for driving this NCR to closure — chasing root cause, corrective actions, and signoffs. Required before closure can be approved.', example: 'The Shop manager owns NCR #82007417 and is on the hook for getting it closed.' },
      { id: 'reviewer', term: 'Reviewer / Approver', def: 'Reviews the quality of the root cause analysis and corrective action, and provides the reviewer signoff. Required before closure.', example: 'Quality manager checks that the RCA is a real cause, not a symptom, then signs off.' },
      { id: 'verifier', term: 'Effectiveness Verifier', def: 'Independently confirms the corrective action actually worked — that the problem has not recurred. Should not be the same person who did the fix. Required before closure.', example: '30 days after the fix, the verifier checks repeat-failure data before the NCR can close.' },
    ],
  },
  {
    id: 'lifecycle',
    label: 'Lifecycle & Status',
    blurb: 'Where an NCR is in its life, from first report to closure.',
    terms: [
      { id: 'stage_draft', term: 'Draft', def: 'Being written; not yet submitted into the workflow.' },
      { id: 'stage_submitted', term: 'Submitted', def: 'Logged and awaiting triage — no containment or root-cause work recorded yet.' },
      { id: 'stage_containment', term: 'Containment Required', def: 'The problem needs to be immediately boxed in (hold, quarantine, customer notification) before deeper analysis. An NCR moves here automatically when "Immediate quarantine" is checked.' },
      { id: 'stage_root_cause', term: 'Root Cause', def: 'Root cause analysis (5-Why, fishbone, etc.) is in progress.' },
      { id: 'stage_corrective', term: 'Corrective Action', def: 'Permanent fixes are being implemented to prevent recurrence.' },
      { id: 'stage_effectiveness', term: 'Effectiveness Check', def: 'Verifying the corrective action actually prevented recurrence — the last gate before closure.' },
      { id: 'stage_closed', term: 'Closed', def: 'Closure approved after all required owners, analysis, actions, verification, and signatures were in place.' },
      { id: 'stage_void', term: 'Void', def: 'Cancelled or invalid (duplicate, filed in error). Kept for the record but excluded from active work.' },
      { id: 'status_open', term: 'Open (any stage)', def: 'Any NCR that is not closed — regardless of which lifecycle stage it sits in. This is the default tracker filter.' },
      { id: 'status_in_progress', term: 'In Progress (any stage)', def: 'An open NCR that is actively being worked — it has a linked objective or an in-progress status.' },
    ],
  },
  {
    id: 'attention',
    label: 'Attention Flags',
    blurb: 'What the KPI cards and the attention filter mean.',
    terms: [
      { id: 'flag_past_due', term: 'Past Due', def: 'The follow-up due date has passed and the NCR is still open. These age every day and are the first thing to review.' },
      { id: 'flag_due_soon', term: 'Due Within 7 Days', def: 'The follow-up due date lands inside the next 7 days. The window to act before it becomes past due.' },
      { id: 'flag_critical', term: 'Critical Open', def: 'Criticality is "Critical" and the NCR is not closed. Highest-consequence open items.' },
    ],
  },
  {
    id: 'classification',
    label: 'Classification & Measures',
    blurb: 'How NCRs are categorized, located, and costed.',
    terms: [
      { id: 'event_type', term: 'Type of Event', def: 'The KPA event category: Equipment Failure (hardware broke), Process Loss (a process broke down or caused downtime), or Substandard Condition (something out of spec that hasn’t failed yet). An NCR can carry more than one.' },
      { id: 'criticality', term: 'Criticality', aka: ['Severity'], def: 'Critical vs Non-Critical. Critical means significant safety, customer, or cost consequence — it drives the Critical Open KPI and gets reviewed first.' },
      { id: 'internal_external', term: 'Internal / External', def: 'Who caught it. Internal = found by our own people or audits. External = found by a customer or third party (these usually carry more weight).' },
      { id: 'group', term: 'Primary Group Affected', aka: ['Department Group', 'Affected Departments'], def: 'The main SandPro group accountable for the NCR impact (Shop, Service, CP, Sales, Automation, ...). Additional affected departments can still be checked, but this primary group is the required rollup group used in tracker views and charts.' },
      { id: 'worksite', term: 'Worksite / Area', def: 'Where the event physically happened: Shop, Office, Customer Location, Vendor Location, or an audit.' },
      { id: 'operator_location', term: 'Operator and Location', def: 'The customer operator and the site/well where the event occurred — e.g. "Exxon - HBU Sakakawea 13X-3". This is how NCRs are grouped per customer in analytics.' },
      { id: 'npt', term: 'NPT', aka: ['Non-Productive Time'], def: 'Whether the event caused downtime (Yes/No). NPT events are the ones that directly cost operating hours.' },
      { id: 'npt_amount', term: 'NPT Amount', def: 'How much downtime, in hours. Feeds the NPT Amount analytics buckets.' },
      { id: 'estimated_cost', term: 'Estimated Cost', def: 'Best estimate of the dollar impact (parts, labor, downtime, concessions).' },
      { id: 'root_cause_codes', term: 'Root Cause Codes', def: 'The standardized cause category (Not Following SOP, Faulty Equipment, Inadequate Training, ...) so causes can be trended across NCRs. "Unknown / Pending RCA" means analysis isn’t done.' },
      { id: 'failure_taxonomy', term: 'Failure Grouping', aka: ['Normalized Failure', 'Failure Group'], def: 'How OMP groups free-text issue descriptions into consistent failure families (e.g. "710 valve failure", "HRU failure") so repeated issues can be counted together.' },
      { id: 'disposition', term: 'Disposition', def: 'What was decided about the affected product: Use as-is, Rework, Repair, Scrap, Return, Hold, or Customer concession.' },
      { id: 'follow_ups', term: 'Follow-Ups', def: 'The count of follow-up actions recorded on the NCR, plus the next follow-up due date. Drives the Past Due and Due Within 7 Days flags.' },
    ],
  },
];

// ============================================================================
// OMP GLOSSARY — app-wide definitions ("What the hell are you guys talking
// about?" — the definitions page Tim asked for, 7/8 meeting). Mounted at the
// App level; the NCR page keeps its own NCR_GLOSSARY provider.
// Definitions follow Tim's own wording from the meeting where he gave one.
// ============================================================================

export const OMP_GLOSSARY = [
  {
    id: 'okr_basics',
    label: 'Goals & OKRs',
    blurb: 'The vocabulary of the goal system — what each level means.',
    terms: [
      { id: 'okr', term: 'OKR', aka: ['Objective + Key Results'], def: 'A goal with measurable results attached. The Objective is what you want to achieve; the Key Results are the numbers that prove whether you did.', example: '"Reduce field NCRs" is the objective; "field NCR rate down from 5% to 1%" is the key result.' },
      { id: 'key_result', term: 'Key Result (KR)', def: 'The measurable outcome under a goal — the number that tells you whether the objective is actually being met. "KR" is short for key result.', example: '"DSO under 60 days" is the key result for the Finance collection goal.' },
      { id: 'company_okr', term: 'Company OKRs', def: 'The top-line company goals everything else rolls up to: Net Profit 15%, Zero TRIR, Employee Cost under 27%, and the 2.0 Digital Operating System.', example: 'Every team OKR should support at least one of the four company OKRs.' },
      { id: 'stale_kr', term: 'Stale KR', def: 'A key result with no update in over 30 days — nobody has worked on it. Different from blocked: stale means untouched; blocked means someone worked it but progress is stopped.', example: 'An OKR whose monthly number was last entered in May shows as stale in July.' },
      { id: 'gate_blocker', term: 'Gate blocker', def: 'Something outside the team’s control that prevents progress toward a key result or a project stage — a missing approval, permit, part, or decision that has to come from a higher level. Blockers should be visible, not buried: leadership usually has to act on them.', example: 'You can’t move the project forward because the customer hasn’t granted SCADA access — that’s a gate blocker.' },
      { id: 'project_assessment', term: 'Projects in assessment', def: 'Projects still in the evaluation stage — economics, risk review, and required approvals — before being green-lit as active work.' },
      { id: 'needs_review', term: 'Needs review', def: 'Entries the system classified automatically and is asking a person to confirm — the type or level was assumed, not chosen.' },
      { id: 'ytd_avg', term: 'YTD AVG', aka: ['Running average', 'Rolling average'], def: 'The running (year-to-date) average — auto-calculated from the monthly numbers entered so far this year. Same thing as the "rolling average" on the old spreadsheet. Read-only: the system computes it.', example: 'Entries of 10, 20, and 30 for Jan–Mar show a YTD AVG of 20.' },
    ],
  },
  {
    id: 'okr_status',
    label: 'Status & attention',
    blurb: 'What the colors and status words mean, everywhere in OMP.',
    terms: [
      { id: 'status_on_track', term: 'On Track', def: 'Progressing as planned — no intervention needed. Set by the line owner.' },
      { id: 'status_at_risk', term: 'At Risk', def: 'Trending the wrong way — could miss the target without a course correction. Set by the line owner.' },
      { id: 'status_blocked', term: 'Blocked (off track)', def: 'Work has stopped because something prevents progress — you’ve worked on it but can’t move it. The block should be identified so leadership can act on it.', example: 'A part is discontinued and the replacement was judged too expensive — the initiative is blocked, and that decision stays visible instead of disappearing.' },
      { id: 'status_past_due', term: 'Past Due', def: 'The due date has passed and the item is still open. These age every day and are the first thing to review.' },
      { id: 'due_horizon', term: 'Due horizon', def: 'How much work is coming due: today, within 7, 14, or 28 days. A pressure gauge for the next month.' },
    ],
  },
];

export const flattenGlossaryTerms = (groups = []) => groups.flatMap(group => group.terms.map(term => ({ ...term, groupId: group.id, groupLabel: group.label })));

export const FieldKeyContext = createContext(null);

export const useFieldKey = () => useContext(FieldKeyContext);
