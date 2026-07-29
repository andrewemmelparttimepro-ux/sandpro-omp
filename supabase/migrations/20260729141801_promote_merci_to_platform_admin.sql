-- The OMP authorization model uses the executive role for platform admins.
-- Merci's organizational department was Admin, but her authorization role was
-- still contributor, leaving company OKRs locked and causing RLS to reject
-- global edits.
update public.profiles
set role = 'executive'::public.user_role
where lower(email) = 'mjimenez@sandpro.com'
  and role is distinct from 'executive'::public.user_role;

-- Keep the auth fallback consistent if the profile query is temporarily
-- unavailable during sign-in.
update auth.users
set raw_user_meta_data = coalesce(raw_user_meta_data, '{}'::jsonb)
  || jsonb_build_object('role', 'executive')
where lower(email) = 'mjimenez@sandpro.com'
  and coalesce(raw_user_meta_data->>'role', '') is distinct from 'executive';
