-- ============================================================================
-- SandPro OMP — Supabase Migration
-- Run this in Supabase SQL Editor (supabase.com/dashboard → SQL Editor)
-- ============================================================================

-- Enable UUID generation
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================================
-- ENUMS
-- ============================================================================
CREATE TYPE user_role AS ENUM ('executive', 'manager', 'contributor');
CREATE TYPE obj_status AS ENUM ('not_started', 'on_track', 'at_risk', 'blocked', 'completed', 'cancelled');
CREATE TYPE obj_priority AS ENUM ('critical', 'high', 'medium', 'low');

-- ============================================================================
-- TABLES
-- ============================================================================

-- Users (extends Supabase auth.users)
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  initials TEXT NOT NULL,
  email TEXT UNIQUE NOT NULL,
  title TEXT NOT NULL DEFAULT '',
  department TEXT NOT NULL DEFAULT '',
  role user_role NOT NULL DEFAULT 'contributor',
  reports_to UUID REFERENCES public.profiles(id),
  color TEXT NOT NULL DEFAULT '#ff7f02',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Objectives
CREATE TABLE public.objectives (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  title TEXT NOT NULL,
  description TEXT DEFAULT '',
  owner_id UUID NOT NULL REFERENCES public.profiles(id),
  created_by UUID NOT NULL REFERENCES public.profiles(id),
  delegated_by UUID REFERENCES public.profiles(id),
  parent_id UUID REFERENCES public.objectives(id) ON DELETE SET NULL,
  status obj_status NOT NULL DEFAULT 'not_started',
  priority obj_priority NOT NULL DEFAULT 'medium',
  progress INT NOT NULL DEFAULT 0 CHECK (progress >= 0 AND progress <= 100),
  due_date TIMESTAMPTZ,
  start_date TIMESTAMPTZ,
  department TEXT DEFAULT '',
  acknowledged BOOLEAN NOT NULL DEFAULT FALSE,
  blocker_flag BOOLEAN NOT NULL DEFAULT FALSE,
  blocker_reason TEXT DEFAULT '',
  next_action TEXT DEFAULT '',
  type TEXT NOT NULL DEFAULT 'simple',
  baseline_metric NUMERIC,
  target_metric NUMERIC,
  current_metric NUMERIC,
  metric_unit TEXT DEFAULT '',
  measurement_cadence TEXT NOT NULL DEFAULT 'monthly',
  rollup_method TEXT NOT NULL DEFAULT 'average',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Messages (comments on objectives)
CREATE TABLE public.messages (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  objective_id UUID NOT NULL REFERENCES public.objectives(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles(id),
  text TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE public.message_reactions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  message_id UUID NOT NULL REFERENCES public.messages(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  reaction TEXT NOT NULL CHECK (reaction IN ('thumbs_up', 'heard', 'on_it', 'thanks', 'done')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(message_id, user_id)
);

CREATE TABLE public.objective_message_reads (
  objective_id UUID NOT NULL REFERENCES public.objectives(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  last_read_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (objective_id, user_id)
);

CREATE TABLE public.ncr_reports (
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

CREATE TABLE public.ncr_action_items (
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

CREATE TABLE public.ncr_attachments (
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

CREATE TABLE public.ncr_audit_events (
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

CREATE TABLE public.ncr_import_batches (
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

CREATE TABLE public.ncr_signatures (
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

CREATE TABLE public.ncr_failure_codes (
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
  ADD CONSTRAINT ncr_reports_source_batch_id_fkey
    FOREIGN KEY (source_batch_id) REFERENCES public.ncr_import_batches(id) ON DELETE SET NULL;

-- Subtasks
CREATE TABLE public.subtasks (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  objective_id UUID NOT NULL REFERENCES public.objectives(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  progress INT NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'not_started',
  owner_id UUID NOT NULL REFERENCES public.profiles(id),
  due_date TIMESTAMPTZ,
  weight NUMERIC NOT NULL DEFAULT 1,
  is_milestone BOOLEAN NOT NULL DEFAULT FALSE,
  milestone_date TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Objective Updates (activity log)
CREATE TABLE public.objective_updates (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  objective_id UUID NOT NULL REFERENCES public.objectives(id) ON DELETE CASCADE,
  user_id UUID REFERENCES public.profiles(id),
  action_type TEXT NOT NULL DEFAULT 'status/progress_update',
  status TEXT NOT NULL,
  progress INT NOT NULL DEFAULT 0,
  note TEXT DEFAULT '',
  old_value TEXT,
  new_value TEXT,
  reference_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Files
CREATE TABLE public.files (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  objective_id UUID NOT NULL REFERENCES public.objectives(id) ON DELETE CASCADE,
  message_id UUID REFERENCES public.messages(id) ON DELETE CASCADE,
  uploaded_by UUID REFERENCES public.profiles(id),
  name TEXT NOT NULL,
  type TEXT DEFAULT 'file',
  mime_type TEXT DEFAULT '',
  size TEXT DEFAULT '',
  storage_path TEXT,
  generated_by_agent BOOLEAN NOT NULL DEFAULT FALSE,
  url TEXT DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE public.objective_members (
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

CREATE TABLE public.objective_metric_checkins (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  objective_id UUID NOT NULL REFERENCES public.objectives(id) ON DELETE CASCADE,
  checkin_date DATE NOT NULL,
  value NUMERIC NOT NULL,
  note TEXT DEFAULT '',
  created_by UUID REFERENCES public.profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE public.objective_workflow_steps (
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

CREATE TABLE public.objective_agent_runs (
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
  ADD COLUMN agent_run_id UUID REFERENCES public.objective_agent_runs(id) ON DELETE SET NULL;

CREATE TABLE public.notification_preferences (
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

CREATE TABLE public.email_delivery_log (
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

CREATE TABLE public.push_subscriptions (
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

CREATE TABLE public.push_delivery_log (
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

CREATE TABLE public.alt_dashboard_preferences (
  user_id UUID PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  last_dashboard_mode TEXT NOT NULL DEFAULT 'standard' CHECK (last_dashboard_mode IN ('standard', 'alternative')),
  selected_time_key TEXT NOT NULL DEFAULT 'today' CHECK (selected_time_key IN ('today', 'next3', 'week')),
  compute_mode TEXT NOT NULL DEFAULT 'open' CHECK (compute_mode IN ('all', 'open', 'closed')),
  sound_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  widget_slots JSONB NOT NULL DEFAULT '["pressing", "notes", "next_due", "recent_collaborator", "key_metric"]'::jsonb,
  pinned_people JSONB NOT NULL DEFAULT '[]'::jsonb,
  pinned_objectives JSONB NOT NULL DEFAULT '[]'::jsonb,
  manual_order JSONB NOT NULL DEFAULT '[]'::jsonb,
  notes_state JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE public.alt_dashboard_presence (
  user_id UUID PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE public.alt_dashboard_note_folders (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  name TEXT NOT NULL DEFAULT 'Notes',
  icon TEXT NOT NULL DEFAULT 'folder',
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE public.alt_dashboard_notes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  folder_id UUID REFERENCES public.alt_dashboard_note_folders(id) ON DELETE SET NULL,
  objective_id UUID REFERENCES public.objectives(id) ON DELETE SET NULL,
  title TEXT NOT NULL DEFAULT 'Untitled Note',
  body_json JSONB NOT NULL DEFAULT '{"type":"doc","content":[{"type":"paragraph"}]}'::jsonb,
  plain_text TEXT NOT NULL DEFAULT '',
  preview TEXT NOT NULL DEFAULT '',
  pinned BOOLEAN NOT NULL DEFAULT FALSE,
  archived_at TIMESTAMPTZ,
  deleted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_edited_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE public.alt_dashboard_note_attachments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  note_id UUID NOT NULL REFERENCES public.alt_dashboard_notes(id) ON DELETE CASCADE,
  storage_path TEXT NOT NULL,
  name TEXT NOT NULL DEFAULT 'Attachment',
  mime_type TEXT NOT NULL DEFAULT 'application/octet-stream',
  size BIGINT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE public.fix_it_posts (
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

CREATE TABLE public.fix_it_attachments (
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

CREATE TABLE public.fix_it_comments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  post_id UUID NOT NULL REFERENCES public.fix_it_posts(id) ON DELETE CASCADE,
  body TEXT DEFAULT '',
  created_by UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.fix_it_attachments
  ADD CONSTRAINT fix_it_attachments_comment_id_fkey
  FOREIGN KEY (comment_id) REFERENCES public.fix_it_comments(id) ON DELETE CASCADE;

CREATE TABLE public.org_chart_updates (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  changed_user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  changed_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  note TEXT NOT NULL DEFAULT '',
  old_value TEXT,
  new_value TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE public.org_chart_placeholders (
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

-- Notifications
CREATE TABLE public.notifications (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  sender_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  type TEXT NOT NULL DEFAULT 'info',
  objective_id UUID REFERENCES public.objectives(id) ON DELETE CASCADE,
  message TEXT NOT NULL,
  priority TEXT NOT NULL DEFAULT 'normal',
  detail_label TEXT DEFAULT '',
  detail_text TEXT DEFAULT '',
  is_read BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================================
-- INDEXES
-- ============================================================================
CREATE INDEX idx_objectives_owner ON public.objectives(owner_id);
CREATE INDEX idx_objectives_status ON public.objectives(status);
CREATE INDEX idx_objectives_parent ON public.objectives(parent_id);
CREATE INDEX idx_messages_objective ON public.messages(objective_id);
CREATE INDEX idx_messages_created ON public.messages(created_at DESC);
CREATE INDEX idx_message_reactions_message ON public.message_reactions(message_id);
CREATE INDEX idx_message_reactions_user ON public.message_reactions(user_id);
CREATE INDEX idx_message_reads_user ON public.objective_message_reads(user_id);
CREATE INDEX idx_message_reads_objective ON public.objective_message_reads(objective_id);
CREATE INDEX idx_ncr_reports_status ON public.ncr_reports(status);
CREATE INDEX idx_ncr_reports_lifecycle ON public.ncr_reports(lifecycle_stage);
CREATE INDEX idx_ncr_reports_owner ON public.ncr_reports(owner_id);
CREATE INDEX idx_ncr_reports_department ON public.ncr_reports(department_group);
CREATE INDEX idx_ncr_reports_event_type ON public.ncr_reports(event_type);
CREATE INDEX idx_ncr_reports_due ON public.ncr_reports(follow_up_due_date);
CREATE INDEX idx_ncr_reports_source_system ON public.ncr_reports(source_system);
CREATE INDEX idx_ncr_reports_source_batch ON public.ncr_reports(source_batch_id);
CREATE INDEX idx_ncr_reports_failure_code ON public.ncr_reports(canonical_failure_code);
CREATE INDEX idx_ncr_action_items_ncr ON public.ncr_action_items(ncr_id);
CREATE INDEX idx_ncr_action_items_owner ON public.ncr_action_items(owner_id);
CREATE INDEX idx_ncr_action_items_due ON public.ncr_action_items(due_date);
CREATE INDEX idx_ncr_attachments_ncr ON public.ncr_attachments(ncr_id);
CREATE INDEX idx_ncr_audit_events_ncr ON public.ncr_audit_events(ncr_id, created_at DESC);
CREATE INDEX idx_ncr_import_batches_source ON public.ncr_import_batches(source_system, created_at DESC);
CREATE INDEX idx_ncr_signatures_ncr ON public.ncr_signatures(ncr_id);
CREATE INDEX idx_ncr_failure_codes_active ON public.ncr_failure_codes(active);
CREATE INDEX idx_subtasks_objective ON public.subtasks(objective_id);
CREATE INDEX idx_updates_objective ON public.objective_updates(objective_id);
CREATE INDEX idx_files_objective ON public.files(objective_id);
CREATE INDEX idx_files_message ON public.files(message_id);
CREATE INDEX idx_files_agent_run ON public.files(agent_run_id);
CREATE INDEX idx_members_objective ON public.objective_members(objective_id);
CREATE INDEX idx_members_user ON public.objective_members(user_id);
CREATE INDEX idx_metric_checkins_objective ON public.objective_metric_checkins(objective_id);
CREATE INDEX idx_workflow_steps_objective ON public.objective_workflow_steps(objective_id, step_order);
CREATE INDEX idx_workflow_steps_owner ON public.objective_workflow_steps(owner_id);
CREATE INDEX idx_agent_runs_objective ON public.objective_agent_runs(objective_id);
CREATE INDEX idx_agent_runs_status ON public.objective_agent_runs(status);
CREATE INDEX idx_notifications_user ON public.notifications(user_id);
CREATE INDEX idx_notifications_read ON public.notifications(user_id, is_read);
CREATE INDEX idx_notifications_sender ON public.notifications(sender_id);
CREATE INDEX idx_notifications_priority ON public.notifications(user_id, priority, is_read, created_at DESC);
CREATE INDEX idx_email_delivery_user ON public.email_delivery_log(user_id);
CREATE INDEX idx_push_subscriptions_user ON public.push_subscriptions(user_id);
CREATE INDEX idx_push_subscriptions_active ON public.push_subscriptions(user_id, active);
CREATE INDEX idx_push_delivery_user ON public.push_delivery_log(user_id);
CREATE INDEX idx_push_delivery_notification ON public.push_delivery_log(notification_id);
CREATE INDEX idx_alt_dashboard_preferences_updated ON public.alt_dashboard_preferences(updated_at DESC);
CREATE INDEX idx_alt_dashboard_presence_seen ON public.alt_dashboard_presence(last_seen_at DESC);
CREATE INDEX idx_alt_note_folders_user ON public.alt_dashboard_note_folders(user_id, sort_order, name);
CREATE INDEX idx_alt_notes_user_edited ON public.alt_dashboard_notes(user_id, last_edited_at DESC);
CREATE INDEX idx_alt_notes_user_folder ON public.alt_dashboard_notes(user_id, folder_id);
CREATE INDEX idx_alt_notes_user_objective ON public.alt_dashboard_notes(user_id, objective_id);
CREATE INDEX idx_alt_notes_user_pinned ON public.alt_dashboard_notes(user_id, pinned, last_edited_at DESC);
CREATE INDEX idx_alt_note_attachments_user_note ON public.alt_dashboard_note_attachments(user_id, note_id);
CREATE INDEX idx_fix_it_posts_created ON public.fix_it_posts(created_at DESC);
CREATE INDEX idx_fix_it_posts_status ON public.fix_it_posts(status);
CREATE INDEX idx_fix_it_attachments_post ON public.fix_it_attachments(post_id);
CREATE INDEX idx_fix_it_attachments_comment ON public.fix_it_attachments(comment_id);
CREATE INDEX idx_fix_it_comments_post ON public.fix_it_comments(post_id, created_at);
CREATE INDEX idx_org_chart_updates_changed_user ON public.org_chart_updates(changed_user_id);
CREATE INDEX idx_org_chart_updates_changed_by ON public.org_chart_updates(changed_by);
CREATE INDEX idx_org_chart_placeholders_reports_to ON public.org_chart_placeholders(reports_to);
CREATE INDEX idx_org_chart_placeholders_department ON public.org_chart_placeholders(department);

-- ============================================================================
-- UPDATED_AT TRIGGER
-- ============================================================================
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER objectives_updated_at
  BEFORE UPDATE ON public.objectives
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER message_reads_updated_at
  BEFORE UPDATE ON public.objective_message_reads
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER message_reactions_updated_at
  BEFORE UPDATE ON public.message_reactions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER ncr_reports_updated_at
  BEFORE UPDATE ON public.ncr_reports
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER ncr_action_items_updated_at
  BEFORE UPDATE ON public.ncr_action_items
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER ncr_failure_codes_updated_at
  BEFORE UPDATE ON public.ncr_failure_codes
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER workflow_steps_updated_at
  BEFORE UPDATE ON public.objective_workflow_steps
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER push_subscriptions_updated_at
  BEFORE UPDATE ON public.push_subscriptions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER alt_dashboard_preferences_updated_at
  BEFORE UPDATE ON public.alt_dashboard_preferences
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER alt_dashboard_presence_updated_at
  BEFORE UPDATE ON public.alt_dashboard_presence
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER alt_note_folders_updated_at
  BEFORE UPDATE ON public.alt_dashboard_note_folders
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER alt_notes_updated_at
  BEFORE UPDATE ON public.alt_dashboard_notes
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER alt_note_attachments_updated_at
  BEFORE UPDATE ON public.alt_dashboard_note_attachments
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER org_chart_placeholders_updated_at
  BEFORE UPDATE ON public.org_chart_placeholders
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER fix_it_comments_updated_at
  BEFORE UPDATE ON public.fix_it_comments
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

INSERT INTO public.ncr_failure_codes (code, label, category, aliases, tim_approved, active)
VALUES
  ('HRU', 'HRU failure', 'Equipment', '["hru", "hydraulic release unit"]'::jsonb, FALSE, TRUE),
  ('AWC_VALVE', 'AWC valve failure', 'Valve', '["awc valve", "awc", "annular well control"]'::jsonb, FALSE, TRUE),
  ('710_VALVE', '710 valve failure', 'Valve', '["710 valve", "710"]'::jsonb, FALSE, TRUE),
  ('EQUIPMENT_FAILURE', 'Equipment failure', 'General', '["equipment failure", "failed", "failure", "broken"]'::jsonb, FALSE, TRUE),
  ('PROCESS_LOSS', 'Process loss', 'Process', '["process loss", "npt", "non productive"]'::jsonb, FALSE, TRUE),
  ('SUBSTANDARD_CONDITION', 'Substandard condition', 'Condition', '["substandard condition", "condition"]'::jsonb, FALSE, TRUE)
ON CONFLICT (code) DO UPDATE SET
  label = EXCLUDED.label,
  category = EXCLUDED.category,
  aliases = EXCLUDED.aliases,
  active = TRUE;

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
    (NEW.id, 'Complete', 'Close the loop, capture the outcome, and mark the objective complete.', 60, 'todo', NEW.owner_id);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER create_objective_workflow_steps
  AFTER INSERT ON public.objectives
  FOR EACH ROW EXECUTE FUNCTION public.create_default_objective_workflow();

-- ============================================================================
-- ROW LEVEL SECURITY
-- ============================================================================

-- Profiles: everyone can read, users can update their own
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Profiles are viewable by all authenticated users"
  ON public.profiles FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Users can update own profile"
  ON public.profiles FOR UPDATE
  TO authenticated
  USING (auth.uid() = id);

CREATE POLICY "Allow insert during signup"
  ON public.profiles FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = id);

-- Objectives: all authenticated can read, owner/creator/executives can modify
ALTER TABLE public.objectives ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Objectives are viewable by all authenticated users"
  ON public.objectives FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can create objectives"
  ON public.objectives FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = created_by);

CREATE POLICY "Objective team can update objectives"
  ON public.objectives FOR UPDATE
  TO authenticated
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

CREATE POLICY "Objective creators and admins can delete objectives"
  ON public.objectives FOR DELETE
  TO authenticated
  USING (
    auth.uid() = created_by
    OR EXISTS (
      SELECT 1
      FROM public.profiles
      WHERE id = auth.uid()
        AND (role = 'executive' OR lower(email) IN ('jfeil@sandpro.com', 'andrew@ndai.pro'))
    )
  );

-- Messages: all can read, users can insert their own
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Messages are viewable by all authenticated"
  ON public.messages FOR SELECT TO authenticated USING (true);

CREATE POLICY "Users can insert own messages"
  ON public.messages FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own messages"
  ON public.messages FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

ALTER TABLE public.message_reactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Message reactions are viewable by all authenticated"
  ON public.message_reactions FOR SELECT TO authenticated USING (true);

CREATE POLICY "Users manage own message reactions"
  ON public.message_reactions FOR ALL TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

ALTER TABLE public.objective_message_reads ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own message read state"
  ON public.objective_message_reads FOR ALL TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

ALTER TABLE public.ncr_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ncr_action_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ncr_attachments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ncr_audit_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ncr_import_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ncr_signatures ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ncr_failure_codes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "NCR reports viewable by all authenticated"
  ON public.ncr_reports FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated users can create NCR reports"
  ON public.ncr_reports FOR INSERT TO authenticated WITH CHECK (auth.uid() = created_by OR created_by IS NULL);

CREATE POLICY "Authenticated users can update NCR reports"
  ON public.ncr_reports FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "NCR action items viewable by all authenticated"
  ON public.ncr_action_items FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated users can create NCR action items"
  ON public.ncr_action_items FOR INSERT TO authenticated WITH CHECK (auth.uid() = created_by OR created_by IS NULL);

CREATE POLICY "Authenticated users can update NCR action items"
  ON public.ncr_action_items FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Authenticated users can delete NCR action items"
  ON public.ncr_action_items FOR DELETE TO authenticated USING (true);

CREATE POLICY "NCR attachments viewable by all authenticated"
  ON public.ncr_attachments FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated users can create NCR attachments"
  ON public.ncr_attachments FOR INSERT TO authenticated WITH CHECK (auth.uid() = uploaded_by OR uploaded_by IS NULL);

CREATE POLICY "Authenticated users can delete NCR attachments"
  ON public.ncr_attachments FOR DELETE TO authenticated USING (true);

CREATE POLICY "NCR audit events viewable by all authenticated"
  ON public.ncr_audit_events FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated users can create NCR audit events"
  ON public.ncr_audit_events FOR INSERT TO authenticated WITH CHECK (auth.uid() = actor_id OR actor_id IS NULL);

CREATE POLICY "NCR import batches viewable by all authenticated"
  ON public.ncr_import_batches FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated users can create NCR import batches"
  ON public.ncr_import_batches FOR INSERT TO authenticated WITH CHECK (auth.uid() = imported_by OR imported_by IS NULL);

CREATE POLICY "Authenticated users can update NCR import batches"
  ON public.ncr_import_batches FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "NCR signatures viewable by all authenticated"
  ON public.ncr_signatures FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated users can create NCR signatures"
  ON public.ncr_signatures FOR INSERT TO authenticated WITH CHECK (auth.uid() = created_by OR created_by IS NULL);

CREATE POLICY "NCR failure codes viewable by all authenticated"
  ON public.ncr_failure_codes FOR SELECT TO authenticated USING (true);

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

-- Subtasks
ALTER TABLE public.subtasks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Subtasks viewable by all authenticated"
  ON public.subtasks FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated can insert subtasks"
  ON public.subtasks FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "Authenticated can update subtasks"
  ON public.subtasks FOR UPDATE TO authenticated USING (true);

CREATE POLICY "Authenticated can delete subtasks"
  ON public.subtasks FOR DELETE TO authenticated USING (true);

-- Objective Updates
ALTER TABLE public.objective_updates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Updates viewable by all authenticated"
  ON public.objective_updates FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated can insert updates"
  ON public.objective_updates FOR INSERT TO authenticated WITH CHECK (true);

-- Files
ALTER TABLE public.files ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Files viewable by all authenticated"
  ON public.files FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated can insert files"
  ON public.files FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "Authenticated can delete own or executive files"
  ON public.files FOR DELETE TO authenticated
  USING (
    auth.uid() = uploaded_by
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

INSERT INTO storage.buckets (id, name, public)
VALUES ('alt-note-files', 'alt-note-files', false)
ON CONFLICT (id) DO UPDATE SET public = false;

CREATE POLICY "Authenticated users can read objective file objects"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'objective-files');

CREATE POLICY "Authenticated users can upload objective file objects"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'objective-files' AND owner = auth.uid());

CREATE POLICY "Upload owners and executives can delete objective file objects"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'objective-files'
    AND (
      owner = auth.uid()
      OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'executive')
    )
  );

CREATE POLICY "Authenticated users can read Fix-It file objects"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'fix-it-files');

CREATE POLICY "Authenticated users can read NCR file objects"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'ncr-files');

CREATE POLICY "Users can read own alt note file objects"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'alt-note-files'
    AND owner = auth.uid()
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY "Authenticated users can upload Fix-It file objects"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'fix-it-files' AND owner = auth.uid());

CREATE POLICY "Authenticated users can upload NCR file objects"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'ncr-files' AND owner = auth.uid());

CREATE POLICY "Users can upload own alt note file objects"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'alt-note-files'
    AND owner = auth.uid()
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY "Users can update own alt note file objects"
  ON storage.objects FOR UPDATE TO authenticated
  USING (
    bucket_id = 'alt-note-files'
    AND owner = auth.uid()
    AND (storage.foldername(name))[1] = auth.uid()::text
  )
  WITH CHECK (
    bucket_id = 'alt-note-files'
    AND owner = auth.uid()
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

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

CREATE POLICY "NCR upload owners and executives can delete file objects"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'ncr-files'
    AND (
      owner = auth.uid()
      OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'executive')
    )
  );

CREATE POLICY "Users can delete own alt note file objects"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'alt-note-files'
    AND owner = auth.uid()
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

ALTER TABLE public.objective_members ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members viewable by all authenticated"
  ON public.objective_members FOR SELECT TO authenticated USING (true);

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

ALTER TABLE public.objective_metric_checkins ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Metric checkins viewable by all authenticated"
  ON public.objective_metric_checkins FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated can insert metric checkins"
  ON public.objective_metric_checkins FOR INSERT TO authenticated WITH CHECK (auth.uid() = created_by);

ALTER TABLE public.objective_workflow_steps ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Workflow steps viewable by all authenticated"
  ON public.objective_workflow_steps FOR SELECT TO authenticated USING (true);

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

ALTER TABLE public.objective_agent_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Agent runs viewable by all authenticated"
  ON public.objective_agent_runs FOR SELECT TO authenticated USING (true);

ALTER TABLE public.notification_preferences ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own notification preferences"
  ON public.notification_preferences FOR SELECT TO authenticated USING (auth.uid() = user_id);

CREATE POLICY "Users upsert own notification preferences"
  ON public.notification_preferences FOR ALL TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

ALTER TABLE public.email_delivery_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own email delivery log"
  ON public.email_delivery_log FOR SELECT TO authenticated USING (auth.uid() = user_id);

ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own push subscriptions"
  ON public.push_subscriptions FOR ALL TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

ALTER TABLE public.push_delivery_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own push delivery log"
  ON public.push_delivery_log FOR SELECT TO authenticated USING (auth.uid() = user_id);

ALTER TABLE public.alt_dashboard_preferences ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own alt dashboard preferences"
  ON public.alt_dashboard_preferences FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users upsert own alt dashboard preferences"
  ON public.alt_dashboard_preferences FOR ALL TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

ALTER TABLE public.alt_dashboard_presence ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Alt dashboard presence viewable by authenticated users"
  ON public.alt_dashboard_presence FOR SELECT TO authenticated
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "Users upsert own alt dashboard presence"
  ON public.alt_dashboard_presence FOR ALL TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

ALTER TABLE public.alt_dashboard_note_folders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own alt note folders"
  ON public.alt_dashboard_note_folders FOR ALL TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

ALTER TABLE public.alt_dashboard_notes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own alt notes"
  ON public.alt_dashboard_notes FOR ALL TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

ALTER TABLE public.alt_dashboard_note_attachments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own alt note attachments"
  ON public.alt_dashboard_note_attachments FOR ALL TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

ALTER TABLE public.fix_it_posts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Fix-It posts viewable by all authenticated"
  ON public.fix_it_posts FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated users can create Fix-It posts"
  ON public.fix_it_posts FOR INSERT TO authenticated WITH CHECK (auth.uid() = created_by);

CREATE POLICY "Authenticated users can update Fix-It posts"
  ON public.fix_it_posts FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

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

ALTER TABLE public.fix_it_comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fix_it_attachments ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.org_chart_updates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.org_chart_placeholders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Fix-It attachments viewable by all authenticated"
  ON public.fix_it_attachments FOR SELECT TO authenticated USING (true);

CREATE POLICY "Fix-It comments viewable by all authenticated"
  ON public.fix_it_comments FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated users can create Fix-It comments"
  ON public.fix_it_comments FOR INSERT TO authenticated WITH CHECK (auth.uid() = created_by);

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

CREATE POLICY "Authenticated users can create Fix-It attachments"
  ON public.fix_it_attachments FOR INSERT TO authenticated WITH CHECK (auth.uid() = uploaded_by);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.fix_it_comments TO authenticated;
GRANT SELECT, INSERT ON public.fix_it_attachments TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.alt_dashboard_preferences TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.alt_dashboard_presence TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.alt_dashboard_note_folders TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.alt_dashboard_notes TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.alt_dashboard_note_attachments TO authenticated;

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

CREATE POLICY "Org placeholders viewable by all authenticated"
  ON public.org_chart_placeholders FOR SELECT TO authenticated USING (true);

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

-- Notifications: users can only see/modify their own
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own notifications"
  ON public.notifications FOR SELECT TO authenticated
  USING (auth.uid() = user_id OR auth.uid() = sender_id);

CREATE POLICY "System can insert notifications"
  ON public.notifications FOR INSERT TO authenticated
  WITH CHECK (sender_id IS NULL OR sender_id = auth.uid());

CREATE POLICY "Users can update own notifications"
  ON public.notifications FOR UPDATE TO authenticated
  USING (auth.uid() = user_id);

-- ============================================================================
-- REALTIME (enable for live updates)
-- ============================================================================
ALTER PUBLICATION supabase_realtime ADD TABLE public.messages;
ALTER PUBLICATION supabase_realtime ADD TABLE public.message_reactions;
ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;
ALTER PUBLICATION supabase_realtime ADD TABLE public.objectives;
ALTER PUBLICATION supabase_realtime ADD TABLE public.files;
ALTER PUBLICATION supabase_realtime ADD TABLE public.alt_dashboard_preferences;
ALTER PUBLICATION supabase_realtime ADD TABLE public.alt_dashboard_presence;
ALTER PUBLICATION supabase_realtime ADD TABLE public.alt_dashboard_note_folders;
ALTER PUBLICATION supabase_realtime ADD TABLE public.alt_dashboard_notes;
ALTER PUBLICATION supabase_realtime ADD TABLE public.alt_dashboard_note_attachments;
ALTER PUBLICATION supabase_realtime ADD TABLE public.objective_members;
ALTER PUBLICATION supabase_realtime ADD TABLE public.objective_metric_checkins;
ALTER PUBLICATION supabase_realtime ADD TABLE public.objective_agent_runs;
ALTER PUBLICATION supabase_realtime ADD TABLE public.objective_workflow_steps;
ALTER PUBLICATION supabase_realtime ADD TABLE public.ncr_reports;
ALTER PUBLICATION supabase_realtime ADD TABLE public.ncr_action_items;
ALTER PUBLICATION supabase_realtime ADD TABLE public.ncr_attachments;
ALTER PUBLICATION supabase_realtime ADD TABLE public.ncr_audit_events;
ALTER PUBLICATION supabase_realtime ADD TABLE public.ncr_signatures;
ALTER PUBLICATION supabase_realtime ADD TABLE public.ncr_import_batches;
ALTER PUBLICATION supabase_realtime ADD TABLE public.ncr_failure_codes;
ALTER PUBLICATION supabase_realtime ADD TABLE public.fix_it_posts;
ALTER PUBLICATION supabase_realtime ADD TABLE public.fix_it_attachments;
ALTER PUBLICATION supabase_realtime ADD TABLE public.fix_it_comments;
ALTER PUBLICATION supabase_realtime ADD TABLE public.org_chart_updates;
ALTER PUBLICATION supabase_realtime ADD TABLE public.org_chart_placeholders;

-- ============================================================================
-- HELPER FUNCTION: Create profile after signup
-- ============================================================================
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, name, initials, email, title, department, role, color)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'name', split_part(NEW.email, '@', 1)),
    COALESCE(NEW.raw_user_meta_data->>'initials', UPPER(LEFT(split_part(NEW.email, '@', 1), 2))),
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'title', ''),
    COALESCE(NEW.raw_user_meta_data->>'department', ''),
    COALESCE((NEW.raw_user_meta_data->>'role')::user_role, 'contributor'),
    COALESCE(NEW.raw_user_meta_data->>'color', '#ff7f02')
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
