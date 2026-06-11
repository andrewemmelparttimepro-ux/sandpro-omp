export const OKR_LEVELS = [
  { id: "company", label: "Company OKR", shortLabel: "L1", color: "#111827" },
  { id: "department", label: "Department OKR", shortLabel: "L2", color: "#2563EB" },
  { id: "key_result", label: "Key Result", shortLabel: "KR", color: "#10B981" },
  { id: "project", label: "Project", shortLabel: "Project", color: "#ff7f02" },
  { id: "run_the_business", label: "Run-the-business", shortLabel: "RTB", color: "#64748B" },
  { id: "needs_review", label: "Unclassified", shortLabel: "Unclassified", color: "#94A3B8" },
];

export const OKR_LEVEL_LABELS = OKR_LEVELS.reduce((acc, level) => ({ ...acc, [level.id]: level.label }), {});

export const PROJECT_TYPES = [
  { id: "rnd", label: "R&D" },
  { id: "ops", label: "Ops" },
  { id: "customer", label: "Customer" },
  { id: "internal", label: "Internal" },
];

export const PROJECT_STAGES = [
  { id: "idea", label: "Idea", order: 10 },
  { id: "assessment", label: "Assessment", order: 20 },
  { id: "approved", label: "Approved", order: 30 },
  { id: "active", label: "Active", order: 40 },
  { id: "done", label: "Done", order: 50 },
  { id: "killed", label: "Killed", order: 60 },
];

export const PROJECT_HEALTH = [
  { id: "green", label: "Green", color: "#10B981" },
  { id: "yellow", label: "Yellow", color: "#F59E0B" },
  { id: "red", label: "Red", color: "#EF4444" },
];

export const ASSESSMENT_ARTIFACTS = [
  { key: "economic_evaluation", title: "Economic evaluation", ownerLens: "Sponsor + finance", required: true },
  { key: "risk_assessment", title: "Risk assessment", ownerLens: "Project lead + quality", required: true },
  { key: "quality_review", title: "Quality review forms", ownerLens: "Quality", required: true },
  { key: "viability_review", title: "Product viability review", ownerLens: "Sponsor", required: true },
  { key: "required_approvals", title: "Required approvals", ownerLens: "Approval matrix", required: true },
  { key: "next_steps_ownership", title: "Next steps + ownership", ownerLens: "Project lead", required: true },
];

export const REQUIRED_SIGNATURE_ROLES = [
  { role: "sponsor", label: "Sponsor" },
  { role: "quality", label: "Quality" },
  { role: "finance", label: "Finance" },
  { role: "senior_management", label: "Senior management" },
];

// Deliberately narrow: these must signal stage-gated project work, not everyday
// ops language. Words like "build", "implement", "install", "deploy" matched half
// of normal oilfield work items and produced confidently-wrong Project labels.
const PROJECT_KEYWORDS = [
  "project",
  "prototype",
  "pilot",
  "r&d",
  "research",
  "feasibility",
  "new product",
  "stage gate",
];

// DEFAULT pending Jake decision #5 (approval matrix + $ threshold).
// Senior management signoff is only gate-blocking at/above this budget,
// or when a project is explicitly flagged requiresSeniorApproval.
export const SENIOR_APPROVAL_BUDGET_THRESHOLD = 25000;

export const isOkrClassificationUncertain = (objective = {}) => (
  (objective.okrLevel || objective.okr_level) === "needs_review"
  || (objective.classificationStatus || objective.classification_status) === "needs_review"
  || Number(objective.classificationConfidence ?? objective.classification_confidence ?? 100) < 80
);

export const getCurrentOkrPeriod = (date = new Date()) => {
  const month = date.getMonth();
  const quarter = Math.floor(month / 3) + 1;
  return `${date.getFullYear()}-Q${quarter}`;
};

export const getOkrLevelMeta = (level) => OKR_LEVELS.find(item => item.id === level) || OKR_LEVELS[OKR_LEVELS.length - 1];
export const getProjectStageMeta = (stage) => PROJECT_STAGES.find(item => item.id === stage) || PROJECT_STAGES[0];
export const getProjectHealthMeta = (health) => PROJECT_HEALTH.find(item => item.id === health) || PROJECT_HEALTH[0];

const hasNumber = (value) => value !== null && value !== undefined && value !== "" && Number.isFinite(Number(value));

export const hasMetricTarget = (objective = {}) => (
  hasNumber(objective.baselineMetric ?? objective.baseline_metric)
  && hasNumber(objective.targetMetric ?? objective.target_metric)
);

export const computeMetricProgress = (objective = {}) => {
  const baseline = Number(objective.baselineMetric ?? objective.baseline_metric);
  const current = Number(objective.currentMetric ?? objective.current_metric);
  const target = Number(objective.targetMetric ?? objective.target_metric);
  if (![baseline, current, target].every(Number.isFinite) || target === baseline) return null;
  return Math.max(0, Math.min(100, Math.round(((current - baseline) / (target - baseline)) * 100)));
};

export const inferObjectiveClassification = (objective = {}, objectives = []) => {
  if (objective.okrLevel || objective.okr_level) {
    const rawConfidence = Number(objective.classificationConfidence ?? objective.classification_confidence ?? 1);
    return {
      okrLevel: objective.okrLevel || objective.okr_level,
      confidence: rawConfidence > 1 ? rawConfidence / 100 : rawConfidence,
      status: objective.classificationStatus || objective.classification_status || "manual",
      reason: objective.classificationReason || objective.classification_reason || "Existing classification retained.",
    };
  }

  const title = String(objective.title || "").toLowerCase();
  const description = String(objective.description || "").toLowerCase();
  const text = `${title} ${description}`;
  const children = objectives.filter(item => (item.parentId || item.parent_id) === objective.id);
  const parentId = objective.parentId || objective.parent_id;
  const department = String(objective.department || "").toLowerCase();
  const type = String(objective.type || "");
  const metric = hasMetricTarget(objective);

  if (parentId && metric) {
    return { okrLevel: "key_result", confidence: 0.9, status: "auto_classified", reason: "Has a parent objective and numeric baseline/target fields." };
  }
  if (PROJECT_KEYWORDS.some(keyword => text.includes(keyword))) {
    return { okrLevel: "project", confidence: 0.7, status: "needs_review", reason: "Reads like stage-gated project work (keyword match) — confirm and link a Key Result." };
  }
  if (children.length > 0 || type === "parent") {
    const isCompany = !parentId && /leadership|executive|company/.test(department);
    return {
      okrLevel: isCompany ? "company" : "department",
      confidence: isCompany ? 0.82 : 0.76,
      status: "auto_classified",
      reason: "Has child objectives or parent tracking type.",
    };
  }
  if (parentId) {
    return { okrLevel: "needs_review", confidence: 0.6, status: "needs_review", reason: "Linked to a parent but missing the numeric baseline/target a Key Result requires — classify manually." };
  }
  if (metric) {
    return { okrLevel: "key_result", confidence: 0.64, status: "needs_review", reason: "Numeric target exists but no parent OKR is linked yet." };
  }
  if (/admin|operations|shop|safety|hr/.test(department)) {
    return { okrLevel: "run_the_business", confidence: 0.7, status: "auto_classified", reason: "Operational work without OKR hierarchy or KR metrics." };
  }
  return { okrLevel: "needs_review", confidence: 0.5, status: "needs_review", reason: "Not enough structure to classify safely." };
};

export const normalizeObjectiveFramework = (objective = {}, objectives = []) => {
  const inferred = inferObjectiveClassification(objective, objectives);
  return {
    okrLevel: inferred.okrLevel,
    okrPeriod: objective.okrPeriod || objective.okr_period || getCurrentOkrPeriod(),
    okrWeight: Number(objective.okrWeight ?? objective.okr_weight ?? 1) || 1,
    classificationStatus: inferred.status,
    classificationConfidence: Math.round((Number(inferred.confidence) || 0) * 100),
    classificationReason: inferred.reason,
  };
};

export const applyAutoClassification = (objectives = []) => (
  objectives.map(objective => ({
    ...objective,
    ...normalizeObjectiveFramework(objective, objectives),
  }))
);

export const isKeyResultStale = (objective = {}, days = 14) => {
  const level = objective.okrLevel || objective.okr_level;
  if (level !== "key_result") return false;
  const checkins = objective.metricCheckins || [];
  const timestamps = [
    ...checkins.map(item => item.date || item.checkin_date || item.createdAt || item.created_at),
    ...(objective.updates || []).map(item => item.ts || item.created_at),
    objective.createdAt || objective.created_at,
  ].filter(Boolean).map(value => new Date(value).getTime()).filter(Number.isFinite);
  if (!timestamps.length) return true;
  return Math.max(...timestamps) < Date.now() - days * 86400000;
};

export const buildOkrTree = (objectives = [], projects = []) => {
  const byParent = objectives.reduce((acc, objective) => {
    const parentId = objective.parentId || objective.parent_id || "__root__";
    (acc[parentId] = acc[parentId] || []).push(objective);
    return acc;
  }, {});
  const projectsByKr = projects.reduce((acc, project) => {
    const linkedIds = project.linkedObjectiveIds || (project.linkedKrId ? [project.linkedKrId] : []);
    linkedIds.forEach(id => {
      (acc[id] = acc[id] || []).push(project);
    });
    return acc;
  }, {});
  const walk = (objective) => ({
    objective,
    projects: projectsByKr[objective.id] || [],
    children: (byParent[objective.id] || []).map(walk),
  });
  return (byParent.__root__ || []).map(walk);
};

export const buildProjectGateBlockers = (project = {}) => {
  const stage = project.stage || "idea";
  if (!["assessment", "approved", "active", "done"].includes(stage)) return [];
  const artifacts = project.artifacts || [];
  const signatures = project.signatures || [];
  const blockers = [];

  ASSESSMENT_ARTIFACTS.filter(item => item.required).forEach(item => {
    const artifact = artifacts.find(entry => entry.artifactKey === item.key || entry.artifact_key === item.key);
    if (!artifact || !["complete", "waived"].includes(artifact.status)) blockers.push(`${item.title} is required.`);
  });
  const budget = Number(project.budgetEstimate ?? project.budget_estimate ?? 0);
  const needsSeniorApproval = (Number.isFinite(budget) && budget >= SENIOR_APPROVAL_BUDGET_THRESHOLD)
    || Boolean(project.requiresSeniorApproval ?? project.requires_senior_approval);
  REQUIRED_SIGNATURE_ROLES.forEach(item => {
    if (item.role === "senior_management" && !needsSeniorApproval) return;
    const signature = signatures.find(entry => (entry.role || "").toLowerCase() === item.role);
    if (!signature) {
      blockers.push(item.role === "senior_management"
        ? `Senior management signoff is required (budget at or above $${SENIOR_APPROVAL_BUDGET_THRESHOLD.toLocaleString()}).`
        : `${item.label} signoff is required.`);
    }
  });
  if (!project.runTheBusiness && !project.run_the_business && !(project.linkedObjectiveIds || []).length && !(project.linkedKrId || project.linked_kr_id)) {
    blockers.push("Linked Key Result is required unless this is Run-the-business work.");
  }
  return blockers;
};

export const canAdvanceProjectStage = (project = {}, nextStage = project.stage) => {
  const nextOrder = getProjectStageMeta(nextStage).order;
  const assessmentOrder = getProjectStageMeta("approved").order;
  if (nextOrder < assessmentOrder) return { ok: true, blockers: [] };
  const blockers = buildProjectGateBlockers({ ...project, stage: "assessment" });
  return { ok: blockers.length === 0, blockers };
};

export const summarizeFramework = (objectives = [], projects = []) => {
  const activeObjectives = objectives.filter(item => !["completed", "cancelled"].includes(item.status));
  const levelCounts = OKR_LEVELS.reduce((acc, level) => ({
    ...acc,
    [level.id]: objectives.filter(item => item.okrLevel === level.id).length,
  }), {});
  const staleKrs = activeObjectives.filter(isKeyResultStale);
  const projectStageCounts = PROJECT_STAGES.reduce((acc, stage) => ({
    ...acc,
    [stage.id]: projects.filter(project => (project.stage || "idea") === stage.id).length,
  }), {});
  const blockedProjects = projects.filter(project => buildProjectGateBlockers(project).length > 0);
  return {
    levelCounts,
    staleKrs,
    projectStageCounts,
    blockedProjects,
    totalProjects: projects.length,
  };
};

export const buildQuarterlyScorecardRows = (objectives = [], projects = []) => {
  const projectByKr = projects.reduce((acc, project) => {
    const linkedIds = project.linkedObjectiveIds || (project.linkedKrId ? [project.linkedKrId] : []);
    linkedIds.forEach(id => {
      (acc[id] = acc[id] || []).push(project.name || project.title);
    });
    return acc;
  }, {});
  return objectives
    .filter(objective => ["company", "department", "key_result"].includes(objective.okrLevel))
    .map(objective => ({
      title: objective.title,
      level: OKR_LEVEL_LABELS[objective.okrLevel] || "Needs Assessment",
      owner: objective.ownerName || objective.ownerId || "",
      department: objective.department || "",
      period: objective.okrPeriod || getCurrentOkrPeriod(),
      progress: computeMetricProgress(objective) ?? objective.progress ?? 0,
      status: objective.status || "",
      stale: isKeyResultStale(objective) ? "Yes" : "No",
      linkedProjects: (projectByKr[objective.id] || []).join(", "),
    }));
};
