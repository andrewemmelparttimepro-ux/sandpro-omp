-- Keep project teammate writes owner-controlled without adding a second SELECT policy.

create index if not exists idx_okr_project_members_created_by
  on public.okr_project_members(created_by)
  where created_by is not null;

drop policy if exists "Project owners manage project members" on public.okr_project_members;

drop policy if exists "Project owners add project members" on public.okr_project_members;
create policy "Project owners add project members"
  on public.okr_project_members
  for insert
  to authenticated
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

drop policy if exists "Project owners update project members" on public.okr_project_members;
create policy "Project owners update project members"
  on public.okr_project_members
  for update
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

drop policy if exists "Project owners remove project members" on public.okr_project_members;
create policy "Project owners remove project members"
  on public.okr_project_members
  for delete
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
  );
