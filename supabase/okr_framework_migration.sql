-- OMP bridge plan, Domain 1/4 — framework taxonomy columns on objectives.
-- APPLIED to project sandpro_objectives (whgrkfhuzgwmbelocnhq) on 2026-06-27
-- via Supabase migration `omp_framework_class_and_okr_group`. Kept here for the
-- repo record / re-apply. All additive + nullable: invisible to the running app
-- until populated, fully reversible (DROP COLUMN).
alter table public.objectives add column if not exists class text;
alter table public.objectives add column if not exists okr_group text;
alter table public.objectives add column if not exists audit_form_use text;
alter table public.objectives add column if not exists baseline_text text;
alter table public.objectives add column if not exists target_text text;

comment on column public.objectives.class is 'OMP framework Class (second-level selection under department)';
comment on column public.objectives.okr_group is 'Original OKR group name (17 groups) kept as a sub-tag under the 5 framework departments';
comment on column public.objectives.audit_form_use is 'OKR Audit form Use (Y/N)';
comment on column public.objectives.baseline_text is 'Qualitative baseline when not numeric';
comment on column public.objectives.target_text is 'Qualitative target when not numeric';

notify pgrst, 'reload schema';
