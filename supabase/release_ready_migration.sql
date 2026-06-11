-- SandPro OMP release-readiness migration.
-- Safe to run after the original migration; all changes are additive/idempotent.

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

ALTER TABLE public.objectives
  ADD COLUMN IF NOT EXISTS measurement_cadence TEXT NOT NULL DEFAULT 'monthly',
  ADD COLUMN IF NOT EXISTS rollup_method TEXT NOT NULL DEFAULT 'average';

ALTER TABLE public.subtasks
  ADD COLUMN IF NOT EXISTS due_date TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS weight NUMERIC NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS is_milestone BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS milestone_date TIMESTAMPTZ;

ALTER TABLE public.objective_updates
  ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES public.profiles(id),
  ADD COLUMN IF NOT EXISTS action_type TEXT NOT NULL DEFAULT 'status/progress_update',
  ADD COLUMN IF NOT EXISTS old_value TEXT,
  ADD COLUMN IF NOT EXISTS new_value TEXT,
  ADD COLUMN IF NOT EXISTS reference_id TEXT;

ALTER TABLE public.files
  ADD COLUMN IF NOT EXISTS message_id UUID REFERENCES public.messages(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS uploaded_by UUID REFERENCES public.profiles(id),
  ADD COLUMN IF NOT EXISTS mime_type TEXT DEFAULT '',
  ADD COLUMN IF NOT EXISTS storage_path TEXT,
  ADD COLUMN IF NOT EXISTS generated_by_agent BOOLEAN NOT NULL DEFAULT FALSE;

CREATE TABLE IF NOT EXISTS public.objective_members (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  objective_id UUID NOT NULL REFERENCES public.objectives(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'watcher',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(objective_id, user_id)
);

WITH ranked_objective_members AS (
  SELECT
    id,
    ROW_NUMBER() OVER (PARTITION BY objective_id, user_id ORDER BY created_at ASC, id ASC) AS member_rank
  FROM public.objective_members
)
DELETE FROM public.objective_members member
USING ranked_objective_members ranked
WHERE member.id = ranked.id
  AND ranked.member_rank > 1;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.objective_members'::regclass
      AND conname = 'objective_members_objective_id_user_id_key'
  ) THEN
    ALTER TABLE public.objective_members
      ADD CONSTRAINT objective_members_objective_id_user_id_key UNIQUE (objective_id, user_id);
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.objective_metric_checkins (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  objective_id UUID NOT NULL REFERENCES public.objectives(id) ON DELETE CASCADE,
  checkin_date DATE NOT NULL,
  value NUMERIC NOT NULL,
  note TEXT DEFAULT '',
  created_by UUID REFERENCES public.profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.objective_workflow_steps (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  objective_id UUID NOT NULL REFERENCES public.objectives(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT DEFAULT '',
  step_order INT NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'todo',
  owner_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  due_date TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  completed_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(objective_id, step_order)
);

CREATE TABLE IF NOT EXISTS public.objective_agent_runs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  objective_id UUID NOT NULL REFERENCES public.objectives(id) ON DELETE CASCADE,
  requested_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  agent_key TEXT NOT NULL DEFAULT 'objective-assistant',
  run_type TEXT NOT NULL DEFAULT 'starter_pack',
  status TEXT NOT NULL DEFAULT 'queued',
  input_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
  output_summary TEXT DEFAULT '',
  output_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  source_links JSONB NOT NULL DEFAULT '[]'::jsonb,
  file_id UUID REFERENCES public.files(id) ON DELETE SET NULL,
  error TEXT DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

ALTER TABLE public.files
  ADD COLUMN IF NOT EXISTS agent_run_id UUID REFERENCES public.objective_agent_runs(id) ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS public.notification_preferences (
  user_id UUID PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  email_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  in_app_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  push_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  due_reminders BOOLEAN NOT NULL DEFAULT TRUE,
  overdue_alerts BOOLEAN NOT NULL DEFAULT TRUE,
  blocker_alerts BOOLEAN NOT NULL DEFAULT TRUE,
  comment_notifications BOOLEAN NOT NULL DEFAULT TRUE,
  delegation_alerts BOOLEAN NOT NULL DEFAULT TRUE,
  digest_frequency TEXT NOT NULL DEFAULT 'daily',
  digest_time TEXT NOT NULL DEFAULT '08:00',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.email_delivery_log (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  objective_id UUID REFERENCES public.objectives(id) ON DELETE SET NULL,
  notification_type TEXT NOT NULL,
  dedupe_key TEXT UNIQUE NOT NULL,
  recipient TEXT NOT NULL,
  subject TEXT NOT NULL,
  provider_id TEXT,
  status TEXT NOT NULL DEFAULT 'queued',
  error TEXT,
  sent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.push_subscriptions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  endpoint TEXT NOT NULL,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  device_label TEXT DEFAULT '',
  user_agent TEXT DEFAULT '',
  platform TEXT DEFAULT '',
  is_pwa BOOLEAN NOT NULL DEFAULT FALSE,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  revoked_at TIMESTAMPTZ,
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, endpoint)
);

CREATE TABLE IF NOT EXISTS public.push_delivery_log (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  notification_id UUID REFERENCES public.notifications(id) ON DELETE SET NULL,
  objective_id UUID REFERENCES public.objectives(id) ON DELETE SET NULL,
  type TEXT NOT NULL,
  subscription_id UUID REFERENCES public.push_subscriptions(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'queued',
  error TEXT,
  sent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.message_reactions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  message_id UUID NOT NULL REFERENCES public.messages(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  reaction TEXT NOT NULL CHECK (reaction IN ('thumbs_up', 'heard', 'on_it', 'thanks', 'done')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(message_id, user_id)
);

CREATE TABLE IF NOT EXISTS public.objective_message_reads (
  objective_id UUID NOT NULL REFERENCES public.objectives(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  last_read_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (objective_id, user_id)
);

CREATE TABLE IF NOT EXISTS public.ncr_reports (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  report_number TEXT UNIQUE NOT NULL,
  source_sheet TEXT DEFAULT '',
  source_link TEXT DEFAULT '',
  report_date DATE,
  observer TEXT DEFAULT '',
  follow_up_count INT NOT NULL DEFAULT 0,
  follow_up_details TEXT DEFAULT '',
  follow_up_due_date DATE,
  worksite_area TEXT DEFAULT '',
  operator_location TEXT DEFAULT '',
  event_at TIMESTAMPTZ,
  internal_external TEXT DEFAULT '',
  event_type TEXT DEFAULT '',
  event_types TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  non_productive_time TEXT DEFAULT '',
  non_productive_time_amount NUMERIC,
  estimated_cost NUMERIC,
  criticality TEXT DEFAULT '',
  author TEXT DEFAULT '',
  author_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  personnel_involved TEXT DEFAULT '',
  personnel_involved_ids UUID[] NOT NULL DEFAULT ARRAY[]::UUID[],
  event_description TEXT DEFAULT '',
  severity TEXT DEFAULT '',
  root_cause_codes TEXT DEFAULT '',
  root_cause_analysis TEXT DEFAULT '',
  immediate_action TEXT DEFAULT '',
  time_frame_for_action TEXT DEFAULT '',
  permanent_action TEXT DEFAULT '',
  affected_departments TEXT DEFAULT '',
  affected_department_list TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  department_group TEXT DEFAULT '',
  long_term_follow_up TEXT DEFAULT '',
  action_effective TEXT DEFAULT '',
  date_initial_corrective_action DATE,
  date_permanent_corrective_action_completed DATE,
  date_of_review DATE,
  date_of_sign_off DATE,
  signed_off_by_management_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  reviewed_by_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  final_management_signoff_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  source_system TEXT DEFAULT '',
  source_record_id TEXT DEFAULT '',
  source_batch_id UUID,
  source_raw_record JSONB NOT NULL DEFAULT '{}'::jsonb,
  canonical_failure_code TEXT DEFAULT '',
  normalized_failure_summary TEXT DEFAULT '',
  ai_confidence NUMERIC,
  ai_classification_reason TEXT DEFAULT '',
  lifecycle_stage TEXT NOT NULL DEFAULT 'draft',
  owner_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  reviewer_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  verifier_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  closure_approved_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  closure_approved_at TIMESTAMPTZ,
  containment_required BOOLEAN NOT NULL DEFAULT FALSE,
  containment_summary TEXT DEFAULT '',
  affected_product TEXT DEFAULT '',
  affected_equipment TEXT DEFAULT '',
  affected_job TEXT DEFAULT '',
  disposition TEXT DEFAULT '',
  disposition_notes TEXT DEFAULT '',
  effectiveness_summary TEXT DEFAULT '',
  effectiveness_checked_at TIMESTAMPTZ,
  effectiveness_checked_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  recurrence_prevented BOOLEAN,
  repeat_issue BOOLEAN,
  customer_approval_required BOOLEAN NOT NULL DEFAULT FALSE,
  customer_approval_status TEXT DEFAULT '',
  status TEXT NOT NULL DEFAULT 'open',
  closed BOOLEAN NOT NULL DEFAULT FALSE,
  linked_objective_id UUID REFERENCES public.objectives(id) ON DELETE SET NULL,
  created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  updated_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.ncr_reports
  ADD COLUMN IF NOT EXISTS lifecycle_stage TEXT NOT NULL DEFAULT 'draft',
  ADD COLUMN IF NOT EXISTS event_types TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN IF NOT EXISTS estimated_cost NUMERIC,
  ADD COLUMN IF NOT EXISTS criticality TEXT DEFAULT '',
  ADD COLUMN IF NOT EXISTS author_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS personnel_involved_ids UUID[] NOT NULL DEFAULT ARRAY[]::UUID[],
  ADD COLUMN IF NOT EXISTS time_frame_for_action TEXT DEFAULT '',
  ADD COLUMN IF NOT EXISTS affected_department_list TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN IF NOT EXISTS date_initial_corrective_action DATE,
  ADD COLUMN IF NOT EXISTS date_permanent_corrective_action_completed DATE,
  ADD COLUMN IF NOT EXISTS date_of_review DATE,
  ADD COLUMN IF NOT EXISTS date_of_sign_off DATE,
  ADD COLUMN IF NOT EXISTS signed_off_by_management_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS reviewed_by_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS final_management_signoff_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS source_system TEXT DEFAULT '',
  ADD COLUMN IF NOT EXISTS source_record_id TEXT DEFAULT '',
  ADD COLUMN IF NOT EXISTS source_batch_id UUID,
  ADD COLUMN IF NOT EXISTS source_raw_record JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS canonical_failure_code TEXT DEFAULT '',
  ADD COLUMN IF NOT EXISTS normalized_failure_summary TEXT DEFAULT '',
  ADD COLUMN IF NOT EXISTS ai_confidence NUMERIC,
  ADD COLUMN IF NOT EXISTS ai_classification_reason TEXT DEFAULT '',
  ADD COLUMN IF NOT EXISTS owner_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS reviewer_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS verifier_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS closure_approved_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS closure_approved_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS containment_required BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS containment_summary TEXT DEFAULT '',
  ADD COLUMN IF NOT EXISTS affected_product TEXT DEFAULT '',
  ADD COLUMN IF NOT EXISTS affected_equipment TEXT DEFAULT '',
  ADD COLUMN IF NOT EXISTS affected_job TEXT DEFAULT '',
  ADD COLUMN IF NOT EXISTS disposition TEXT DEFAULT '',
  ADD COLUMN IF NOT EXISTS disposition_notes TEXT DEFAULT '',
  ADD COLUMN IF NOT EXISTS effectiveness_summary TEXT DEFAULT '',
  ADD COLUMN IF NOT EXISTS effectiveness_checked_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS effectiveness_checked_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS recurrence_prevented BOOLEAN,
  ADD COLUMN IF NOT EXISTS repeat_issue BOOLEAN,
  ADD COLUMN IF NOT EXISTS customer_approval_required BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS customer_approval_status TEXT DEFAULT '';

CREATE TABLE IF NOT EXISTS public.ncr_action_items (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  ncr_id UUID NOT NULL REFERENCES public.ncr_reports(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  owner_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  due_date DATE,
  status TEXT NOT NULL DEFAULT 'open',
  evidence_notes TEXT DEFAULT '',
  completed_at TIMESTAMPTZ,
  completed_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.notifications
  ADD COLUMN IF NOT EXISTS sender_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS priority TEXT NOT NULL DEFAULT 'normal',
  ADD COLUMN IF NOT EXISTS detail_label TEXT DEFAULT '',
  ADD COLUMN IF NOT EXISTS detail_text TEXT DEFAULT '';

CREATE TABLE IF NOT EXISTS public.ncr_attachments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  ncr_id UUID NOT NULL REFERENCES public.ncr_reports(id) ON DELETE CASCADE,
  action_item_id UUID REFERENCES public.ncr_action_items(id) ON DELETE SET NULL,
  uploaded_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  purpose TEXT NOT NULL DEFAULT 'evidence',
  type TEXT DEFAULT '',
  mime_type TEXT DEFAULT '',
  size TEXT DEFAULT '',
  storage_path TEXT DEFAULT '',
  url TEXT DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.ncr_audit_events (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  ncr_id UUID NOT NULL REFERENCES public.ncr_reports(id) ON DELETE CASCADE,
  actor_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  event_type TEXT NOT NULL DEFAULT 'update',
  field_name TEXT DEFAULT '',
  old_value JSONB,
  new_value JSONB,
  note TEXT DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.ncr_import_batches (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  source_system TEXT NOT NULL DEFAULT 'KPA',
  file_name TEXT DEFAULT '',
  imported_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  total_rows INT NOT NULL DEFAULT 0,
  imported_rows INT NOT NULL DEFAULT 0,
  error_rows INT NOT NULL DEFAULT 0,
  errors JSONB NOT NULL DEFAULT '[]'::jsonb,
  status TEXT NOT NULL DEFAULT 'preview',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS public.ncr_signatures (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  ncr_id UUID NOT NULL REFERENCES public.ncr_reports(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'author',
  signed_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  signed_by_name TEXT DEFAULT '',
  signature_data_url TEXT DEFAULT '',
  signed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.ncr_failure_codes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  code TEXT UNIQUE NOT NULL,
  label TEXT NOT NULL,
  category TEXT DEFAULT '',
  aliases JSONB NOT NULL DEFAULT '[]'::jsonb,
  tim_approved BOOLEAN NOT NULL DEFAULT FALSE,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.ncr_reports
  DROP CONSTRAINT IF EXISTS ncr_reports_source_batch_id_fkey,
  ADD CONSTRAINT ncr_reports_source_batch_id_fkey
    FOREIGN KEY (source_batch_id) REFERENCES public.ncr_import_batches(id) ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS public.fix_it_posts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  body TEXT DEFAULT '',
  created_by UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  claimed_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  agent_tested_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  agent_tested_at TIMESTAMPTZ,
  human_reviewed_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  human_reviewed_at TIMESTAMPTZ,
  archived_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  archived_at TIMESTAMPTZ,
  reopened_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  reopened_at TIMESTAMPTZ,
  reopen_count INT NOT NULL DEFAULT 0,
  reopened_from_status TEXT,
  status TEXT NOT NULL DEFAULT 'open',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.fix_it_posts
  ADD COLUMN IF NOT EXISTS agent_tested_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS agent_tested_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS human_reviewed_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS human_reviewed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS archived_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS reopened_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS reopened_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS reopen_count INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS reopened_from_status TEXT;

CREATE TABLE IF NOT EXISTS public.fix_it_attachments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  post_id UUID NOT NULL REFERENCES public.fix_it_posts(id) ON DELETE CASCADE,
  comment_id UUID,
  uploaded_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  purpose TEXT NOT NULL DEFAULT 'report',
  type TEXT DEFAULT 'file',
  mime_type TEXT DEFAULT '',
  size TEXT DEFAULT '',
  storage_path TEXT,
  url TEXT DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.fix_it_comments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  post_id UUID NOT NULL REFERENCES public.fix_it_posts(id) ON DELETE CASCADE,
  body TEXT DEFAULT '',
  created_by UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.fix_it_attachments
  ADD COLUMN IF NOT EXISTS purpose TEXT NOT NULL DEFAULT 'report',
  ADD COLUMN IF NOT EXISTS comment_id UUID;

DO $$
BEGIN
  ALTER TABLE public.fix_it_attachments
    ADD CONSTRAINT fix_it_attachments_comment_id_fkey
    FOREIGN KEY (comment_id) REFERENCES public.fix_it_comments(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN
  NULL;
END $$;

CREATE TABLE IF NOT EXISTS public.org_chart_updates (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  changed_user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  changed_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  note TEXT NOT NULL DEFAULT '',
  old_value TEXT,
  new_value TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.org_chart_placeholders (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  title TEXT NOT NULL DEFAULT 'Group placeholder',
  department TEXT NOT NULL DEFAULT 'Admin',
  reports_to TEXT,
  color TEXT NOT NULL DEFAULT '#ff7f02',
  created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_files_message ON public.files(message_id);
CREATE INDEX IF NOT EXISTS idx_files_agent_run ON public.files(agent_run_id);
CREATE INDEX IF NOT EXISTS idx_members_objective ON public.objective_members(objective_id);
CREATE INDEX IF NOT EXISTS idx_members_user ON public.objective_members(user_id);
CREATE INDEX IF NOT EXISTS idx_metric_checkins_objective ON public.objective_metric_checkins(objective_id);
CREATE INDEX IF NOT EXISTS idx_workflow_steps_objective ON public.objective_workflow_steps(objective_id, step_order);
CREATE INDEX IF NOT EXISTS idx_workflow_steps_owner ON public.objective_workflow_steps(owner_id);
CREATE INDEX IF NOT EXISTS idx_agent_runs_objective ON public.objective_agent_runs(objective_id);
CREATE INDEX IF NOT EXISTS idx_agent_runs_status ON public.objective_agent_runs(status);
CREATE INDEX IF NOT EXISTS idx_email_delivery_user ON public.email_delivery_log(user_id);
CREATE INDEX IF NOT EXISTS idx_push_subscriptions_user ON public.push_subscriptions(user_id);
CREATE INDEX IF NOT EXISTS idx_push_subscriptions_active ON public.push_subscriptions(user_id, active);
CREATE INDEX IF NOT EXISTS idx_push_delivery_user ON public.push_delivery_log(user_id);
CREATE INDEX IF NOT EXISTS idx_push_delivery_notification ON public.push_delivery_log(notification_id);
CREATE INDEX IF NOT EXISTS idx_notifications_sender ON public.notifications(sender_id);
CREATE INDEX IF NOT EXISTS idx_notifications_priority ON public.notifications(user_id, priority, is_read, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_message_reactions_message ON public.message_reactions(message_id);
CREATE INDEX IF NOT EXISTS idx_message_reactions_user ON public.message_reactions(user_id);
CREATE INDEX IF NOT EXISTS idx_message_reads_user ON public.objective_message_reads(user_id);
CREATE INDEX IF NOT EXISTS idx_message_reads_objective ON public.objective_message_reads(objective_id);
CREATE INDEX IF NOT EXISTS idx_ncr_reports_status ON public.ncr_reports(status);
CREATE INDEX IF NOT EXISTS idx_ncr_reports_lifecycle ON public.ncr_reports(lifecycle_stage);
CREATE INDEX IF NOT EXISTS idx_ncr_reports_owner ON public.ncr_reports(owner_id);
CREATE INDEX IF NOT EXISTS idx_ncr_reports_department ON public.ncr_reports(department_group);
CREATE INDEX IF NOT EXISTS idx_ncr_reports_event_type ON public.ncr_reports(event_type);
CREATE INDEX IF NOT EXISTS idx_ncr_reports_due ON public.ncr_reports(follow_up_due_date);
CREATE INDEX IF NOT EXISTS idx_ncr_reports_source_system ON public.ncr_reports(source_system);
CREATE INDEX IF NOT EXISTS idx_ncr_reports_source_batch ON public.ncr_reports(source_batch_id);
CREATE INDEX IF NOT EXISTS idx_ncr_reports_failure_code ON public.ncr_reports(canonical_failure_code);
CREATE INDEX IF NOT EXISTS idx_ncr_action_items_ncr ON public.ncr_action_items(ncr_id);
CREATE INDEX IF NOT EXISTS idx_ncr_action_items_owner ON public.ncr_action_items(owner_id);
CREATE INDEX IF NOT EXISTS idx_ncr_action_items_due ON public.ncr_action_items(due_date);
CREATE INDEX IF NOT EXISTS idx_ncr_attachments_ncr ON public.ncr_attachments(ncr_id);
CREATE INDEX IF NOT EXISTS idx_ncr_audit_events_ncr ON public.ncr_audit_events(ncr_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ncr_import_batches_source ON public.ncr_import_batches(source_system, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ncr_signatures_ncr ON public.ncr_signatures(ncr_id);
CREATE INDEX IF NOT EXISTS idx_ncr_failure_codes_active ON public.ncr_failure_codes(active);
CREATE INDEX IF NOT EXISTS idx_fix_it_posts_created ON public.fix_it_posts(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_fix_it_posts_status ON public.fix_it_posts(status);
CREATE INDEX IF NOT EXISTS idx_fix_it_attachments_post ON public.fix_it_attachments(post_id);
CREATE INDEX IF NOT EXISTS idx_fix_it_attachments_comment ON public.fix_it_attachments(comment_id);
CREATE INDEX IF NOT EXISTS idx_fix_it_comments_post ON public.fix_it_comments(post_id, created_at);
CREATE INDEX IF NOT EXISTS idx_org_chart_updates_changed_user ON public.org_chart_updates(changed_user_id);
CREATE INDEX IF NOT EXISTS idx_org_chart_updates_changed_by ON public.org_chart_updates(changed_by);
CREATE INDEX IF NOT EXISTS idx_org_chart_placeholders_reports_to ON public.org_chart_placeholders(reports_to);
CREATE INDEX IF NOT EXISTS idx_org_chart_placeholders_department ON public.org_chart_placeholders(department);

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

INSERT INTO public.ncr_failure_codes (code, label, category, aliases, tim_approved, active)
VALUES
  ('HRU', 'HRU failure', 'Equipment', '["hru", "hydraulic release unit"]'::jsonb, false, true),
  ('AWC_VALVE', 'AWC valve failure', 'Equipment', '["awc valve", "awc", "annular well control"]'::jsonb, false, true),
  ('710_VALVE', '710 valve failure', 'Equipment', '["710 valve", "710"]'::jsonb, false, true),
  ('EQUIPMENT_FAILURE', 'Equipment failure', 'KPA Event Type', '["equipment failure", "failed", "failure", "broken"]'::jsonb, false, true),
  ('PROCESS_LOSS', 'Process loss', 'KPA Event Type', '["process loss", "npt", "non productive"]'::jsonb, false, true),
  ('SUBSTANDARD_CONDITION', 'Substandard condition', 'KPA Event Type', '["substandard condition", "condition"]'::jsonb, false, true)
ON CONFLICT (code) DO UPDATE
SET label = EXCLUDED.label,
    category = EXCLUDED.category,
    aliases = EXCLUDED.aliases,
    active = EXCLUDED.active;

DROP TRIGGER IF EXISTS set_objectives_updated_at ON public.objectives;
CREATE TRIGGER set_objectives_updated_at
  BEFORE UPDATE ON public.objectives
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS set_notification_preferences_updated_at ON public.notification_preferences;
CREATE TRIGGER set_notification_preferences_updated_at
  BEFORE UPDATE ON public.notification_preferences
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS set_push_subscriptions_updated_at ON public.push_subscriptions;
CREATE TRIGGER set_push_subscriptions_updated_at
  BEFORE UPDATE ON public.push_subscriptions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS set_message_reads_updated_at ON public.objective_message_reads;
CREATE TRIGGER set_message_reads_updated_at
  BEFORE UPDATE ON public.objective_message_reads
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS set_message_reactions_updated_at ON public.message_reactions;
CREATE TRIGGER set_message_reactions_updated_at
  BEFORE UPDATE ON public.message_reactions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS set_ncr_reports_updated_at ON public.ncr_reports;
CREATE TRIGGER set_ncr_reports_updated_at
  BEFORE UPDATE ON public.ncr_reports
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS set_ncr_action_items_updated_at ON public.ncr_action_items;
CREATE TRIGGER set_ncr_action_items_updated_at
  BEFORE UPDATE ON public.ncr_action_items
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS set_ncr_failure_codes_updated_at ON public.ncr_failure_codes;
CREATE TRIGGER set_ncr_failure_codes_updated_at
  BEFORE UPDATE ON public.ncr_failure_codes
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS set_org_chart_placeholders_updated_at ON public.org_chart_placeholders;
CREATE TRIGGER set_org_chart_placeholders_updated_at
  BEFORE UPDATE ON public.org_chart_placeholders
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS set_workflow_steps_updated_at ON public.objective_workflow_steps;
CREATE TRIGGER set_workflow_steps_updated_at
  BEFORE UPDATE ON public.objective_workflow_steps
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS set_fix_it_posts_updated_at ON public.fix_it_posts;
CREATE TRIGGER set_fix_it_posts_updated_at
  BEFORE UPDATE ON public.fix_it_posts
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS set_fix_it_comments_updated_at ON public.fix_it_comments;
CREATE TRIGGER set_fix_it_comments_updated_at
  BEFORE UPDATE ON public.fix_it_comments
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE OR REPLACE FUNCTION public.create_default_objective_workflow()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.objective_workflow_steps (objective_id, title, description, step_order, status, owner_id)
  VALUES
    (NEW.id, 'Scope', 'Confirm what success looks like and what information is still missing.', 10, 'current', NEW.owner_id),
    (NEW.id, 'Plan', 'Break the objective into a practical path with the right people involved.', 20, 'todo', NEW.owner_id),
    (NEW.id, 'Inputs', 'Collect files, answers, approvals, vendor details, or examples needed to move.', 30, 'todo', NEW.owner_id),
    (NEW.id, 'Execute', 'Do the work, keep messages current, and update progress as it moves.', 40, 'todo', NEW.owner_id),
    (NEW.id, 'Review', 'Review with the right stakeholders and resolve remaining questions.', 50, 'todo', NEW.owner_id),
    (NEW.id, 'Complete', 'Close the loop, capture the outcome, and mark the objective complete.', 60, 'todo', NEW.owner_id)
  ON CONFLICT (objective_id, step_order) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS create_objective_workflow_steps ON public.objectives;
CREATE TRIGGER create_objective_workflow_steps
  AFTER INSERT ON public.objectives
  FOR EACH ROW EXECUTE FUNCTION public.create_default_objective_workflow();

WITH default_steps(title, description, step_order, status) AS (
  VALUES
    ('Scope', 'Confirm what success looks like and what information is still missing.', 10, 'current'),
    ('Plan', 'Break the objective into a practical path with the right people involved.', 20, 'todo'),
    ('Inputs', 'Collect files, answers, approvals, vendor details, or examples needed to move.', 30, 'todo'),
    ('Execute', 'Do the work, keep messages current, and update progress as it moves.', 40, 'todo'),
    ('Review', 'Review with the right stakeholders and resolve remaining questions.', 50, 'todo'),
    ('Complete', 'Close the loop, capture the outcome, and mark the objective complete.', 60, 'todo')
),
objectives_needing_workflow AS (
  SELECT o.id, o.owner_id
  FROM public.objectives o
  WHERE NOT EXISTS (
    SELECT 1 FROM public.objective_workflow_steps step
    WHERE step.objective_id = o.id
  )
)
INSERT INTO public.objective_workflow_steps (objective_id, title, description, step_order, status, owner_id)
SELECT o.id, s.title, s.description, s.step_order, s.status, o.owner_id
FROM objectives_needing_workflow o
CROSS JOIN default_steps s
ON CONFLICT (objective_id, step_order) DO NOTHING;

ALTER TABLE public.objective_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.objective_metric_checkins ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.objective_workflow_steps ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.objective_agent_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notification_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.email_delivery_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.push_delivery_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.message_reactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.objective_message_reads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ncr_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ncr_action_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ncr_attachments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ncr_audit_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ncr_import_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ncr_signatures ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ncr_failure_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fix_it_posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fix_it_comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fix_it_attachments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.org_chart_updates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.org_chart_placeholders ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Owners and creators can update objectives" ON public.objectives;
DROP POLICY IF EXISTS "Objective team can update objectives" ON public.objectives;
CREATE POLICY "Objective team can update objectives"
  ON public.objectives FOR UPDATE TO authenticated
  USING (
    auth.uid() = owner_id
    OR auth.uid() = created_by
    OR EXISTS (
      SELECT 1
      FROM public.objective_members m
      WHERE m.objective_id = objectives.id
        AND m.user_id = auth.uid()
        AND m.role IN ('assignee', 'manager')
    )
    OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'executive')
  )
  WITH CHECK (
    auth.uid() = owner_id
    OR auth.uid() = created_by
    OR EXISTS (
      SELECT 1
      FROM public.objective_members m
      WHERE m.objective_id = objectives.id
        AND m.user_id = auth.uid()
        AND m.role IN ('assignee', 'manager')
    )
    OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'executive')
  );

DROP POLICY IF EXISTS "Authenticated can delete subtasks" ON public.subtasks;
CREATE POLICY "Authenticated can delete subtasks"
  ON public.subtasks FOR DELETE TO authenticated USING (true);

DROP POLICY IF EXISTS "Members viewable by all authenticated" ON public.objective_members;
CREATE POLICY "Members viewable by all authenticated"
  ON public.objective_members FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Executives and objective owners manage members" ON public.objective_members;
CREATE POLICY "Executives and objective owners manage members"
  ON public.objective_members FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.objectives o
      WHERE o.id = objective_id
      AND (o.owner_id = auth.uid() OR o.created_by = auth.uid())
    )
    OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'executive')
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.objectives o
      WHERE o.id = objective_id
      AND (o.owner_id = auth.uid() OR o.created_by = auth.uid())
    )
    OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'executive')
  );

DROP POLICY IF EXISTS "Metric checkins viewable by all authenticated" ON public.objective_metric_checkins;
CREATE POLICY "Metric checkins viewable by all authenticated"
  ON public.objective_metric_checkins FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Authenticated can insert metric checkins" ON public.objective_metric_checkins;
CREATE POLICY "Authenticated can insert metric checkins"
  ON public.objective_metric_checkins FOR INSERT TO authenticated WITH CHECK (auth.uid() = created_by);

DROP POLICY IF EXISTS "Workflow steps viewable by all authenticated" ON public.objective_workflow_steps;
CREATE POLICY "Workflow steps viewable by all authenticated"
  ON public.objective_workflow_steps FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Objective team manages workflow steps" ON public.objective_workflow_steps;
CREATE POLICY "Objective team manages workflow steps"
  ON public.objective_workflow_steps FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.objectives o
      WHERE o.id = objective_id
      AND (o.owner_id = auth.uid() OR o.created_by = auth.uid())
    )
    OR EXISTS (
      SELECT 1 FROM public.objective_members m
      WHERE m.objective_id = objective_id
      AND m.user_id = auth.uid()
      AND m.role IN ('assignee', 'manager')
    )
    OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'executive')
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.objectives o
      WHERE o.id = objective_id
      AND (o.owner_id = auth.uid() OR o.created_by = auth.uid())
    )
    OR EXISTS (
      SELECT 1 FROM public.objective_members m
      WHERE m.objective_id = objective_id
      AND m.user_id = auth.uid()
      AND m.role IN ('assignee', 'manager')
    )
    OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'executive')
  );

DROP POLICY IF EXISTS "Agent runs viewable by all authenticated" ON public.objective_agent_runs;
CREATE POLICY "Agent runs viewable by all authenticated"
  ON public.objective_agent_runs FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Users view own notification preferences" ON public.notification_preferences;
CREATE POLICY "Users view own notification preferences"
  ON public.notification_preferences FOR SELECT TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users upsert own notification preferences" ON public.notification_preferences;
CREATE POLICY "Users upsert own notification preferences"
  ON public.notification_preferences FOR ALL TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can view own notifications" ON public.notifications;
CREATE POLICY "Users can view own notifications"
  ON public.notifications FOR SELECT TO authenticated
  USING (auth.uid() = user_id OR auth.uid() = sender_id);

DROP POLICY IF EXISTS "System can insert notifications" ON public.notifications;
CREATE POLICY "System can insert notifications"
  ON public.notifications FOR INSERT TO authenticated
  WITH CHECK (sender_id IS NULL OR sender_id = auth.uid());

DROP POLICY IF EXISTS "Users can update own notifications" ON public.notifications;
CREATE POLICY "Users can update own notifications"
  ON public.notifications FOR UPDATE TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users view own email delivery log" ON public.email_delivery_log;
CREATE POLICY "Users view own email delivery log"
  ON public.email_delivery_log FOR SELECT TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users manage own push subscriptions" ON public.push_subscriptions;
CREATE POLICY "Users manage own push subscriptions"
  ON public.push_subscriptions FOR ALL TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users view own push delivery log" ON public.push_delivery_log;
CREATE POLICY "Users view own push delivery log"
  ON public.push_delivery_log FOR SELECT TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Message reactions are viewable by all authenticated" ON public.message_reactions;
CREATE POLICY "Message reactions are viewable by all authenticated"
  ON public.message_reactions FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Users manage own message reactions" ON public.message_reactions;
CREATE POLICY "Users manage own message reactions"
  ON public.message_reactions FOR ALL TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users manage own message read state" ON public.objective_message_reads;
CREATE POLICY "Users manage own message read state"
  ON public.objective_message_reads FOR ALL TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own messages" ON public.messages;
CREATE POLICY "Users can update own messages"
  ON public.messages FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "NCR reports viewable by all authenticated" ON public.ncr_reports;
CREATE POLICY "NCR reports viewable by all authenticated"
  ON public.ncr_reports FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Authenticated users can create NCR reports" ON public.ncr_reports;
CREATE POLICY "Authenticated users can create NCR reports"
  ON public.ncr_reports FOR INSERT TO authenticated WITH CHECK (auth.uid() = created_by OR created_by IS NULL);

DROP POLICY IF EXISTS "Authenticated users can update NCR reports" ON public.ncr_reports;
CREATE POLICY "Authenticated users can update NCR reports"
  ON public.ncr_reports FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "NCR action items viewable by all authenticated" ON public.ncr_action_items;
CREATE POLICY "NCR action items viewable by all authenticated"
  ON public.ncr_action_items FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Authenticated users can create NCR action items" ON public.ncr_action_items;
CREATE POLICY "Authenticated users can create NCR action items"
  ON public.ncr_action_items FOR INSERT TO authenticated WITH CHECK (auth.uid() = created_by OR created_by IS NULL);

DROP POLICY IF EXISTS "Authenticated users can update NCR action items" ON public.ncr_action_items;
CREATE POLICY "Authenticated users can update NCR action items"
  ON public.ncr_action_items FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Authenticated users can delete NCR action items" ON public.ncr_action_items;
CREATE POLICY "Authenticated users can delete NCR action items"
  ON public.ncr_action_items FOR DELETE TO authenticated USING (true);

DROP POLICY IF EXISTS "NCR attachments viewable by all authenticated" ON public.ncr_attachments;
CREATE POLICY "NCR attachments viewable by all authenticated"
  ON public.ncr_attachments FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Authenticated users can create NCR attachments" ON public.ncr_attachments;
CREATE POLICY "Authenticated users can create NCR attachments"
  ON public.ncr_attachments FOR INSERT TO authenticated WITH CHECK (auth.uid() = uploaded_by OR uploaded_by IS NULL);

DROP POLICY IF EXISTS "Authenticated users can delete NCR attachments" ON public.ncr_attachments;
CREATE POLICY "Authenticated users can delete NCR attachments"
  ON public.ncr_attachments FOR DELETE TO authenticated USING (true);

DROP POLICY IF EXISTS "NCR audit events viewable by all authenticated" ON public.ncr_audit_events;
CREATE POLICY "NCR audit events viewable by all authenticated"
  ON public.ncr_audit_events FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Authenticated users can create NCR audit events" ON public.ncr_audit_events;
CREATE POLICY "Authenticated users can create NCR audit events"
  ON public.ncr_audit_events FOR INSERT TO authenticated WITH CHECK (auth.uid() = actor_id OR actor_id IS NULL);

DROP POLICY IF EXISTS "NCR import batches viewable by all authenticated" ON public.ncr_import_batches;
CREATE POLICY "NCR import batches viewable by all authenticated"
  ON public.ncr_import_batches FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Authenticated users can create NCR import batches" ON public.ncr_import_batches;
CREATE POLICY "Authenticated users can create NCR import batches"
  ON public.ncr_import_batches FOR INSERT TO authenticated WITH CHECK (auth.uid() = imported_by OR imported_by IS NULL);

DROP POLICY IF EXISTS "Authenticated users can update NCR import batches" ON public.ncr_import_batches;
CREATE POLICY "Authenticated users can update NCR import batches"
  ON public.ncr_import_batches FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "NCR signatures viewable by all authenticated" ON public.ncr_signatures;
CREATE POLICY "NCR signatures viewable by all authenticated"
  ON public.ncr_signatures FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Authenticated users can create NCR signatures" ON public.ncr_signatures;
CREATE POLICY "Authenticated users can create NCR signatures"
  ON public.ncr_signatures FOR INSERT TO authenticated WITH CHECK (auth.uid() = created_by OR created_by IS NULL);

DROP POLICY IF EXISTS "NCR failure codes viewable by all authenticated" ON public.ncr_failure_codes;
CREATE POLICY "NCR failure codes viewable by all authenticated"
  ON public.ncr_failure_codes FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Executives can manage NCR failure codes" ON public.ncr_failure_codes;
CREATE POLICY "Executives can manage NCR failure codes"
  ON public.ncr_failure_codes FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid()
      AND (role = 'executive' OR lower(email) IN ('tdibben@sandpro.com', 'mjimenez@sandpro.com', 'andrew@ndai.pro'))
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid()
      AND (role = 'executive' OR lower(email) IN ('tdibben@sandpro.com', 'mjimenez@sandpro.com', 'andrew@ndai.pro'))
    )
  );

DROP POLICY IF EXISTS "Fix-It posts viewable by all authenticated" ON public.fix_it_posts;
CREATE POLICY "Fix-It posts viewable by all authenticated"
  ON public.fix_it_posts FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Authenticated users can create Fix-It posts" ON public.fix_it_posts;
CREATE POLICY "Authenticated users can create Fix-It posts"
  ON public.fix_it_posts FOR INSERT TO authenticated WITH CHECK (auth.uid() = created_by);

DROP POLICY IF EXISTS "Authenticated users can update Fix-It posts" ON public.fix_it_posts;
CREATE POLICY "Authenticated users can update Fix-It posts"
  ON public.fix_it_posts FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Fix-It owners and moderators can delete posts" ON public.fix_it_posts;
CREATE POLICY "Fix-It owners and moderators can delete posts"
  ON public.fix_it_posts FOR DELETE TO authenticated
  USING (
    created_by = auth.uid()
    OR claimed_by = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid()
      AND (role = 'executive' OR lower(email) IN ('mjimenez@sandpro.com', 'tdibben@sandpro.com', 'jfeil@sandpro.com', 'andrew@ndai.pro'))
    )
  );

DROP POLICY IF EXISTS "Fix-It attachments viewable by all authenticated" ON public.fix_it_attachments;
CREATE POLICY "Fix-It attachments viewable by all authenticated"
  ON public.fix_it_attachments FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Fix-It comments viewable by all authenticated" ON public.fix_it_comments;
CREATE POLICY "Fix-It comments viewable by all authenticated"
  ON public.fix_it_comments FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Authenticated users can create Fix-It comments" ON public.fix_it_comments;
CREATE POLICY "Authenticated users can create Fix-It comments"
  ON public.fix_it_comments FOR INSERT TO authenticated WITH CHECK (auth.uid() = created_by);

DROP POLICY IF EXISTS "Fix-It comment authors and moderators can update comments" ON public.fix_it_comments;
CREATE POLICY "Fix-It comment authors and moderators can update comments"
  ON public.fix_it_comments FOR UPDATE TO authenticated
  USING (
    created_by = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid()
      AND (role = 'executive' OR lower(email) IN ('mjimenez@sandpro.com', 'tdibben@sandpro.com', 'jfeil@sandpro.com', 'andrew@ndai.pro'))
    )
  )
  WITH CHECK (
    created_by = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid()
      AND (role = 'executive' OR lower(email) IN ('mjimenez@sandpro.com', 'tdibben@sandpro.com', 'jfeil@sandpro.com', 'andrew@ndai.pro'))
    )
  );

DROP POLICY IF EXISTS "Fix-It comment authors and moderators can delete comments" ON public.fix_it_comments;
CREATE POLICY "Fix-It comment authors and moderators can delete comments"
  ON public.fix_it_comments FOR DELETE TO authenticated
  USING (
    created_by = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid()
      AND (role = 'executive' OR lower(email) IN ('mjimenez@sandpro.com', 'tdibben@sandpro.com', 'jfeil@sandpro.com', 'andrew@ndai.pro'))
    )
  );

DROP POLICY IF EXISTS "Authenticated users can create Fix-It attachments" ON public.fix_it_attachments;
CREATE POLICY "Authenticated users can create Fix-It attachments"
  ON public.fix_it_attachments FOR INSERT TO authenticated WITH CHECK (auth.uid() = uploaded_by);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.fix_it_comments TO authenticated;
GRANT SELECT, INSERT ON public.fix_it_attachments TO authenticated;

DROP POLICY IF EXISTS "Executives and org editors view org chart updates" ON public.org_chart_updates;
DROP POLICY IF EXISTS "Executives and Merci view org chart updates" ON public.org_chart_updates;
CREATE POLICY "Executives and org editors view org chart updates"
  ON public.org_chart_updates FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.profiles viewer
      WHERE viewer.id = auth.uid()
        AND (
          viewer.role = 'executive'
          OR lower(viewer.email) IN ('mjimenez@sandpro.com', 'tdibben@sandpro.com')
        )
    )
  );

DROP POLICY IF EXISTS "Executives and org editors insert org chart updates" ON public.org_chart_updates;
DROP POLICY IF EXISTS "Executives and Merci insert org chart updates" ON public.org_chart_updates;
CREATE POLICY "Executives and org editors insert org chart updates"
  ON public.org_chart_updates FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.profiles viewer
      WHERE viewer.id = auth.uid()
        AND (
          viewer.role = 'executive'
          OR lower(viewer.email) IN ('mjimenez@sandpro.com', 'tdibben@sandpro.com')
        )
    )
  );

DROP POLICY IF EXISTS "Org placeholders viewable by all authenticated" ON public.org_chart_placeholders;
CREATE POLICY "Org placeholders viewable by all authenticated"
  ON public.org_chart_placeholders FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Org editors manage placeholders" ON public.org_chart_placeholders;
CREATE POLICY "Org editors manage placeholders"
  ON public.org_chart_placeholders FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.profiles viewer
      WHERE viewer.id = auth.uid()
        AND (
          viewer.role IN ('executive', 'manager')
          OR lower(viewer.email) IN ('mjimenez@sandpro.com', 'tdibben@sandpro.com', 'jfeil@sandpro.com', 'andrew@ndai.pro')
        )
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.profiles viewer
      WHERE viewer.id = auth.uid()
        AND (
          viewer.role IN ('executive', 'manager')
          OR lower(viewer.email) IN ('mjimenez@sandpro.com', 'tdibben@sandpro.com', 'jfeil@sandpro.com', 'andrew@ndai.pro')
        )
    )
  );

DROP POLICY IF EXISTS "Owners and creators can delete objectives" ON public.objectives;
DROP POLICY IF EXISTS "Objective creators and admins can delete objectives" ON public.objectives;
CREATE POLICY "Objective creators and admins can delete objectives"
  ON public.objectives FOR DELETE TO authenticated
  USING (
    auth.uid() = created_by
    OR EXISTS (
      SELECT 1
      FROM public.profiles
      WHERE id = auth.uid()
        AND (role = 'executive' OR lower(email) IN ('jfeil@sandpro.com', 'andrew@ndai.pro'))
    )
  );

DROP POLICY IF EXISTS "Users delete their uploaded file rows" ON public.files;
CREATE POLICY "Users delete their uploaded file rows"
  ON public.files FOR DELETE TO authenticated
  USING (
    uploaded_by = auth.uid()
    OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'executive')
  );

INSERT INTO storage.buckets (id, name, public)
VALUES ('objective-files', 'objective-files', false)
ON CONFLICT (id) DO UPDATE SET public = false;

INSERT INTO storage.buckets (id, name, public)
VALUES ('fix-it-files', 'fix-it-files', false)
ON CONFLICT (id) DO UPDATE SET public = false;

INSERT INTO storage.buckets (id, name, public)
VALUES ('ncr-files', 'ncr-files', false)
ON CONFLICT (id) DO UPDATE SET public = false;

DROP POLICY IF EXISTS "Authenticated users can read objective file objects" ON storage.objects;
CREATE POLICY "Authenticated users can read objective file objects"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'objective-files');

DROP POLICY IF EXISTS "Authenticated users can upload objective file objects" ON storage.objects;
CREATE POLICY "Authenticated users can upload objective file objects"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'objective-files' AND owner = auth.uid());

DROP POLICY IF EXISTS "Upload owners and executives can delete objective file objects" ON storage.objects;
CREATE POLICY "Upload owners and executives can delete objective file objects"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'objective-files'
    AND (
      owner = auth.uid()
      OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'executive')
    )
  );

DROP POLICY IF EXISTS "Authenticated users can read Fix-It file objects" ON storage.objects;
CREATE POLICY "Authenticated users can read Fix-It file objects"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'fix-it-files');

DROP POLICY IF EXISTS "Authenticated users can read NCR file objects" ON storage.objects;
CREATE POLICY "Authenticated users can read NCR file objects"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'ncr-files');

DROP POLICY IF EXISTS "Authenticated users can upload Fix-It file objects" ON storage.objects;
CREATE POLICY "Authenticated users can upload Fix-It file objects"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'fix-it-files' AND owner = auth.uid());

DROP POLICY IF EXISTS "Authenticated users can upload NCR file objects" ON storage.objects;
CREATE POLICY "Authenticated users can upload NCR file objects"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'ncr-files' AND owner = auth.uid());

DROP POLICY IF EXISTS "Fix-It upload owners and moderators can delete file objects" ON storage.objects;
CREATE POLICY "Fix-It upload owners and moderators can delete file objects"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'fix-it-files'
    AND (
      owner = auth.uid()
      OR EXISTS (
        SELECT 1 FROM public.profiles
        WHERE id = auth.uid()
        AND (role = 'executive' OR lower(email) IN ('mjimenez@sandpro.com', 'tdibben@sandpro.com', 'jfeil@sandpro.com', 'andrew@ndai.pro'))
      )
    )
  );

DROP POLICY IF EXISTS "NCR upload owners and executives can delete file objects" ON storage.objects;
CREATE POLICY "NCR upload owners and executives can delete file objects"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'ncr-files'
    AND (
      owner = auth.uid()
      OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'executive')
    )
  );

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.org_chart_placeholders;
EXCEPTION WHEN duplicate_object THEN
  NULL;
END $$;

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.message_reactions;
EXCEPTION WHEN duplicate_object THEN
  NULL;
END $$;

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.objective_workflow_steps;
EXCEPTION WHEN duplicate_object THEN
  NULL;
END $$;

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.ncr_reports;
EXCEPTION WHEN duplicate_object THEN
  NULL;
END $$;

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.ncr_action_items;
EXCEPTION WHEN duplicate_object THEN
  NULL;
END $$;

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.ncr_attachments;
EXCEPTION WHEN duplicate_object THEN
  NULL;
END $$;

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.ncr_audit_events;
EXCEPTION WHEN duplicate_object THEN
  NULL;
END $$;

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.ncr_signatures;
EXCEPTION WHEN duplicate_object THEN
  NULL;
END $$;

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.ncr_import_batches;
EXCEPTION WHEN duplicate_object THEN
  NULL;
END $$;

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.ncr_failure_codes;
EXCEPTION WHEN duplicate_object THEN
  NULL;
END $$;

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.fix_it_posts;
EXCEPTION WHEN duplicate_object THEN
  NULL;
END $$;

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.fix_it_attachments;
EXCEPTION WHEN duplicate_object THEN
  NULL;
END $$;

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.fix_it_comments;
EXCEPTION WHEN duplicate_object THEN
  NULL;
END $$;

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.org_chart_updates;
EXCEPTION WHEN duplicate_object THEN
  NULL;
END $$;
