// OTTO — the deployed agent inside SandPro's Objective Management Platform.
// Read-only over the org's objectives, people, KPIs, and Fix-It feed; every
// query runs with the caller's own token so RLS decides visibility.
import { runAgent, rest } from './_runtime.js';

const PERSONA = `## WHO YOU ARE
You are OTTO — the operations analyst built into SandPro's Objective Management
Platform (OMP). You live where the company's objectives, key results, KPIs, and
Fix-It feed live, and your job is to make the state of the business legible in
seconds.

## HOW YOU WORK
- Direct and compact: lead with the answer, then the two or three facts that
  support it. Managers are between meetings; respect that.
- Ground every claim in tool data. Never invent numbers, owners, or dates —
  an unknown is reported as unknown.
- When something is blocked or slipping, say so plainly and name the owner.
- Titles are how people find things: quote objective titles exactly.
- You are read-only today: you observe and report; you do not change records.`;

const TOOLS = [
  {
    name: 'list_objectives',
    description: 'List objectives/key results. Filter by status, okr_level (company, department, key_result, project, run_the_business), department, or blockers_only. Sorted by due date.',
    parameters: {
      type: 'object',
      properties: {
        status: { type: 'string', description: 'e.g. in-progress, completed, at-risk' },
        okr_level: { type: 'string' },
        department: { type: 'string' },
        blockers_only: { type: 'boolean' },
        limit: { type: 'number' },
      },
    },
    async execute(args, { token }) {
      let q = 'objectives?select=id,title,status,progress,due_date,department,okr_level,priority,blocker_flag,blocker_reason,owner_id&order=due_date.asc.nullslast';
      if (args.status) q += `&status=eq.${encodeURIComponent(args.status)}`;
      if (args.okr_level) q += `&okr_level=eq.${encodeURIComponent(args.okr_level)}`;
      if (args.department) q += `&department=eq.${encodeURIComponent(args.department)}`;
      if (args.blockers_only) q += '&blocker_flag=eq.true';
      q += `&limit=${Math.min(Number(args.limit) || 25, 50)}`;
      return rest(token, q);
    },
  },
  {
    name: 'get_objective',
    description: 'Full detail for one objective: fields, subtasks, and the latest metric check-ins.',
    parameters: {
      type: 'object',
      properties: { id: { type: 'string', description: 'objective uuid' } },
      required: ['id'],
    },
    async execute(args, { token }) {
      const id = encodeURIComponent(args.id);
      const [objective, subtasks, checkins] = await Promise.all([
        rest(token, `objectives?id=eq.${id}&select=*&limit=1`),
        rest(token, `subtasks?objective_id=eq.${id}&select=title,status,progress,due_date,owner_id,is_milestone&order=due_date.asc.nullslast&limit=20`),
        rest(token, `objective_metric_checkins?objective_id=eq.${id}&select=checkin_date,value,note&order=checkin_date.desc&limit=6`),
      ]);
      return { objective: objective?.[0] ?? null, subtasks, recent_checkins: checkins };
    },
  },
  {
    name: 'find_people',
    description: 'Look up teammates by name, email, or department. Use to resolve owner_id values to real names.',
    parameters: {
      type: 'object',
      properties: { query: { type: 'string' } },
      required: ['query'],
    },
    async execute(args, { token }) {
      const q = encodeURIComponent(`%${args.query}%`);
      return rest(token, `profiles?or=(name.ilike.${q},email.ilike.${q},department.ilike.${q})&select=id,name,title,department,role&limit=15`);
    },
  },
  {
    name: 'kpi_snapshot',
    description: 'The KPI library: definitions with targets and units, plus each KPI\'s latest datapoint.',
    parameters: { type: 'object', properties: { limit: { type: 'number' } } },
    async execute(args, { token }) {
      const defs = await rest(token, `kpi_definitions?select=id,name,unit,target_value,direction&limit=${Math.min(Number(args.limit) || 15, 30)}`);
      const withLatest = await Promise.all((defs ?? []).map(async d => {
        const latest = await rest(token, `kpi_datapoints?kpi_id=eq.${d.id}&select=value,period_date&order=period_date.desc&limit=1`).catch(() => []);
        return { ...d, latest: latest?.[0] ?? null };
      }));
      return withLatest;
    },
  },
  {
    name: 'fixit_recent',
    description: 'Recent posts from the Fix-It continuous-improvement feed.',
    parameters: { type: 'object', properties: { limit: { type: 'number' } } },
    async execute(args, { token }) {
      return rest(token, `fix_it_posts?select=id,title,status,category,created_at&order=created_at.desc&limit=${Math.min(Number(args.limit) || 10, 25)}`);
    },
  },
];

export default async function handler(req, res) {
  return runAgent({
    req, res,
    agentName: 'OTTO',
    persona: PERSONA,
    toolCatalog: TOOLS,
    callerTag: 'otto-omp',
  });
}
