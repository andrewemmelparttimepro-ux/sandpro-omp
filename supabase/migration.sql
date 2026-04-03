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
  color TEXT NOT NULL DEFAULT '#F97316',
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

-- Subtasks
CREATE TABLE public.subtasks (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  objective_id UUID NOT NULL REFERENCES public.objectives(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  progress INT NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'not_started',
  owner_id UUID NOT NULL REFERENCES public.profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Objective Updates (activity log)
CREATE TABLE public.objective_updates (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  objective_id UUID NOT NULL REFERENCES public.objectives(id) ON DELETE CASCADE,
  status TEXT NOT NULL,
  progress INT NOT NULL DEFAULT 0,
  note TEXT DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Files
CREATE TABLE public.files (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  objective_id UUID NOT NULL REFERENCES public.objectives(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  type TEXT DEFAULT 'file',
  size TEXT DEFAULT '',
  url TEXT DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Notifications
CREATE TABLE public.notifications (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  type TEXT NOT NULL DEFAULT 'info',
  objective_id UUID REFERENCES public.objectives(id) ON DELETE CASCADE,
  message TEXT NOT NULL,
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
CREATE INDEX idx_subtasks_objective ON public.subtasks(objective_id);
CREATE INDEX idx_updates_objective ON public.objective_updates(objective_id);
CREATE INDEX idx_files_objective ON public.files(objective_id);
CREATE INDEX idx_notifications_user ON public.notifications(user_id);
CREATE INDEX idx_notifications_read ON public.notifications(user_id, is_read);

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

CREATE POLICY "Owners and creators can update objectives"
  ON public.objectives FOR UPDATE
  TO authenticated
  USING (
    auth.uid() = owner_id
    OR auth.uid() = created_by
    OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'executive')
  );

CREATE POLICY "Owners and creators can delete objectives"
  ON public.objectives FOR DELETE
  TO authenticated
  USING (
    auth.uid() = owner_id
    OR auth.uid() = created_by
    OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'executive')
  );

-- Messages: all can read, users can insert their own
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Messages are viewable by all authenticated"
  ON public.messages FOR SELECT TO authenticated USING (true);

CREATE POLICY "Users can insert own messages"
  ON public.messages FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- Subtasks
ALTER TABLE public.subtasks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Subtasks viewable by all authenticated"
  ON public.subtasks FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated can insert subtasks"
  ON public.subtasks FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "Authenticated can update subtasks"
  ON public.subtasks FOR UPDATE TO authenticated USING (true);

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

-- Notifications: users can only see/modify their own
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own notifications"
  ON public.notifications FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "System can insert notifications"
  ON public.notifications FOR INSERT TO authenticated
  WITH CHECK (true);

CREATE POLICY "Users can update own notifications"
  ON public.notifications FOR UPDATE TO authenticated
  USING (auth.uid() = user_id);

-- ============================================================================
-- REALTIME (enable for live updates)
-- ============================================================================
ALTER PUBLICATION supabase_realtime ADD TABLE public.messages;
ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;
ALTER PUBLICATION supabase_realtime ADD TABLE public.objectives;

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
    COALESCE(NEW.raw_user_meta_data->>'color', '#F97316')
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
