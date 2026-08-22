create or replace function public.add_objective_workflow_step_atomic(
  p_objective_id uuid,
  p_title text,
  p_description text default '',
  p_requested_order integer default 0,
  p_status text default 'todo',
  p_owner_id uuid default null,
  p_due_date timestamptz default null
)
returns setof public.objective_workflow_steps
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
begin
  if p_objective_id is null then
    raise exception using errcode = '22004', message = 'objective_id is required';
  end if;
  if nullif(btrim(coalesce(p_title, '')), '') is null then
    raise exception using errcode = '22023', message = 'workflow step title is required';
  end if;

  -- Serialize only writers for this objective. RLS still applies because this
  -- is SECURITY INVOKER; the lock removes the max(step_order)+10 race without
  -- broadening who may add a step.
  perform pg_advisory_xact_lock(hashtextextended(p_objective_id::text, 0));

  return query
  insert into public.objective_workflow_steps (
    objective_id, title, description, step_order, status, owner_id, due_date
  )
  values (
    p_objective_id,
    btrim(p_title),
    coalesce(p_description, ''),
    greatest(
      coalesce(p_requested_order, 0),
      coalesce((
        select max(existing.step_order)
        from public.objective_workflow_steps existing
        where existing.objective_id = p_objective_id
      ), 0) + 10
    ),
    coalesce(nullif(p_status, ''), 'todo'),
    p_owner_id,
    p_due_date
  )
  returning *;
end;
$$;

revoke all on function public.add_objective_workflow_step_atomic(
  uuid, text, text, integer, text, uuid, timestamptz
) from public, anon;
grant execute on function public.add_objective_workflow_step_atomic(
  uuid, text, text, integer, text, uuid, timestamptz
) to authenticated;
