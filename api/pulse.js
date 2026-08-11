// Over-The-Top item 8: the leadership one-pager — named COMPANY PULSE on
// purpose (no audience in the name). One live page behind a signed link, no
// login: the four company objectives with real progress, active work by
// department, slippage, quality exposure. Every time an executive asks a
// human for a number, the product has failed silently; this page is the
// number's home instead. Links live in pulse_links (service-role only,
// revocable per row) — rollout is Andrew-first per the 8/11 standing rule.
import { getSupabaseAdmin, json } from './_shared/supabaseAdmin.js';
import { OMP_DEPARTMENTS, getOkrGroupDepartment } from '../src/ompFramework.js';

const DAY_MS = 86400000;

const esc = (value = '') => String(value)
  .replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;').replaceAll("'", '&#039;');

const chicagoNow = () => new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Chicago' }));
const startOfDay = (value) => {
  const d = new Date(value);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
};

const isOpenObjective = (o) => o.status !== 'completed' && o.status !== 'cancelled';
const isLegacyNcr = (r) => String(r.source_system || '').toUpperCase() === 'KPA';
const isOpenNcr = (r) => !(r.closed || r.status === 'closed' || r.lifecycle_stage === 'closed');

const resolveDepartment = (o) => {
  if (OMP_DEPARTMENTS.includes(o.department)) return o.department;
  return getOkrGroupDepartment(o.okr_group)?.department || 'Unmapped';
};

// Pure model builder — unit-locked. `now` injected for determinism.
export const buildPulseModel = ({ objectives = [], progressRows = [], ncrReports = [], now = chicagoNow() }) => {
  const today = startOfDay(now);
  const weekAgo = new Date(today.getTime() - 7 * DAY_MS);
  const weekAhead = new Date(today.getTime() + 7 * DAY_MS);
  const daysPast = (due) => Math.round((today - startOfDay(due)) / DAY_MS);

  const derivedById = new Map(progressRows.map((row) => [row.id, row]));
  const progressOf = (o) => {
    const derived = derivedById.get(o.id);
    const value = derived?.derived_progress ?? o.progress ?? 0;
    return Math.max(0, Math.min(100, Math.round(Number(value) || 0)));
  };

  const companyObjectives = objectives
    .filter((o) => o.okr_level === 'company' && o.status !== 'cancelled')
    .sort((a, b) => String(a.title).localeCompare(String(b.title)))
    .map((o) => ({
      title: o.title,
      status: o.status,
      progress: progressOf(o),
      source: derivedById.get(o.id)?.progress_source || 'manual',
    }));

  const working = objectives.filter((o) => o.okr_level !== 'company' && isOpenObjective(o));
  const departments = [...OMP_DEPARTMENTS, 'Unmapped'].map((name) => {
    const rows = working.filter((o) => resolveDepartment(o) === name);
    return {
      name,
      active: rows.length,
      atRisk: rows.filter((o) => o.status === 'at_risk').length,
      blocked: rows.filter((o) => o.status === 'blocked').length,
      pastDue: rows.filter((o) => o.due_date && daysPast(o.due_date) > 0).length,
    };
  }).filter((dept) => dept.name !== 'Unmapped' || dept.active > 0);

  const slipped = working
    .filter((o) => o.due_date && daysPast(o.due_date) > 0)
    .sort((a, b) => daysPast(b.due_date) - daysPast(a.due_date));
  const slippage = {
    count: slipped.length,
    dueThisWeek: working.filter((o) => {
      if (!o.due_date) return false;
      const due = startOfDay(o.due_date);
      return due >= today && due < weekAhead;
    }).length,
    completedThisWeek: objectives.filter((o) => (
      o.okr_level !== 'company' && o.status === 'completed' && o.updated_at && new Date(o.updated_at) >= weekAgo
    )).length,
    worst: slipped.slice(0, 6).map((o) => ({
      title: o.title,
      department: resolveDepartment(o),
      days: daysPast(o.due_date),
    })),
  };

  const organic = ncrReports.filter((r) => !isLegacyNcr(r));
  const quality = {
    open: organic.filter(isOpenNcr).length,
    openedThisWeek: organic.filter((r) => r.created_at && new Date(r.created_at) >= weekAgo).length,
    closedThisWeek: organic.filter((r) => !isOpenNcr(r) && r.updated_at && new Date(r.updated_at) >= weekAgo).length,
    legacyBacklog: ncrReports.filter((r) => isLegacyNcr(r) && isOpenNcr(r)).length,
  };

  return { companyObjectives, departments, slippage, quality, generatedAt: now };
};

const statusTone = (status) => ({
  on_track: '#0D7A3E',
  at_risk: '#b45309',
  blocked: '#b91c1c',
  not_started: '#6b7280',
  completed: '#1d4ed8',
}[status] || '#6b7280');

const statusLabel = (status) => ({
  on_track: 'On track',
  at_risk: 'At risk',
  blocked: 'Blocked',
  not_started: 'Not started',
  completed: 'Completed',
}[status] || status || '—');

export const renderPulseHtml = (model) => {
  const dateLine = model.generatedAt.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
  const timeLine = model.generatedAt.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  const objectiveRows = model.companyObjectives.map((o) => `
    <div class="objective" data-pulse-objective>
      <div class="objective-head">
        <strong>${esc(o.title)}</strong>
        <span style="color:${statusTone(o.status)};">${esc(statusLabel(o.status))} · ${o.progress}%</span>
      </div>
      <div class="bar"><span style="width:${o.progress}%;"></span></div>
    </div>`).join('');
  const deptRows = model.departments.map((d) => `
    <tr>
      <td>${esc(d.name)}</td>
      <td class="num">${d.active}</td>
      <td class="num ${d.pastDue ? 'warn' : ''}">${d.pastDue}</td>
      <td class="num ${d.atRisk ? 'warn' : ''}">${d.atRisk}</td>
      <td class="num ${d.blocked ? 'bad' : ''}">${d.blocked}</td>
    </tr>`).join('');
  const slipRows = model.slippage.worst.map((s) => `
    <li><strong>${esc(s.title)}</strong><span>${esc(s.department)} · ${s.days}d over</span></li>`).join('');
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>Company Pulse — SandPro OMP</title>
<style>
  * { box-sizing: border-box; margin: 0; }
  body { font-family: -apple-system, 'Segoe UI', Arial, sans-serif; color: #111827; background: #f6f5f2; padding: 24px 16px; }
  .page { max-width: 680px; margin: 0 auto; background: #fff; border-radius: 14px; padding: 28px 30px 22px; box-shadow: 0 10px 40px rgba(17,24,39,0.08); }
  .masthead { border-bottom: 3px solid #111827; padding-bottom: 14px; }
  .kicker { font-size: 11px; letter-spacing: 2.5px; color: #ff7f02; font-weight: 700; }
  h1 { font-size: 26px; margin-top: 6px; }
  .dateline { font-size: 12.5px; color: #6b7280; margin-top: 4px; }
  h2 { font-size: 11px; letter-spacing: 1.8px; color: #9a8f7d; margin: 26px 0 10px; text-transform: uppercase; }
  .objective { margin-bottom: 12px; }
  .objective-head { display: flex; justify-content: space-between; gap: 12px; font-size: 14px; margin-bottom: 5px; }
  .objective-head span { flex-shrink: 0; font-size: 12.5px; font-weight: 700; }
  .bar { height: 7px; border-radius: 999px; background: #eceae5; overflow: hidden; }
  .bar span { display: block; height: 100%; border-radius: 999px; background: #ff7f02; }
  table { width: 100%; border-collapse: collapse; font-size: 13.5px; }
  th { text-align: left; font-size: 10.5px; letter-spacing: 1px; color: #9ca3af; padding-bottom: 6px; text-transform: uppercase; }
  th.num, td.num { text-align: right; }
  td { padding: 7px 0; border-top: 1px solid #f0efeb; }
  td.warn { color: #b45309; font-weight: 700; }
  td.bad { color: #b91c1c; font-weight: 700; }
  ul { list-style: none; }
  li { padding: 7px 0; border-top: 1px solid #f0efeb; font-size: 13.5px; display: flex; justify-content: space-between; gap: 12px; }
  li span { color: #6b7280; font-size: 12px; flex-shrink: 0; }
  .stats { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; }
  .stat { background: #f8f7f4; border-radius: 10px; padding: 12px; }
  .stat b { display: block; font-size: 22px; }
  .stat small { font-size: 11px; color: #6b7280; }
  .foot { margin-top: 26px; padding-top: 12px; border-top: 1px solid #eceae5; font-size: 11.5px; color: #9ca3af; }
  @media print { body { background: #fff; padding: 0; } .page { box-shadow: none; } }
</style>
</head>
<body>
<div class="page">
  <div class="masthead">
    <div class="kicker">SANDPRO OMP · COMPANY PULSE</div>
    <h1>The week at a glance</h1>
    <div class="dateline">${esc(dateLine)} · live numbers as of ${esc(timeLine)} CT</div>
  </div>

  <h2>Company objectives</h2>
  ${objectiveRows || '<div style="color:#9ca3af;font-size:13px;">No company objectives recorded.</div>'}

  <h2>Active work by department</h2>
  <table>
    <thead><tr><th>Department</th><th class="num">Active</th><th class="num">Past due</th><th class="num">At risk</th><th class="num">Blocked</th></tr></thead>
    <tbody>${deptRows}</tbody>
  </table>

  <h2>Slippage</h2>
  <div class="stats">
    <div class="stat"><b>${model.slippage.count}</b><small>past due now</small></div>
    <div class="stat"><b>${model.slippage.dueThisWeek}</b><small>due this week</small></div>
    <div class="stat"><b>${model.slippage.completedThisWeek}</b><small>closed this week</small></div>
    <div class="stat"><b>${model.quality.open}</b><small>open NCRs</small></div>
  </div>
  ${slipRows ? `<ul style="margin-top:10px;">${slipRows}</ul>` : '<div style="margin-top:10px;color:#0D7A3E;font-size:13px;font-weight:600;">Nothing past due. Clean board.</div>'}

  <h2>Quality exposure</h2>
  <table>
    <tbody>
      <tr><td>Open NCRs (current work)</td><td class="num">${model.quality.open}</td></tr>
      <tr><td>Opened this week</td><td class="num">${model.quality.openedThisWeek}</td></tr>
      <tr><td>Closed this week</td><td class="num">${model.quality.closedThisWeek}</td></tr>
      <tr><td>Legacy import backlog (pre-OMP)</td><td class="num">${model.quality.legacyBacklog}</td></tr>
    </tbody>
  </table>

  <div class="foot">Generated live from objectivetracker.net · This link is private — treat it like a key. Numbers refresh on every open.</div>
</div>
</body>
</html>`;
};

const notFound = (res) => {
  res.statusCode = 404;
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('X-Robots-Tag', 'noindex, nofollow');
  res.end('<!doctype html><meta charset="utf-8"><title>Not found</title><body style="font-family:sans-serif;padding:40px;color:#374151;">This link is not active.</body>');
};

const UUID_RX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function handler(req, res) {
  if (req.method !== 'GET') return json(res, 405, { error: 'Method not allowed.' });
  try {
    const token = String(req.query?.k || '').trim();
    if (!UUID_RX.test(token)) return notFound(res);
    const supabase = getSupabaseAdmin();
    const { data: link } = await supabase
      .from('pulse_links')
      .select('token,revoked')
      .eq('token', token)
      .maybeSingle();
    if (!link || link.revoked) return notFound(res);

    const [objectivesRes, progressRes, ncrRes] = await Promise.all([
      supabase.from('objectives').select('id,title,status,department,okr_group,okr_level,due_date,progress,updated_at'),
      supabase.from('objective_progress_view').select('id,derived_progress,progress_source'),
      supabase.from('ncr_reports').select('id,status,closed,lifecycle_stage,source_system,created_at,updated_at'),
    ]);
    const model = buildPulseModel({
      objectives: objectivesRes.data || [],
      progressRows: progressRes.data || [],
      ncrReports: ncrRes.data || [],
    });

    res.statusCode = 200;
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store, max-age=0');
    res.setHeader('X-Robots-Tag', 'noindex, nofollow');
    res.end(renderPulseHtml(model));
  } catch (error) {
    console.error('[sandpro-pulse] render failed:', error.message);
    return json(res, 500, { error: 'The page could not be generated right now.' });
  }
}
