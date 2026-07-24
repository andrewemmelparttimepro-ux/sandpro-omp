-- Project-level teammate tags.
-- The project lead remains the accountable owner; these rows add supporting teammates.

create table if not exists public.okr_project_members (
  id uuid primary key default uuid_generate_v4(),
  project_id uuid not null references public.okr_projects(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  role text not null default 'member',
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint okr_project_members_project_user_key unique (project_id, user_id),
  constraint okr_project_members_role_check check (role in ('member', 'manager'))
);

create index if not exists idx_okr_project_members_user
  on public.okr_project_members(user_id, project_id);

alter table public.okr_project_members enable row level security;

grant select, insert, update, delete on public.okr_project_members to authenticated;

drop policy if exists "OKR project members viewable by authenticated" on public.okr_project_members;
create policy "OKR project members viewable by authenticated"
  on public.okr_project_members
  for select
  to authenticated
  using (true);

drop policy if exists "Project owners manage project members" on public.okr_project_members;
create policy "Project owners manage project members"
  on public.okr_project_members
  for all
  to authenticated
  using (
    exists (
      select 1
      from public.okr_projects project
      where project.id = project_id
        and (
          project.created_by = (select auth.uid())
          or project.sponsor_id = (select auth.uid())
          or project.lead_id = (select auth.uid())
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
      from public.okr_projects project
      where project.id = project_id
        and (
          project.created_by = (select auth.uid())
          or project.sponsor_id = (select auth.uid())
          or project.lead_id = (select auth.uid())
        )
    )
    or exists (
      select 1
      from public.profiles viewer
      where viewer.id = (select auth.uid())
        and viewer.role = 'executive'
    )
  );

do $$
begin
  alter publication supabase_realtime add table public.okr_project_members;
exception when duplicate_object then
  null;
end $$;
