export const OBJECTIVE_ASSISTANT_AGENT_KEY = 'objective-assistant';
export const OBJECTIVE_ASSISTANT_RUN_TYPE = 'starter_pack';

export const STARTER_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['title', 'summary', 'nextSteps', 'questions', 'requestedInputs', 'risks', 'sourceLinks', 'markdown'],
  properties: {
    title: { type: 'string' },
    summary: { type: 'string' },
    nextSteps: { type: 'array', items: { type: 'string' } },
    questions: { type: 'array', items: { type: 'string' } },
    requestedInputs: { type: 'array', items: { type: 'string' } },
    risks: { type: 'array', items: { type: 'string' } },
    sourceLinks: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['title', 'url', 'note'],
        properties: {
          title: { type: 'string' },
          url: { type: 'string' },
          note: { type: 'string' },
        },
      },
    },
    markdown: { type: 'string' },
  },
};

const pickDate = (value) => value ? new Date(value).toISOString() : null;

export const buildObjectiveSnapshot = ({ objective, owner, creator, subtasks = [], metricCheckins = [], childObjectives = [], files = [], messages = [] }) => ({
  id: objective.id,
  title: objective.title,
  description: objective.description || '',
  status: objective.status,
  priority: objective.priority,
  progress: objective.progress,
  department: objective.department || '',
  dueDate: pickDate(objective.due_date),
  startDate: pickDate(objective.start_date),
  owner: owner ? { name: owner.name, title: owner.title || '', department: owner.department || '' } : null,
  createdBy: creator ? { name: creator.name, title: creator.title || '' } : null,
  nextAction: objective.next_action || '',
  blocker: objective.blocker_flag ? { flagged: true, reason: objective.blocker_reason || '' } : { flagged: false, reason: '' },
  objectiveType: objective.type || 'simple',
  metrics: {
    baseline: objective.baseline_metric,
    current: objective.current_metric,
    target: objective.target_metric,
    unit: objective.metric_unit || '',
    cadence: objective.measurement_cadence || 'monthly',
  },
  recentMetricCheckins: metricCheckins.slice(-5).map((checkin) => ({
    date: checkin.checkin_date,
    value: Number(checkin.value),
    note: checkin.note || '',
  })),
  subtasks: subtasks.map((subtask) => ({
    title: subtask.title,
    ownerId: subtask.owner_id,
    status: subtask.status,
    progress: subtask.progress,
    dueDate: pickDate(subtask.due_date),
    isMilestone: Boolean(subtask.is_milestone),
  })),
  childObjectives: childObjectives.map((child) => ({
    title: child.title,
    status: child.status,
    progress: child.progress,
    dueDate: pickDate(child.due_date),
  })),
  activityCounts: {
    messages: messages.length,
    files: files.length,
  },
});

export const buildStarterPrompt = ({ snapshot, preparedAt, webSearchEnabled }) => `
You are Objective Assistant inside SandPro OMP. Prepare a practical Objective Starter Pack for the objective below.

Rules:
- Use only the objective snapshot and, when enabled, live web search for recent external context.
- Do not invent facts, commitments, prices, vendor availability, or SandPro internal decisions.
- Do not tell the user to buy anything or contact anyone as if action has already been taken.
- If web search is used, include sourceLinks with direct URLs and one-sentence notes.
- If web search finds nothing clearly relevant, sourceLinks must be an empty array.
- Keep the language practical for busy operators, not technical.
- Return valid JSON matching the requested schema. The markdown field must be a complete readable starter pack.

Prepared at: ${preparedAt}
Web search enabled: ${webSearchEnabled ? 'yes' : 'no'}

Objective snapshot:
${JSON.stringify(snapshot, null, 2)}
`.trim();

const stripCodeFence = (value) => {
  const text = String(value || '').trim();
  const match = text.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  return match ? match[1].trim() : text;
};

export const parseStarterOutput = (rawText) => {
  let parsed;
  try {
    parsed = JSON.parse(stripCodeFence(rawText));
  } catch {
    throw new Error('Objective Assistant returned unreadable output.');
  }

  const stringFields = ['title', 'summary', 'markdown'];
  for (const field of stringFields) {
    if (!parsed[field] || typeof parsed[field] !== 'string') {
      throw new Error(`Objective Assistant output is missing ${field}.`);
    }
  }

  for (const field of ['nextSteps', 'questions', 'requestedInputs', 'risks', 'sourceLinks']) {
    if (!Array.isArray(parsed[field])) throw new Error(`Objective Assistant output is missing ${field}.`);
  }

  for (const source of parsed.sourceLinks) {
    if (!source || typeof source.title !== 'string' || typeof source.url !== 'string' || typeof source.note !== 'string') {
      throw new Error('Objective Assistant source links are malformed.');
    }
  }

  return {
    title: parsed.title.trim(),
    summary: parsed.summary.trim(),
    nextSteps: parsed.nextSteps.map(String).filter(Boolean).slice(0, 5),
    questions: parsed.questions.map(String).filter(Boolean).slice(0, 8),
    requestedInputs: parsed.requestedInputs.map(String).filter(Boolean).slice(0, 8),
    risks: parsed.risks.map(String).filter(Boolean).slice(0, 8),
    sourceLinks: parsed.sourceLinks.map((source) => ({
      title: source.title.trim(),
      url: source.url.trim(),
      note: source.note.trim(),
    })).filter(source => source.title && source.url),
    markdown: parsed.markdown.trim(),
  };
};

export const extractOpenAiText = (payload = {}) => {
  if (typeof payload.output_text === 'string' && payload.output_text.trim()) return payload.output_text;
  const chunks = [];
  for (const item of payload.output || []) {
    for (const content of item.content || []) {
      if (content.type === 'output_text' && content.text) chunks.push(content.text);
      if (content.type === 'text' && content.text) chunks.push(content.text);
    }
  }
  return chunks.join('\n').trim();
};

export const starterMarkdownFallback = ({ result, preparedAt, objectiveTitle }) => {
  const list = (items) => items?.length ? items.map(item => `- ${item}`).join('\n') : '- None identified.';
  const sources = result.sourceLinks?.length
    ? result.sourceLinks.map(source => `- [${source.title}](${source.url}) - ${source.note}`).join('\n')
    : '- No outside sources were used or found.';

  return `# ${result.title || `Objective Starter Pack: ${objectiveTitle}`}

Prepared by Objective Assistant on ${preparedAt}.

## Summary
${result.summary}

## First Next Steps
${list(result.nextSteps)}

## Questions To Answer
${list(result.questions)}

## Files Or Inputs To Request
${list(result.requestedInputs)}

## Risks To Watch
${list(result.risks)}

## Source Links
${sources}
`;
};

export const buildFallbackStarterResult = ({ snapshot, preparedAt }) => {
  const ownerName = snapshot.owner?.name || 'the objective owner';
  const dueText = snapshot.dueDate
    ? new Date(snapshot.dueDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
    : 'No due date set';
  const nextAction = snapshot.nextAction?.trim();
  const hasMetrics = snapshot.metrics?.target || snapshot.metrics?.current || snapshot.metrics?.baseline;

  const result = {
    title: `Objective Starter Pack: ${snapshot.title}`,
    summary: `This starter pack was prepared from the objective details already in SandPro OMP. ${ownerName} owns the next move, and the current target date is ${dueText}.`,
    nextSteps: [
      nextAction ? `Start with the recorded next action: ${nextAction}` : 'Write one concrete next action so the objective has a clear first move.',
      `Confirm who besides ${ownerName} should help, approve, or supply information for this objective.`,
      'Add the first update or file so the team can see what has already been gathered.',
    ],
    questions: [
      'What does “done” look like for this objective?',
      'Who needs to approve or review the work before it can be considered complete?',
      'What information is missing right now?',
      'Is the current due date still realistic?',
    ],
    requestedInputs: [
      'Any current notes, emails, drawings, screenshots, or reference files tied to the objective.',
      'Names of the people who should provide input or approval.',
      hasMetrics ? 'The latest metric/check-in value and the source behind it.' : 'A simple success measure or acceptance checklist.',
    ],
    risks: [
      'The objective may stall if the first next action is not specific enough.',
      'Work may stay with the owner only unless the right supporting teammate is tagged.',
      'The due date may become unreliable if updates are not recorded as work changes.',
    ],
    sourceLinks: [],
  };
  return {
    ...result,
    markdown: starterMarkdownFallback({ result, preparedAt, objectiveTitle: snapshot.title }),
  };
};

export const formatBytes = (bytes) => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};
