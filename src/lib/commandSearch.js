// Search scoring for the command bar (Over-The-Top item 1). Pure module so
// the component file exports only components (react-refresh rule).
export const PAGES = [
  { id: 'dashboard', label: 'Tasks & Projects' },
  { id: 'okr', label: 'OKR' },
  { id: 'ncr', label: 'NCR' },
  { id: 'kpi', label: 'KPI Command Center' },
  { id: 'organization', label: 'Organization' },
];

const scoreMatch = (haystack, query) => {
  const text = String(haystack || '').toLowerCase();
  if (!text) return 0;
  if (text.startsWith(query)) return 100;
  if (text.includes(` ${query}`)) return 80;
  if (text.includes(query)) return 60;
  return 0;
};

const bodyMatch = (haystack, query) => (String(haystack || '').toLowerCase().includes(query) ? 30 : 0);

export const buildCommandResults = ({ query, objectives, okrProjects, ncrReports, profiles }) => {
  const q = String(query || '').trim().toLowerCase();
  if (!q) return [];

  const results = [];

  for (const page of PAGES) {
    const score = scoreMatch(page.label, q);
    if (score > 0) results.push({ kind: 'page', id: page.id, title: page.label, subtitle: 'Go to page', score: score + 5 });
  }

  for (const o of objectives || []) {
    const score = Math.max(scoreMatch(o.title, q), bodyMatch(o.description, q), bodyMatch(o.nextAction, q));
    if (score > 0) {
      results.push({
        kind: 'task',
        id: o.id,
        title: o.title,
        subtitle: [o.department, o.status ? String(o.status).replace(/_/g, ' ') : null].filter(Boolean).join(' · '),
        score,
        record: o,
      });
    }
  }

  for (const p of okrProjects || []) {
    const score = Math.max(scoreMatch(p.name, q), bodyMatch(p.description, q));
    if (score > 0) results.push({ kind: 'project', id: p.id, title: p.name, subtitle: 'Project', score });
  }

  for (const r of ncrReports || []) {
    const score = Math.max(
      scoreMatch(r.reportNumber, q),
      scoreMatch(r.normalizedFailureSummary, q),
      bodyMatch(r.eventDescription, q),
      bodyMatch(r.rootCauseAnalysis, q),
      bodyMatch(r.operatorLocation, q),
    );
    if (score > 0) {
      results.push({
        kind: 'ncr',
        id: r.id,
        title: r.normalizedFailureSummary || r.eventDescription?.slice(0, 90) || `NCR ${r.reportNumber}`,
        subtitle: [`#${r.reportNumber}`, r.mainDepartment || r.departmentGroup].filter(Boolean).join(' · '),
        legacy: String(r.sourceSystem || '').toUpperCase() === 'KPA',
        score,
      });
    }
  }

  for (const person of profiles || []) {
    const score = Math.max(scoreMatch(person.name, q), scoreMatch(person.email, q), bodyMatch(person.title, q));
    if (score > 0) results.push({ kind: 'person', id: person.id, title: person.name, subtitle: person.title || person.email, score });
  }

  const KIND_CAP = { page: 5, task: 6, project: 4, ncr: 6, person: 5 };
  const capped = [];
  const seenPerKind = {};
  for (const item of results.sort((a, b) => b.score - a.score || String(a.title).localeCompare(String(b.title)))) {
    seenPerKind[item.kind] = (seenPerKind[item.kind] || 0) + 1;
    if (seenPerKind[item.kind] <= (KIND_CAP[item.kind] || 4)) capped.push(item);
    if (capped.length >= 20) break;
  }
  return capped;
};

