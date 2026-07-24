-- Merci's 2026-07-24 confirmation:
-- - reporting lines may have multiple equal-rank managers
-- - the eight rotating-group rosters below are approved

create table if not exists public.profile_managers (
  employee_id uuid not null references public.profiles(id) on delete cascade,
  manager_id uuid not null references public.profiles(id) on delete cascade,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (employee_id, manager_id),
  constraint profile_managers_no_self_management check (employee_id <> manager_id)
);

create index if not exists idx_profile_managers_manager
  on public.profile_managers(manager_id, employee_id);
create index if not exists idx_profile_managers_created_by
  on public.profile_managers(created_by)
  where created_by is not null;

alter table public.profile_managers enable row level security;
grant select, insert, update, delete on public.profile_managers to authenticated;

drop policy if exists "Profile managers viewable by authenticated" on public.profile_managers;
create policy "Profile managers viewable by authenticated"
  on public.profile_managers
  for select
  to authenticated
  using (true);

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

-- Preserve every existing reporting line as the first equal-rank relationship.
insert into public.profile_managers (employee_id, manager_id)
select profile.id, profile.reports_to
from public.profiles profile
where profile.reports_to is not null
on conflict (employee_id, manager_id) do nothing;

-- Merci confirmed that these 31 employees report to Isaac and Zedek equally.
with dual_managed_employee_names(name) as (
  values
    ('Garl McGraw'),
    ('Julius Williams'),
    ('Hunter Jones'),
    ('Richard Griffin'),
    ('Phillip Leviner'),
    ('Bob Young'),
    ('Curtis Jones'),
    ('Corey Sharkey'),
    ('Logan Howard'),
    ('Austin Dees'),
    ('Marcos Vega'),
    ('Brian Brower'),
    ('Kris Trone'),
    ('Fred Floyd Jr.'),
    ('Joseph Dingal'),
    ('Shane Vogel'),
    ('Abel Lua'),
    ('Bill Anderson'),
    ('Jake Beck'),
    ('Able Conley'),
    ('Wyatt Phipps'),
    ('Austin Griffin'),
    ('Jean Bazile'),
    ('Kobie Jones'),
    ('Josef Mcconnell'),
    ('Kevin Johnson'),
    ('Jeremy Tate'),
    ('Jerimiah Howard'),
    ('Nick Reiter'),
    ('Dexter Sotelo'),
    ('Dion Carter')
),
employees as (
  select profile.id
  from public.profiles profile
  join dual_managed_employee_names approved
    on lower(profile.name) = lower(approved.name)
),
managers as (
  select profile.id
  from public.profiles profile
  where lower(profile.name) in ('isaac badillo', 'zedek harris')
)
insert into public.profile_managers (employee_id, manager_id)
select employee.id, manager.id
from employees employee
cross join managers manager
on conflict (employee_id, manager_id) do nothing;

-- Replace the provisional rotating-group rosters with Merci's approved list.
delete from public.assignment_group_members member
using public.assignment_groups assignment_group
where member.group_id = assignment_group.id
  and assignment_group.slug in (
    'dispatch',
    'field-service-managers',
    'trainers',
    'sales-team',
    'cp-shop-leads',
    'flowback-shop-leads',
    'wellhead-shop-leads',
    'leadership-business-team'
  );

with approved_group_members(group_slug, member_name) as (
  values
    ('dispatch', 'Dustin Saunders'),
    ('dispatch', 'Gershom Dingal'),
    ('dispatch', 'Luke Feil'),
    ('dispatch', 'Shawn Cockrell'),
    ('field-service-managers', 'Isaac Badillo'),
    ('field-service-managers', 'Zedek Harris'),
    ('trainers', 'Bryce Christoffersen'),
    ('trainers', 'Brad Beck'),
    ('sales-team', 'John Sommerfeld'),
    ('sales-team', 'Jon Ostby'),
    ('sales-team', 'Brandon Schatz'),
    ('sales-team', 'Josh Pfeifer'),
    ('sales-team', 'Joshua Blackaby'),
    ('cp-shop-leads', 'Kelby Kraft'),
    ('cp-shop-leads', 'Eric Macy'),
    ('cp-shop-leads', 'Tim Dibben'),
    ('flowback-shop-leads', 'Matthew Bornschein'),
    ('flowback-shop-leads', 'Jaelen Maslowski'),
    ('flowback-shop-leads', 'Tim Dibben'),
    ('wellhead-shop-leads', 'Thomas Goldsberry'),
    ('wellhead-shop-leads', 'Jeramiah Walls'),
    ('wellhead-shop-leads', 'Jaelen Maslowski'),
    ('wellhead-shop-leads', 'Tim Dibben'),
    ('leadership-business-team', 'Jake Feil'),
    ('leadership-business-team', 'Joshua Blackaby'),
    ('leadership-business-team', 'Andrew Emmel'),
    ('leadership-business-team', 'Tim Dibben'),
    ('leadership-business-team', 'Kelby Kraft'),
    ('leadership-business-team', 'Drew Anderson'),
    ('leadership-business-team', 'Malcolm Blackaby'),
    ('leadership-business-team', 'Mark Elliott'),
    ('leadership-business-team', 'Kayla Sebastian'),
    ('leadership-business-team', 'Heather Allard-Kotaska'),
    ('leadership-business-team', 'Adam Allan'),
    ('leadership-business-team', 'Jaelen Maslowski')
)
insert into public.assignment_group_members (group_id, user_id, created_by)
select assignment_group.id, profile.id, null
from approved_group_members approved
join public.assignment_groups assignment_group
  on assignment_group.slug = approved.group_slug
join public.profiles profile
  on lower(profile.name) = lower(approved.member_name)
on conflict (group_id, user_id) do nothing;
