-- Keep the broad read policy while limiting writes to named platform admins.
-- Separate write policies avoid overlapping the authenticated SELECT policy.

create index if not exists idx_profile_managers_created_by
  on public.profile_managers(created_by)
  where created_by is not null;

drop policy if exists "Platform admins manage profile managers" on public.profile_managers;

drop policy if exists "Platform admins insert profile managers" on public.profile_managers;
create policy "Platform admins insert profile managers"
  on public.profile_managers
  for insert
  to authenticated
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

drop policy if exists "Platform admins update profile managers" on public.profile_managers;
create policy "Platform admins update profile managers"
  on public.profile_managers
  for update
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

drop policy if exists "Platform admins delete profile managers" on public.profile_managers;
create policy "Platform admins delete profile managers"
  on public.profile_managers
  for delete
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
  );
