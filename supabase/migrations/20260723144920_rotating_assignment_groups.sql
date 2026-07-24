-- Optional rotating assignment groups for Tasks / OKRs.
-- A work item is assigned to exactly one person OR one group.

create table if not exists public.assignment_groups (
  id uuid primary key default uuid_generate_v4(),
  name text not null,
  slug text not null,
  description text not null default '',
  is_active boolean not null default true,
  created_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint assignment_groups_name_key unique (name),
  constraint assignment_groups_slug_key unique (slug),
  constraint assignment_groups_slug_format check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$')
);

create table if not exists public.assignment_group_members (
  group_id uuid not null references public.assignment_groups(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (group_id, user_id)
);

alter table public.objectives
  add column if not exists assignment_group_id uuid
    references public.assignment_groups(id) on delete restrict;

alter table public.objectives
  alter column owner_id drop not null;

alter table public.objectives
  drop constraint if exists objectives_one_assignment_target;

alter table public.objectives
  add constraint objectives_one_assignment_target
  check (
    (owner_id is not null and assignment_group_id is null)
    or (owner_id is null and assignment_group_id is not null)
  ) not valid;

alter table public.objectives
  validate constraint objectives_one_assignment_target;

create index if not exists idx_objectives_assignment_group
  on public.objectives(assignment_group_id)
  where assignment_group_id is not null;

create index if not exists idx_assignment_group_members_user
  on public.assignment_group_members(user_id, group_id);

drop trigger if exists set_assignment_groups_updated_at on public.assignment_groups;
create trigger set_assignment_groups_updated_at
  before update on public.assignment_groups
  for each row execute function public.set_updated_at();

alter table public.assignment_groups enable row level security;
alter table public.assignment_group_members enable row level security;

grant select, insert, update, delete on public.assignment_groups to authenticated;
grant select, insert, update, delete on public.assignment_group_members to authenticated;

drop policy if exists "Assignment groups viewable by authenticated" on public.assignment_groups;
create policy "Assignment groups viewable by authenticated"
  on public.assignment_groups
  for select
  to authenticated
  using (true);

drop policy if exists "Assignment group members viewable by authenticated" on public.assignment_group_members;
create policy "Assignment group members viewable by authenticated"
  on public.assignment_group_members
  for select
  to authenticated
  using (true);

drop policy if exists "Platform admins manage assignment groups" on public.assignment_groups;
create policy "Platform admins manage assignment groups"
  on public.assignment_groups
  for all
  to authenticated
  using (
    exists (
      select 1
      from public.profiles viewer
      where viewer.id = (select auth.uid())
        and (
          viewer.role = 'executive'
          or lower(viewer.email) in (
            'mjimenez@sandpro.com',
            'tdibben@sandpro.com',
            'jfeil@sandpro.com',
            'andrew@ndai.pro'
          )
        )
    )
  )
  with check (
    exists (
      select 1
      from public.profiles viewer
      where viewer.id = (select auth.uid())
        and (
          viewer.role = 'executive'
          or lower(viewer.email) in (
            'mjimenez@sandpro.com',
            'tdibben@sandpro.com',
            'jfeil@sandpro.com',
            'andrew@ndai.pro'
          )
        )
    )
  );

drop policy if exists "Platform admins manage assignment group members" on public.assignment_group_members;
create policy "Platform admins manage assignment group members"
  on public.assignment_group_members
  for all
  to authenticated
  using (
    exists (
      select 1
      from public.profiles viewer
      where viewer.id = (select auth.uid())
        and (
          viewer.role = 'executive'
          or lower(viewer.email) in (
            'mjimenez@sandpro.com',
            'tdibben@sandpro.com',
            'jfeil@sandpro.com',
            'andrew@ndai.pro'
          )
        )
    )
  )
  with check (
    exists (
      select 1
      from public.profiles viewer
      where viewer.id = (select auth.uid())
        and (
          viewer.role = 'executive'
          or lower(viewer.email) in (
            'mjimenez@sandpro.com',
            'tdibben@sandpro.com',
            'jfeil@sandpro.com',
            'andrew@ndai.pro'
          )
        )
    )
  );

drop policy if exists "Owners creators can update" on public.objectives;
drop policy if exists "Objective team can update objectives" on public.objectives;
create policy "Objective team can update objectives"
  on public.objectives
  for update
  to authenticated
  using (
    (select auth.uid()) = owner_id
    or (select auth.uid()) = created_by
    or exists (
      select 1
      from public.objective_members member
      where member.objective_id = objectives.id
        and member.user_id = (select auth.uid())
        and member.role in ('assignee', 'manager')
    )
    or exists (
      select 1
      from public.assignment_group_members group_member
      where group_member.group_id = objectives.assignment_group_id
        and group_member.user_id = (select auth.uid())
    )
    or exists (
      select 1
      from public.profiles viewer
      where viewer.id = (select auth.uid())
        and viewer.role = 'executive'
    )
  )
  with check (
    (select auth.uid()) = owner_id
    or (select auth.uid()) = created_by
    or exists (
      select 1
      from public.objective_members member
      where member.objective_id = objectives.id
        and member.user_id = (select auth.uid())
        and member.role in ('assignee', 'manager')
    )
    or exists (
      select 1
      from public.assignment_group_members group_member
      where group_member.group_id = objectives.assignment_group_id
        and group_member.user_id = (select auth.uid())
    )
    or exists (
      select 1
      from public.profiles viewer
      where viewer.id = (select auth.uid())
        and viewer.role = 'executive'
    )
  );

drop policy if exists "Executives and objective owners manage members" on public.objective_members;
create policy "Executives and objective owners manage members"
  on public.objective_members
  for all
  to authenticated
  using (
    exists (
      select 1
      from public.objectives objective
      where objective.id = objective_id
        and (
          objective.owner_id = (select auth.uid())
          or objective.created_by = (select auth.uid())
          or exists (
            select 1
            from public.assignment_group_members group_member
            where group_member.group_id = objective.assignment_group_id
              and group_member.user_id = (select auth.uid())
          )
        )
    )
    or exists (
      select 1
      from public.profiles viewer
      where viewer.id = (select auth.uid())
        and viewer.role = 'executive'
    )
  )
  with check (
    exists (
      select 1
      from public.objectives objective
      where objective.id = objective_id
        and (
          objective.owner_id = (select auth.uid())
          or objective.created_by = (select auth.uid())
          or exists (
            select 1
            from public.assignment_group_members group_member
            where group_member.group_id = objective.assignment_group_id
              and group_member.user_id = (select auth.uid())
          )
        )
    )
    or exists (
      select 1
      from public.profiles viewer
      where viewer.id = (select auth.uid())
        and viewer.role = 'executive'
    )
  );

drop policy if exists "Objective team manages workflow steps" on public.objective_workflow_steps;
create policy "Objective team manages workflow steps"
  on public.objective_workflow_steps
  for all
  to authenticated
  using (
    exists (
      select 1
      from public.objectives objective
      where objective.id = objective_id
        and (
          objective.owner_id = (select auth.uid())
          or objective.created_by = (select auth.uid())
          or exists (
            select 1
            from public.assignment_group_members group_member
            where group_member.group_id = objective.assignment_group_id
              and group_member.user_id = (select auth.uid())
          )
        )
    )
    or exists (
      select 1
      from public.objective_members member
      where member.objective_id = objective_id
        and member.user_id = (select auth.uid())
        and member.role in ('assignee', 'manager')
    )
    or exists (
      select 1
      from public.profiles viewer
      where viewer.id = (select auth.uid())
        and viewer.role = 'executive'
    )
  )
  with check (
    exists (
      select 1
      from public.objectives objective
      where objective.id = objective_id
        and (
          objective.owner_id = (select auth.uid())
          or objective.created_by = (select auth.uid())
          or exists (
            select 1
            from public.assignment_group_members group_member
            where group_member.group_id = objective.assignment_group_id
              and group_member.user_id = (select auth.uid())
          )
        )
    )
    or exists (
      select 1
      from public.objective_members member
      where member.objective_id = objective_id
        and member.user_id = (select auth.uid())
        and member.role in ('assignee', 'manager')
    )
    or exists (
      select 1
      from public.profiles viewer
      where viewer.id = (select auth.uid())
        and viewer.role = 'executive'
    )
  );

insert into public.assignment_groups (name, slug, description)
values
  ('Dispatch', 'dispatch', 'Rotating Operations Coordinator and Dispatch coverage.'),
  ('Field Service Managers', 'field-service-managers', 'Rotating field-service management coverage.'),
  ('Trainers', 'trainers', 'Field trainer coverage.'),
  ('Sales Team', 'sales-team', 'Shared sales ownership for co-mingled goals.'),
  ('CP Shop Leads', 'cp-shop-leads', 'Customer Property Warehouse shop leadership.'),
  ('Flowback Shop Leads', 'flowback-shop-leads', 'Flowback shop leadership and rotating coverage.'),
  ('Wellhead Shop Leads', 'wellhead-shop-leads', 'Wellhead shop leadership and rotating coverage.'),
  ('Leadership / Business Team', 'leadership-business-team', 'Leadership and business-team roll-up.')
on conflict (slug) do update
set
  name = excluded.name,
  description = excluded.description,
  is_active = true;

-- Preserve every NCR import revision while the stable report keeps its ID,
-- attachments, action items, workflow state, and signatures.
create table if not exists public.ncr_import_revisions (
  id uuid primary key default uuid_generate_v4(),
  ncr_id uuid not null references public.ncr_reports(id) on delete cascade,
  batch_id uuid references public.ncr_import_batches(id) on delete set null,
  report_number text not null,
  action text not null check (action in ('created', 'refreshed')),
  previous_source_record jsonb not null default '{}'::jsonb,
  imported_source_record jsonb not null default '{}'::jsonb,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists idx_ncr_import_revisions_ncr_created
  on public.ncr_import_revisions(ncr_id, created_at desc);

alter table public.ncr_import_revisions enable row level security;
grant select, insert on public.ncr_import_revisions to authenticated;

drop policy if exists "Authenticated users view NCR import revisions" on public.ncr_import_revisions;
create policy "Authenticated users view NCR import revisions"
  on public.ncr_import_revisions
  for select
  to authenticated
  using (true);

drop policy if exists "NCR importers record revisions" on public.ncr_import_revisions;
create policy "NCR importers record revisions"
  on public.ncr_import_revisions
  for insert
  to authenticated
  with check (created_by = (select auth.uid()));

do $$
begin
  alter publication supabase_realtime add table public.assignment_groups;
exception when duplicate_object then
  null;
end $$;

do $$
begin
  alter publication supabase_realtime add table public.assignment_group_members;
exception when duplicate_object then
  null;
end $$;
