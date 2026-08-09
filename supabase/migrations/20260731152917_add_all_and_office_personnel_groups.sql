-- Add the two simple company-wide assignment choices confirmed in the
-- July 29 NCR and tagging review. Keep QA and external platform accounts out
-- of the broadcast groups by anchoring membership to SandPro email accounts.

insert into public.assignment_groups (name, slug, description)
values
  (
    'ALL Personnel',
    'all-personnel',
    'Company-wide SandPro assignment group containing every SandPro employee account.'
  ),
  (
    'Office Personnel',
    'office-personnel',
    'SandPro office and administration personnel.'
  )
on conflict (slug) do update
set
  name = excluded.name,
  description = excluded.description,
  is_active = true;

delete from public.assignment_group_members member
using public.assignment_groups assignment_group
where member.group_id = assignment_group.id
  and assignment_group.slug in ('all-personnel', 'office-personnel');

insert into public.assignment_group_members (group_id, user_id, created_by)
select assignment_group.id, profile.id, null
from public.assignment_groups assignment_group
cross join public.profiles profile
where assignment_group.slug = 'all-personnel'
  and lower(coalesce(profile.email, '')) like '%@sandpro.com'
on conflict (group_id, user_id) do nothing;

insert into public.assignment_group_members (group_id, user_id, created_by)
select assignment_group.id, profile.id, null
from public.assignment_groups assignment_group
cross join public.profiles profile
where assignment_group.slug = 'office-personnel'
  and lower(coalesce(profile.email, '')) like '%@sandpro.com'
  and lower(coalesce(profile.department, '')) = 'admin'
on conflict (group_id, user_id) do nothing;
