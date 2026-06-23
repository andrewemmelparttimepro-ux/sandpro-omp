import { createClient } from '@supabase/supabase-js';
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const loadEnvFile = (filename) => {
  const path = resolve(process.cwd(), filename);
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#') || !trimmed.includes('=')) continue;
    const [rawKey, ...rest] = trimmed.split('=');
    const key = rawKey.trim();
    const value = rest.join('=').trim().replace(/^['"]|['"]$/g, '').replace(/\\n/g, '');
    if (key && process.env[key] === undefined) process.env[key] = value;
  }
};

loadEnvFile('.env.release.local');
loadEnvFile('.env.local');
loadEnvFile('.vercel/.env.production.local');
loadEnvFile('.env.production.local');

const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;
const anonKey = process.env.VITE_SUPABASE_ANON_KEY;

if (!url) {
  console.error('Missing SUPABASE_URL or VITE_SUPABASE_URL.');
  process.exit(1);
}

const checks = [
  ['profiles avatar column', 'profiles', 'id,avatar_url'],
  ['objective_members table', 'objective_members', 'id,objective_id,user_id,role,created_at'],
  ['objective_metric_checkins table', 'objective_metric_checkins', 'id,objective_id,checkin_date,value,note,created_by'],
  ['kpi_definitions table', 'kpi_definitions', 'id,name,description,category,department,owner_id,unit,direction,target_value,yellow_min,yellow_max,red_min,red_max,thresholds_json,source_type,formula_json,cadence,status,created_by,created_at,updated_at'],
  ['kpi_datapoints table', 'kpi_datapoints', 'id,kpi_id,period_start,period_end,value,denominator,dimensions_json,source_label,source_ref,imported_by,created_at'],
  ['kpi_objective_links table', 'kpi_objective_links', 'id,kpi_id,objective_id,relationship,created_by,created_at'],
  ['kpi_checkins table', 'kpi_checkins', 'id,kpi_id,note,status,created_by,created_at'],
  ['kpi_alert_rules table', 'kpi_alert_rules', 'id,kpi_id,severity,condition_json,enabled,created_by,created_at,updated_at'],
  ['kpi_alert_events table', 'kpi_alert_events', 'id,kpi_id,rule_id,severity,status,title,message,triggered_value,triggered_at,acknowledged_by,acknowledged_at,created_at'],
  ['kpi_import_batches table', 'kpi_import_batches', 'id,source_label,file_name,imported_by,total_rows,imported_rows,error_rows,errors,status,created_at,completed_at'],
  ['objective_workflow_steps table', 'objective_workflow_steps', 'id,objective_id,title,description,step_order,status,owner_id,due_date,completed_at,completed_by,updated_at'],
  ['objective_agent_runs table', 'objective_agent_runs', 'id,objective_id,requested_by,agent_key,run_type,status,input_snapshot,output_summary,output_json,source_links,file_id,error,completed_at'],
  ['OKR projects table', 'okr_projects', 'id,name,description,project_type,linked_kr_id,run_the_business,sponsor_id,lead_id,stage,health,health_comment,start_date,target_date,next_milestone,next_milestone_due_date,budget_estimate,created_by,created_at,updated_at'],
  ['OKR project KR links table', 'okr_project_kr_links', 'id,project_id,objective_id,created_by,created_at'],
  ['OKR assessment artifacts table', 'okr_assessment_artifacts', 'id,project_id,artifact_key,title,owner_id,status,response_json,summary,completed_at,completed_by,created_at,updated_at'],
  ['OKR project signatures table', 'okr_project_signatures', 'id,project_id,role,signed_by,signed_by_name,signature_data_url,note,signed_at,created_by,created_at'],
  ['OKR project attachments table', 'okr_project_attachments', 'id,project_id,artifact_id,uploaded_by,name,purpose,type,mime_type,size,storage_path,url,created_at'],
  ['OKR project audit table', 'okr_project_audit_events', 'id,project_id,actor_id,event_type,field_name,old_value,new_value,note,created_at'],
  ['notifications sender priority columns', 'notifications', 'id,user_id,sender_id,type,objective_id,message,priority,detail_label,detail_text,is_read,created_at'],
  ['notification_preferences table', 'notification_preferences', 'user_id,email_enabled,due_reminders,overdue_alerts,blocker_alerts,comment_notifications,delegation_alerts,digest_frequency'],
  ['email_delivery_log table', 'email_delivery_log', 'id,user_id,objective_id,notification_type,dedupe_key,recipient,subject,status,sent_at'],
  ['push_subscriptions table', 'push_subscriptions', 'id,user_id,endpoint,p256dh,auth,device_label,user_agent,platform,is_pwa,active,revoked_at,last_seen_at,updated_at'],
  ['push_delivery_log table', 'push_delivery_log', 'id,user_id,notification_id,objective_id,type,subscription_id,status,error,sent_at'],
  ['alt_dashboard_preferences table', 'alt_dashboard_preferences', 'user_id,last_dashboard_mode,selected_time_key,compute_mode,sound_enabled,widget_slots,pinned_people,pinned_objectives,manual_order,notes_state,updated_at'],
  ['alt_dashboard_presence table', 'alt_dashboard_presence', 'user_id,last_seen_at,updated_at'],
  ['alt_dashboard_note_folders table', 'alt_dashboard_note_folders', 'id,user_id,name,icon,sort_order,created_at,updated_at'],
  ['alt_dashboard_notes table', 'alt_dashboard_notes', 'id,user_id,folder_id,objective_id,title,body_json,plain_text,preview,pinned,archived_at,deleted_at,created_at,updated_at,last_edited_at'],
  ['alt_dashboard_note_attachments table', 'alt_dashboard_note_attachments', 'id,user_id,note_id,storage_path,name,mime_type,size,created_at,updated_at'],
  ['message_reactions table', 'message_reactions', 'id,message_id,user_id,reaction,created_at,updated_at'],
  ['objective_message_reads table', 'objective_message_reads', 'objective_id,user_id,last_read_at,updated_at'],
  ['fix_it_posts table', 'fix_it_posts', 'id,body,created_by,claimed_by,agent_tested_by,agent_tested_at,human_reviewed_by,human_reviewed_at,archived_by,archived_at,reopened_by,reopened_at,reopen_count,reopened_from_status,status,created_at,updated_at'],
  ['fix_it_comments table', 'fix_it_comments', 'id,post_id,body,created_by,created_at,updated_at'],
  ['fix_it_attachments table', 'fix_it_attachments', 'id,post_id,comment_id,uploaded_by,name,purpose,type,mime_type,size,storage_path,url,created_at'],
  ['ncr_reports table', 'ncr_reports', 'id,report_number,source_sheet,report_date,worksite_area,operator_location,event_at,internal_external,event_type,event_types,non_productive_time,non_productive_time_amount,estimated_cost,criticality,author,author_id,personnel_involved,personnel_involved_ids,event_description,severity,root_cause_codes,root_cause_analysis,immediate_action,time_frame_for_action,permanent_action,affected_departments,affected_department_list,department_group,long_term_follow_up,action_effective,date_initial_corrective_action,date_permanent_corrective_action_completed,date_of_review,date_of_sign_off,signed_off_by_management_id,reviewed_by_id,final_management_signoff_id,source_system,source_record_id,source_batch_id,source_raw_record,canonical_failure_code,normalized_failure_summary,ai_confidence,ai_classification_reason,status,closed,lifecycle_stage,owner_id,reviewer_id,verifier_id,closure_approved_by,closure_approved_at,containment_required,containment_summary,affected_product,affected_equipment,affected_job,disposition,disposition_notes,effectiveness_summary,effectiveness_checked_at,effectiveness_checked_by,recurrence_prevented,repeat_issue,customer_approval_required,customer_approval_status,linked_objective_id,follow_up_due_date'],
  ['ncr_action_items table', 'ncr_action_items', 'id,ncr_id,title,owner_id,due_date,status,evidence_notes,completed_at,completed_by,created_by,created_at,updated_at'],
  ['ncr_attachments table', 'ncr_attachments', 'id,ncr_id,action_item_id,uploaded_by,name,purpose,type,mime_type,size,storage_path,url,created_at'],
  ['ncr_audit_events table', 'ncr_audit_events', 'id,ncr_id,actor_id,event_type,field_name,old_value,new_value,note,created_at'],
  ['ncr_import_batches table', 'ncr_import_batches', 'id,source_system,file_name,imported_by,total_rows,imported_rows,error_rows,errors,status,created_at,completed_at'],
  ['ncr_signatures table', 'ncr_signatures', 'id,ncr_id,role,signed_by,signed_by_name,signature_data_url,signed_at,created_by,created_at'],
  ['ncr_failure_codes table', 'ncr_failure_codes', 'id,code,label,category,aliases,tim_approved,active,created_by,created_at,updated_at'],
  ['org_chart_updates table', 'org_chart_updates', 'id,changed_user_id,changed_by,note,old_value,new_value,created_at'],
  ['org_chart_placeholders table', 'org_chart_placeholders', 'id,name,title,department,reports_to,color,created_by,created_at,updated_at'],
  ['files release columns', 'files', 'id,message_id,uploaded_by,mime_type,storage_path,agent_run_id,generated_by_agent'],
  ['objectives release columns', 'objectives', 'id,measurement_cadence,rollup_method,okr_level,okr_period,okr_weight,classification_status,classification_confidence,classification_reason'],
  ['subtasks release columns', 'subtasks', 'id,due_date,weight,is_milestone,milestone_date'],
  ['objective_updates release columns', 'objective_updates', 'id,user_id,action_type,old_value,new_value,reference_id'],
];

const wait = (ms) => new Promise((resolveDelay) => setTimeout(resolveDelay, ms));

const withRetry = async (action, { attempts = 3, label = 'request' } = {}) => {
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const result = await action();
      if (result?.error && /fetch failed|network|ECONNRESET|ENOTFOUND|ETIMEDOUT/i.test(String(result.error.message || result.error))) {
        throw result.error;
      }
      return result;
    } catch (error) {
      lastError = error;
      const message = String(error?.message || error);
      const shouldRetry = /fetch failed|network|ECONNRESET|ENOTFOUND|ETIMEDOUT/i.test(message);
      if (!shouldRetry || attempt === attempts) break;
      console.warn(`retry ${label}: attempt ${attempt} failed (${message})`);
      await wait(250 * attempt);
    }
  }
  throw lastError;
};

const runClientChecks = async (key, canCheckStorage) => {
  const supabase = createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  let failed = false;
  for (const [name, table, columns] of checks) {
    let result;
    try {
      result = await withRetry(
        () => supabase.from(table).select(columns).limit(1),
        { label: name },
      );
    } catch (error) {
      failed = true;
      console.error(`x ${name}: ${error.message || error}`);
      continue;
    }
    const { error } = result;
    if (error) {
      failed = true;
      console.error(`x ${name}: ${error.message}`);
    } else {
      console.log(`ok ${name}`);
    }
  }

  if (canCheckStorage) {
    let bucketResult;
    try {
      bucketResult = await withRetry(
        () => supabase.storage.listBuckets(),
        { label: 'storage buckets' },
      );
    } catch (error) {
      failed = true;
      console.error(`x storage buckets: ${error.message || error}`);
      return failed;
    }
    const { data: buckets, error: bucketError } = bucketResult;
    if (bucketError) {
      failed = true;
      console.error(`x storage buckets: ${bucketError.message}`);
    } else if (!buckets.some((bucket) => bucket.id === 'objective-files' && bucket.public === false)) {
      failed = true;
      console.error('x objective-files bucket: missing or not private');
    } else if (!buckets.some((bucket) => bucket.id === 'fix-it-files' && bucket.public === false)) {
      failed = true;
      console.error('x fix-it-files bucket: missing or not private');
    } else if (!buckets.some((bucket) => bucket.id === 'ncr-files' && bucket.public === false)) {
      failed = true;
      console.error('x ncr-files bucket: missing or not private');
    } else if (!buckets.some((bucket) => bucket.id === 'okr-project-files' && bucket.public === false)) {
      failed = true;
      console.error('x okr-project-files bucket: missing or not private');
    } else if (!buckets.some((bucket) => bucket.id === 'alt-note-files' && bucket.public === false)) {
      failed = true;
      console.error('x alt-note-files bucket: missing or not private');
    } else if (!buckets.some((bucket) => bucket.id === 'profile-avatars' && bucket.public === true)) {
      failed = true;
      console.error('x profile-avatars bucket: missing or not public');
    } else {
      console.log('ok private objective-files bucket');
      console.log('ok private fix-it-files bucket');
      console.log('ok private ncr-files bucket');
      console.log('ok private okr-project-files bucket');
      console.log('ok private alt-note-files bucket');
      console.log('ok public profile-avatars bucket');
    }
  }

  return failed;
};

const cliAvailable = () => {
  const result = spawnSync('supabase', ['--version'], { encoding: 'utf8' });
  return result.status === 0;
};

const sqlLiteral = (value) => `'${String(value).replaceAll("'", "''")}'`;

const runLinkedCliChecks = () => {
  const expectedColumns = checks.flatMap(([, table, columns]) => columns.split(',').map((column) => ({ table, column })));
  const sql = `
with expected_tables(table_name) as (
  values ${checks.map(([, table]) => `(${sqlLiteral(table)})`).join(',\n  ')}
),
expected_columns(table_name, column_name) as (
  values ${expectedColumns.map(({ table, column }) => `(${sqlLiteral(table)}, ${sqlLiteral(column)})`).join(',\n  ')}
),
table_checks as (
  select
    'table ' || table_name as check_name,
    to_regclass('public.' || table_name) is not null as ok
  from expected_tables
),
column_checks as (
  select
    table_name || '.' || column_name as check_name,
    exists (
      select 1 from information_schema.columns
      where table_schema = 'public'
        and table_name = expected_columns.table_name
        and column_name = expected_columns.column_name
    ) as ok
  from expected_columns
),
bucket_checks as (
  select
    'private objective-files bucket' as check_name,
    exists (select 1 from storage.buckets where id = 'objective-files' and public = false) as ok
  union all
  select
    'private fix-it-files bucket' as check_name,
    exists (select 1 from storage.buckets where id = 'fix-it-files' and public = false) as ok
  union all
  select
    'private ncr-files bucket' as check_name,
    exists (select 1 from storage.buckets where id = 'ncr-files' and public = false) as ok
  union all
  select
    'private okr-project-files bucket' as check_name,
    exists (select 1 from storage.buckets where id = 'okr-project-files' and public = false) as ok
  union all
  select
    'private alt-note-files bucket' as check_name,
    exists (select 1 from storage.buckets where id = 'alt-note-files' and public = false) as ok
  union all
  select
    'public profile-avatars bucket' as check_name,
    exists (select 1 from storage.buckets where id = 'profile-avatars' and public = true) as ok
)
select * from table_checks
union all select * from column_checks
union all select * from bucket_checks
order by check_name;
`;

  const result = spawnSync('supabase', ['db', 'query', '--linked', '--output', 'json', sql], {
    encoding: 'utf8',
    cwd: process.cwd(),
    maxBuffer: 1024 * 1024 * 4,
  });

  if (result.status !== 0) {
    console.error(result.stderr || result.stdout);
    return true;
  }

  let payload;
  try {
    payload = JSON.parse(result.stdout);
  } catch {
    console.error('Could not parse Supabase CLI schema-check output.');
    console.error(result.stdout);
    return true;
  }

  const rows = payload.rows || [];
  let failed = false;
  for (const row of rows) {
    if (row.ok) {
      console.log(`ok ${row.check_name}`);
    } else {
      failed = true;
      console.error(`x ${row.check_name}`);
    }
  }
  return failed;
};

let failed;
if (serviceKey) {
  failed = await runClientChecks(serviceKey, true);
} else if (cliAvailable() && existsSync(resolve(process.cwd(), 'supabase/.temp/project-ref'))) {
  failed = runLinkedCliChecks();
} else if (anonKey) {
  console.warn('Warning: SUPABASE_SERVICE_ROLE_KEY is missing; using anon REST schema-cache checks only.');
  failed = await runClientChecks(anonKey, false);
  console.warn('Warning: private storage bucket could not be validated without service role or linked Supabase CLI.');
  failed = true;
} else {
  console.error('Missing SUPABASE_SERVICE_ROLE_KEY, linked Supabase CLI, or VITE_SUPABASE_ANON_KEY for schema validation.');
  process.exit(1);
}

if (failed) process.exit(1);
console.log('Release schema check passed.');
