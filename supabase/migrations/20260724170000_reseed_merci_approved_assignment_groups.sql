-- Correct the approved roster seed as two ordered statements.
-- Data-modifying CTEs that touch the same table share a snapshot and must not
-- be used for delete-then-insert replacement.

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
