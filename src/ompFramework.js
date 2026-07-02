// ============================================================================
// OMP FRAMEWORK — Rev 1 (Objective Classification System)
// ----------------------------------------------------------------------------
// Source of truth: OMP_FRAME_WORK_R1.xlsx ("FRAME WORK" sheet), delivered by
// Mercileidy Jimenez following her meeting with Tim Dibben and Jake Feil.
// Transcribed 2026-06-23. This file encodes the classification structure,
// the department pick list, the per-department class definitions, and the
// per-type field matrix.
//
// LAYOUT NOTE (explicit client instruction): the Excel shows the framework in a
// HORIZONTAL layout purely for visualization. The PLATFORM keeps the EXISTING
// VERTICAL SCROLL format as-is. Do not re-flow any screen to a horizontal
// matrix because of how the spreadsheet looks.
//
// SCOPE NOTE: this module is the data definition only. Wiring it into the
// create/edit forms, the Supabase schema, and migrating existing records is
// tracked in AGENT-HANDOFF-OMP-FRAMEWORK-AND-OKRS.md.
// ============================================================================

// ---------------------------------------------------------------------------
// 1. Classification types (top-level entry kinds) — R6 of the framework sheet
//    Originator is captured automatically and is NOT user-selectable (R4).
// ---------------------------------------------------------------------------
export const OMP_CLASSIFICATION_TYPES = [
  { id: "task", label: "Task" },
  { id: "project", label: "Project" },
  { id: "okr", label: "OKR" },
  { id: "ncr", label: "NCR" },
];

// ---------------------------------------------------------------------------
// 2. Department pick list — the canonical 5 departments (R13).
//    This REPLACES the legacy flat department list. See data.js + the handoff
//    for the legacy→new remap and the required data migration.
// ---------------------------------------------------------------------------
export const OMP_DEPARTMENTS = [
  "Automation",
  "Wellhead",
  "Flowback",
  "CP Warehouse",
  "Business Team",
];

// ---------------------------------------------------------------------------
// 3. Department → class definitions (R13–R25).
//    Class is the second-level selection under a department. The same class
//    lists apply across all four classification types (Task/Project/OKR/NCR).
// ---------------------------------------------------------------------------
const FIELD_OPS_CLASSES = ["Repair", "Service", "Rental", "Inventory", "Sale Goods"];

export const OMP_DEPARTMENT_CLASSES = {
  "Automation": [...FIELD_OPS_CLASSES],
  "Wellhead": [...FIELD_OPS_CLASSES],
  "Flowback": [...FIELD_OPS_CLASSES],
  "CP Warehouse": ["Repair", "Inventory", "Sale Goods"],
  "Business Team": [
    "HR",
    "Accounting",
    "Safety",
    "Sale Team",
    "Marketing",
    "Quality",
    "Leadership",
    "Purchasing",
    "Training",
    "Facility",
    "Maintenance",
    "R&D",
  ],
};

export const getDepartmentClasses = (department) => OMP_DEPARTMENT_CLASSES[department] || [];
export const isValidDepartmentClass = (department, klass) => getDepartmentClasses(department).includes(klass);

// ---------------------------------------------------------------------------
// 4. Shared option sets
// ---------------------------------------------------------------------------
export const OMP_PRIORITIES = ["High", "Medium", "Low"]; // R9/R11

// Recurring-task cadences (R9)
export const OMP_RECURRENCE_DURATIONS = ["Day", "Week", "Month", "Qtr", "Semi Annual", "Annual"];
export const OMP_RECURRENCE_REPEATS = ["Week", "Month", "Quarter", "Semi Annual", "Annual"];

// OKR report cadence + the editable monthly columns (R32–R35 / AS)
export const OMP_OKR_STATUSES = ["On Track", "At Risk", "Off Track"];
export const OMP_OKR_REPORT_CADENCES = ["Monthly", "Quarterly"];
export const OMP_OKR_MONTHLY_FIELDS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

// ---------------------------------------------------------------------------
// 5. Field matrix per classification type (R8–R35).
//    `auto` fields are system-set and not user-selectable.
//    Use this to render the create/edit forms in the existing vertical layout.
// ---------------------------------------------------------------------------
export const OMP_FIELD_MATRIX = {
  task: {
    label: "Task",
    // A single task vs a recurring task (R8).
    subtypes: [
      { id: "single", label: "Single" },
      { id: "recurring", label: "Recurring" },
    ],
    fields: [
      { key: "title", label: "Title", type: "text", required: true },
      { key: "description", label: "Description", type: "textarea" },
      { key: "priority", label: "Priority", type: "select", options: OMP_PRIORITIES },
      { key: "department", label: "Department", type: "select", options: OMP_DEPARTMENTS, required: true },
      { key: "class", label: "Class", type: "dependent-select", dependsOn: "department" },
      { key: "originator", label: "Originator", type: "auto", selectable: false },
      { key: "assignedTo", label: "Assigned to", type: "user-select" },
      { key: "upload", label: "Upload option", type: "file" },
      { key: "dueDate", label: "Due Date", type: "date" },
    ],
    // Only present when subtype === "recurring" (R9)
    recurringFields: [
      { key: "duration", label: "Duration", type: "select", options: OMP_RECURRENCE_DURATIONS },
      { key: "repeatEvery", label: "Repeating Date", type: "select", options: OMP_RECURRENCE_REPEATS },
    ],
  },

  project: {
    label: "Project",
    fields: [
      { key: "title", label: "Project", type: "text", required: true },
      { key: "projectName", label: "Project Name", type: "text" },
      { key: "scopeOfWork", label: "Scope of work", type: "textarea" },
      { key: "priority", label: "Priority", type: "select", options: OMP_PRIORITIES },
      { key: "timeline", label: "Overall project timeline", type: "daterange" },
      { key: "originator", label: "Originator", type: "auto", selectable: false },
      { key: "assignedTo", label: "Assigned to", type: "user-select" },
      { key: "upload", label: "Upload option", type: "file" },
      { key: "dueDate", label: "Due Date", type: "date" },
    ],
    // Project task assignment table — add as many single-task lines as needed (R10/R11).
    taskTable: {
      addLineLabel: "Add task line",
      columns: [
        { key: "title", label: "Title", type: "text" },
        { key: "description", label: "Description", type: "textarea" },
        { key: "priority", label: "Priority", type: "select", options: OMP_PRIORITIES },
        { key: "department", label: "Department", type: "select", options: OMP_DEPARTMENTS },
        { key: "class", label: "Class", type: "dependent-select", dependsOn: "department" },
        { key: "assignedTo", label: "Assigned to", type: "user-select", note: "multiple allowed" },
        { key: "upload", label: "Upload option", type: "file" },
        { key: "dueDate", label: "Due Date", type: "date" },
      ],
    },
  },

  okr: {
    label: "OKR",
    fields: [
      { key: "department", label: "Department", type: "select", options: OMP_DEPARTMENTS, required: true },
      { key: "class", label: "Class", type: "dependent-select", dependsOn: "department" },
      { key: "auditFormUse", label: "Audit form Use", type: "select", options: ["Y", "N"] },
      { key: "baseline", label: "Baseline", type: "text" },
      { key: "target", label: "Target", type: "text" },
      { key: "assignedTo", label: "Assigned to", type: "user-select", note: "multiple allowed" },
      { key: "status", label: "Status", type: "select", options: OMP_OKR_STATUSES, editableBy: "assignedTo" },
      { key: "reportCadence", label: "Report Cadence", type: "select", options: OMP_OKR_REPORT_CADENCES },
      { key: "rollingAvg", label: "Rolling AVG", type: "auto", note: "auto-calculated from monthly entries" },
      { key: "monthly", label: "Monthly entries", type: "month-grid", fields: OMP_OKR_MONTHLY_FIELDS },
    ],
    // OKR tab permission model (AM–AS).
    permissions: {
      admin: "Edit anything and add new lines.",
      taggedEmployee: "Edit only the line fields they are tagged in.",
      defaultView: "Everyone with access sees the presentation/read view by default.",
      editView: "Table edit view only for the lines a user is tagged in, unless admin.",
      rollingAvg: "Auto-calculated from entered monthly values.",
    },
  },

  ncr: {
    label: "NCR",
    // Per the framework sheet (AU8): keep the existing NCR fields from the
    // conversation with Tim — do not redefine them here. The only hard rule is
    // that NCR department/class selections must match this taxonomy.
    reuseExistingFields: true,
    departmentSource: "OMP_DEPARTMENTS",
    note: "Use existing NCR fields; ensure all department/class selections match the framework taxonomy.",
  },
};

// ---------------------------------------------------------------------------
// 6. Legacy → new department remap (for migrating existing records).
//    PROPOSED mapping — must be confirmed by Tim/Jake before running against
//    production data (see handoff "Open decisions"). `null` = needs human call.
// ---------------------------------------------------------------------------
export const LEGACY_DEPARTMENT_REMAP = {
  "Automation": { department: "Automation", class: null },
  "Operations": { department: null, class: null },        // split across Field depts — confirm
  "Sales": { department: "Business Team", class: "Sale Team" },
  "HR": { department: "Business Team", class: "HR" },
  "Field Operations": { department: null, class: "Service" }, // Wellhead/Flowback/Automation — confirm
  "Quality": { department: "Business Team", class: "Quality" },
  "Shop": { department: null, class: "Repair" },          // confirm department
  "Admin": { department: "Business Team", class: "Accounting" }, // confirm (Accounting vs Purchasing)
  "Safety": { department: "Business Team", class: "Safety" },
  "Leadership": { department: "Business Team", class: "Leadership" },
};

export const getClassificationTypeMeta = (id) =>
  OMP_CLASSIFICATION_TYPES.find(t => t.id === id) || OMP_CLASSIFICATION_TYPES[0];

// ---------------------------------------------------------------------------
// 7. OKR group → framework department (OMP bridge plan, Domain 1 / Human Q2).
//    DECISION (client-confirmed): the 17 OKR groups are kept as a finer SUB-TAG
//    under the canonical 5 departments. Each OKR therefore carries BOTH a
//    department (one of OMP_DEPARTMENTS) and its original group string.
//
//    `confirmed: true`  = mapping is unambiguous from the framework class lists.
//    `confirmed: false` = best-guess that still needs a Tim/Jake call before it
//                         drives production grouping (see UNMAPPED_OKR_GROUPS).
//    Group keys are the EXACT strings from okr2026Consolidated.json.
// ---------------------------------------------------------------------------
export const OKR_GROUP_TO_DEPARTMENT = {
  "COMPANY - TOP LINE": { department: null, class: null, confirmed: true, companyLevel: true },

  "SALES": { department: "Business Team", class: "Sale Team", confirmed: true },
  "Inside Sales": { department: "Business Team", class: "Sale Team", confirmed: true },
  "Marketing": { department: "Business Team", class: "Marketing", confirmed: true },
  "Field Trainers": { department: "Business Team", class: "Training", confirmed: true },
  "Finance / Accounting": { department: "Business Team", class: "Accounting", confirmed: true },
  "HR": { department: "Business Team", class: "HR", confirmed: true },
  "Safety": { department: "Business Team", class: "Safety", confirmed: true },
  "Facility/Yard": { department: "Business Team", class: "Facility", confirmed: true },
  "Quality / Compliance": { department: "Business Team", class: "Quality", confirmed: true },
  "R&D/Engineering / Design": { department: "Business Team", class: "R&D", confirmed: true },
  "CP Warehouse": { department: "CP Warehouse", class: "Inventory", confirmed: true },
  "Flowback Repair": { department: "Flowback", class: "Repair", confirmed: true },
  "I&E- Panels": { department: "Automation", class: "Service", confirmed: true },

  // Approved 2026-07-02 (Jake + Andrew): Field Ops is an ownership group, not a
  // division — objectives keep it as their group and get the department of the
  // work they touch, with Business Team as the default home.
  "Field Ops": { department: "Business Team", class: null, confirmed: true },

  // Best-guess — needs Tim/Jake confirmation before driving prod grouping:
  "Dispatch": { department: "Business Team", class: null, confirmed: false },          // coordinates field ops; no clean class — Business Team? Field dept?
  "Inventory / Logistics": { department: "CP Warehouse", class: "Inventory", confirmed: false }, // vs Business Team/Purchasing
  "Frac Repair": { department: "Wellhead", class: "Repair", confirmed: false },        // frac→wellhead vs flowback
};

export const getOkrGroupDepartment = (group) => OKR_GROUP_TO_DEPARTMENT[group] || null;

// Groups whose department mapping is unconfirmed — surface these for a human
// decision rather than silently bucketing OKRs into a guessed department.
export const UNMAPPED_OKR_GROUPS = Object.entries(OKR_GROUP_TO_DEPARTMENT)
  .filter(([, meta]) => !meta.companyLevel && (!meta.confirmed || !meta.department))
  .map(([group]) => group);

// NCR department_group → Jake's main departments. Confirmed rows follow the
// framework drawing (Quality/Sales/Office are Business Team classes; CP,
// Customer Property, and warehouse Inventory live under CP Warehouse).
// Shop / Operations / Service span multiple divisions — those need Jake's call,
// so they stay unmapped and the list shows their real group name instead.
export const NCR_GROUP_TO_DEPARTMENT = {
  "Automation": "Automation",
  "CP": "CP Warehouse",
  "Customer Property": "CP Warehouse",
  "Inventory": "CP Warehouse",
  "Sales": "Business Team",
  "Office": "Business Team",
  "Quality Control": "Business Team",
};

export const getNcrGroupDepartment = (group) => NCR_GROUP_TO_DEPARTMENT[String(group || "").trim()] || null;

// ============================================================================
// LEGACY NCR TRIAGE — machine-suggested main department, human-approved.
// Keyword rules read the record's own text (event description, worksite area,
// equipment). A suggestion is only "high" confidence when exactly one
// department's signals fire. Humans confirm every write — this never
// auto-assigns (Jake: "channel, don't interpret").
// ============================================================================
const NCR_DEPARTMENT_SIGNALS = [
  { department: "Automation", strong: true, pattern: /\b(msafe|m-safe|esd|hru|telemetry|plc|permissive|mms1|scada|automated (choke|dump|skid|valve)|control panel|automation)\b/i },
  { department: "Flowback", strong: true, pattern: /\b(flowback|flow back|hot oiler|sand trap|plug catcher|manifold trailer|dump skid|choke manifold|iron trailer|floatback)\b/i },
  { department: "Wellhead", strong: true, pattern: /\b(wellhead|well head|crown valve|casing head|tubing head|tubing hanger|tie back hanger|production tree|frac tree|frac valve|gate valve|6bx|bx-?15[0-9]|greas(e|ing) (valve|tree)|lubricator|goat head|zipper)\b/i },
  { department: "CP Warehouse", strong: true, pattern: /\b(warehouse|customer property|customer-owned|storage yard|inventory count|cp warehouse)\b/i },
  { department: "Business Team", strong: true, pattern: /\b(invoice|billing|accounting|payroll|training evaluation|kpa|hr\b|onboarding|marketing|purchase order|sales order)\b/i },
  { department: "Automation", strong: false, pattern: /\b(sensor|controller|software|tablet|riger)\b/i },
  { department: "Wellhead", strong: false, pattern: /\b(valve|hanger|flange|ring gasket|stack)\b/i },
  { department: "Business Team", strong: false, pattern: /\b(office|audit|paperwork|documentation)\b/i },
];

export const suggestNcrDepartment = (report = {}) => {
  const text = [
    report.eventDescription,
    report.normalizedFailureSummary,
    report.affectedEquipment,
    report.affectedProduct,
    report.worksiteArea,
    report.eventType,
    report.immediateAction,
  ].filter(Boolean).join(" \n ");
  if (!text.trim()) return null;

  const hits = new Map(); // department -> { count, strong, reasons }
  for (const rule of NCR_DEPARTMENT_SIGNALS) {
    const match = text.match(rule.pattern);
    if (!match) continue;
    const entry = hits.get(rule.department) || { count: 0, strong: false, reasons: [] };
    entry.count += 1;
    entry.strong = entry.strong || rule.strong;
    entry.reasons.push(`"${match[0].trim()}"`);
    hits.set(rule.department, entry);
  }
  if (hits.size === 0) return null;

  const ranked = [...hits.entries()].sort((a, b) =>
    (Number(b[1].strong) - Number(a[1].strong)) || (b[1].count - a[1].count));
  const [department, top] = ranked[0];
  const conflicted = ranked.length > 1 && ranked[1][1].strong === top.strong && ranked[1][1].count === top.count;
  const confidence = conflicted ? "low" : top.strong && hits.size === 1 ? "high" : top.strong ? "medium" : "low";
  return { department, confidence, reason: `matched ${top.reasons.slice(0, 3).join(", ")}` };
};
