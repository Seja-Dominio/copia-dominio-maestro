-- Keep reconciliation resolution SECURITY INVOKER and grant only the columns
-- the service-role RPC reads or changes. This avoids table-wide queue access.
grant select (id, organization_id, legacy_record_id, resolution_status)
  on public.job_task_reconciliation to service_role;
grant update (resolution_status, resolved_job_id, resolution_note, resolved_at, resolved_by)
  on public.job_task_reconciliation to service_role;

create or replace function public.resolve_job_task_reconciliation(
  p_organization_id uuid,
  p_reconciliation_id uuid,
  p_target_job_id uuid,
  p_resolved_by text,
  p_resolution_note text default null
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  rec record;
  target_job public.maestro_jobs%rowtype;
  affected_rows integer;
begin
  -- Serialize concurrent attempts for this queue item without requiring the
  -- table-level UPDATE privilege that SELECT ... FOR UPDATE would need.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_reconciliation_id::text, 20260930180000)
  );

  select id, organization_id, legacy_record_id, resolution_status
    into rec
  from public.job_task_reconciliation
  where id = p_reconciliation_id
    and organization_id = p_organization_id;

  if not found then
    raise exception 'reconciliation item not found for organization';
  end if;

  if rec.resolution_status <> 'pending' then
    raise exception 'reconciliation item is already resolved';
  end if;

  select * into target_job
  from public.maestro_jobs
  where id = p_target_job_id
    and organization_id = p_organization_id;

  if not found then
    raise exception 'target job does not belong to organization';
  end if;

  update public.maestro_job_tasks
  set job_id = target_job.id,
      legacy_job_record_id = target_job.legacy_record_id,
      resolution_status = 'linked',
      updated_at = now()
  where organization_id = p_organization_id
    and legacy_record_id = rec.legacy_record_id
    and resolution_status = 'pending'
    and job_id is null;

  get diagnostics affected_rows = row_count;
  if affected_rows <> 1 then
    raise exception 'expected exactly one pending relational task, updated %', affected_rows;
  end if;

  update public.job_task_reconciliation
  set resolution_status = 'linked',
      resolved_job_id = target_job.legacy_record_id,
      resolution_note = p_resolution_note,
      resolved_at = now(),
      resolved_by = p_resolved_by
  where id = rec.id
    and organization_id = p_organization_id
    and resolution_status = 'pending';

  get diagnostics affected_rows = row_count;
  if affected_rows <> 1 then
    raise exception 'expected exactly one pending reconciliation row, updated %', affected_rows;
  end if;

  return jsonb_build_object(
    'status', 'linked',
    'organization_id', p_organization_id,
    'reconciliation_id', rec.id,
    'task_legacy_record_id', rec.legacy_record_id,
    'target_job_id', target_job.id,
    'target_job_legacy_record_id', target_job.legacy_record_id
  );
end;
$$;

revoke all on function public.resolve_job_task_reconciliation(uuid, uuid, uuid, text, text)
  from public, anon, authenticated;
grant execute on function public.resolve_job_task_reconciliation(uuid, uuid, uuid, text, text)
  to service_role;
