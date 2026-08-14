-- The client permission contract treats both executives and managers as
-- platform admins. Keep the database update policy aligned so managers do not
-- see editable controls that are rejected by RLS.
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
        and viewer.role in ('executive', 'manager')
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
        and viewer.role in ('executive', 'manager')
    )
  );
