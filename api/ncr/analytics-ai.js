import { getAuthedProfile, getSupabaseAdmin, json } from '../_shared/supabaseAdmin.js';

const PROVISIONAL_FAILURE_CODES = [
  { code: 'HRU', label: 'HRU failure', aliases: ['hru', 'hydraulic release unit'] },
  { code: 'AWC_VALVE', label: 'AWC valve failure', aliases: ['awc valve', 'awc', 'annular well control'] },
  { code: '710_VALVE', label: '710 valve failure', aliases: ['710 valve', '710'] },
  { code: 'EQUIPMENT_FAILURE', label: 'Equipment failure', aliases: ['equipment failure', 'failed', 'failure', 'broken'] },
  { code: 'PROCESS_LOSS', label: 'Process loss', aliases: ['process loss', 'npt', 'non productive'] },
  { code: 'SUBSTANDARD_CONDITION', label: 'Substandard condition', aliases: ['substandard condition', 'condition'] },
];

const readBody = (req) => {
  if (!req.body) return {};
  if (typeof req.body === 'string') return JSON.parse(req.body || '{}');
  return req.body;
};

const normalize = (value = '') => String(value || '')
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, ' ')
  .replace(/\s+/g, ' ')
  .trim();

const classify = (report = {}) => {
  const haystack = normalize([
    report.event_description,
    report.event_type,
    report.root_cause_codes,
    report.root_cause_analysis,
    report.affected_product,
    report.affected_equipment,
    report.operator_location,
    report.normalized_failure_summary,
  ].join(' '));
  const matched = PROVISIONAL_FAILURE_CODES.find(code => code.aliases.some(alias => haystack.includes(normalize(alias))));
  if (matched) return matched.label;
  return report.normalized_failure_summary || report.root_cause_codes || report.event_type || 'Unclassified';
};

const fallbackAnswer = ({ question, reports }) => {
  const query = normalize(question);
  const ignored = new Set(['how', 'many', 'what', 'are', 'the', 'and', 'for', 'with', 'failure', 'failures', 'trending', 'repeat']);
  const tokens = query.split(' ').filter(token => token.length > 1 && !ignored.has(token));
  const counts = reports.reduce((acc, report) => {
    const label = classify(report);
    const normalizedLabel = normalize(label);
    if (!tokens.length || tokens.some(token => normalizedLabel.includes(token) || normalize(report.event_description).includes(token))) {
      acc[label] = acc[label] || { label, count: 0, examples: [] };
      acc[label].count += 1;
      if (acc[label].examples.length < 3) acc[label].examples.push(report.report_number);
    }
    return acc;
  }, {});
  const groups = Object.values(counts).sort((a, b) => b.count - a.count).slice(0, 8);
  return {
    answer: groups.length
      ? groups.map(group => `${group.count} ${group.label}`).join('; ')
      : 'No matching NCR trend group found yet.',
    groups,
    caveats: ['Fallback taxonomy mode. Tim can refine aliases and canonical failure codes after the KPA import.'],
    mode: 'taxonomy_fallback',
  };
};

const callOpenAi = async ({ question, reports }) => {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return null;
  const payload = {
    model: process.env.OPENAI_MODEL || 'gpt-5.5',
    instructions: 'You are SandPro NCR Analytics. Answer Tim Dibben quality trend questions from supplied NCR rows. Return concise valid JSON only.',
    input: JSON.stringify({
      question,
      rows: reports.slice(0, 500).map(report => ({
        reportNumber: report.report_number,
        status: report.closed ? 'closed' : 'open',
        reportDate: report.report_date,
        departmentGroup: report.department_group,
        eventType: report.event_type,
        criticality: report.criticality || report.severity,
        worksiteArea: report.worksite_area,
        operatorLocation: report.operator_location,
        rootCauseCodes: report.root_cause_codes,
        failureGroup: report.normalized_failure_summary,
        eventDescription: report.event_description,
        rootCauseAnalysis: report.root_cause_analysis,
        affectedProduct: report.affected_product,
        affectedEquipment: report.affected_equipment,
      })),
    }),
    text: {
      format: {
        type: 'json_schema',
        name: 'ncr_analytics_answer',
        strict: true,
        schema: {
          type: 'object',
          additionalProperties: false,
          required: ['answer', 'groups', 'caveats'],
          properties: {
            answer: { type: 'string' },
            groups: {
              type: 'array',
              items: {
                type: 'object',
                additionalProperties: false,
                required: ['label', 'count', 'examples'],
                properties: {
                  label: { type: 'string' },
                  count: { type: 'number' },
                  examples: { type: 'array', items: { type: 'string' } },
                },
              },
            },
            caveats: { type: 'array', items: { type: 'string' } },
          },
        },
      },
    },
  };
  const response = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data?.error?.message || `OpenAI HTTP ${response.status}`);
  const text = (data.output || [])
    .flatMap(item => item.content || [])
    .map(part => part.text || '')
    .join('')
    .trim();
  return JSON.parse(text);
};

export default async function handler(req, res) {
  if (req.method !== 'POST') return json(res, 405, { error: 'Method not allowed' });
  try {
    const body = readBody(req);
    const auth = await getAuthedProfile(req, body.accessToken);
    if (auth.error) return json(res, 401, { error: auth.error });

    const question = String(body.question || '').trim();
    if (!question) return json(res, 400, { error: 'question is required.' });

    const supabase = getSupabaseAdmin();
    const { data: reports, error } = await supabase
      .from('ncr_reports')
      .select('report_number,report_date,department_group,event_type,criticality,severity,worksite_area,operator_location,root_cause_codes,normalized_failure_summary,event_description,root_cause_analysis,affected_product,affected_equipment,closed')
      .order('report_date', { ascending: false, nullsFirst: false })
      .limit(500);
    if (error) throw error;

    let result = null;
    if (process.env.OPENAI_API_KEY) {
      try {
        result = await callOpenAi({ question, reports: reports || [] });
      } catch (error) {
        console.warn('[ncr-analytics-ai] OpenAI failed, using fallback', error.message);
      }
    }

    return json(res, 200, result
      ? { ...result, mode: 'openai' }
      : fallbackAnswer({ question, reports: reports || [] }));
  } catch (error) {
    return json(res, 500, { error: error.message || 'NCR analytics failed.' });
  }
}
