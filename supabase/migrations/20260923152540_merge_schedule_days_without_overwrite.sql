-- Apply per-day schedule edits under a row lock, so simultaneous editors do
-- not replace changes made to other dates. The Edge Function authorizes callers.
create or replace function public.maestro_patch_project_schedule(
  p_record_id text,
  p_patch jsonb,
  p_actor_id text,
  p_actor_name text
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_current public.legacy_records%rowtype;
  v_schedule jsonb;
  v_date text;
  v_posts jsonb;
  v_before jsonb := '{}'::jsonb;
  v_after jsonb := '{}'::jsonb;
  v_changed_days text[] := array[]::text[];
  v_audit_id text := pg_catalog.replace(pg_catalog.gen_random_uuid()::text, '-', '');
  v_now timestamptz := pg_catalog.clock_timestamp();
begin
  if coalesce(p_record_id, '') = '' or coalesce(pg_catalog.jsonb_typeof(p_patch), '') <> 'object' then
    raise exception 'Cronograma inválido';
  end if;

  select * into v_current
  from public.legacy_records
  where entity = 'Project' and record_id = p_record_id
  for update;

  if not found then
    raise exception 'Projeto não encontrado';
  end if;

  v_schedule := coalesce(v_current.payload -> 'schedule_data', '{}'::jsonb);
  for v_date, v_posts in
    select key, value from pg_catalog.jsonb_each(p_patch)
  loop
    if v_date !~ '^\d{4}-\d{2}-\d{2}$'
       or (v_posts <> 'null'::jsonb and pg_catalog.jsonb_typeof(v_posts) <> 'array') then
      raise exception 'Dia ou conteúdo do cronograma inválido';
    end if;

    v_before := v_before || pg_catalog.jsonb_build_object(v_date, v_schedule -> v_date);
    v_after := v_after || pg_catalog.jsonb_build_object(v_date, v_posts);
    v_changed_days := pg_catalog.array_append(v_changed_days, v_date);

    if v_posts = 'null'::jsonb then
      v_schedule := v_schedule - v_date;
    else
      v_schedule := pg_catalog.jsonb_set(v_schedule, array[v_date], v_posts, true);
    end if;
  end loop;

  if pg_catalog.cardinality(v_changed_days) = 0 then
    return v_current.payload;
  end if;

  v_after := v_current.payload || pg_catalog.jsonb_build_object('schedule_data', v_schedule, 'id', p_record_id);
  update public.legacy_records
  set payload = v_after, source_updated_at = v_now
  where entity = 'Project' and record_id = p_record_id;

  insert into public.legacy_records (entity, record_id, payload, source_created_at, source_updated_at)
  values (
    'SystemAuditLog',
    v_audit_id,
    pg_catalog.jsonb_build_object(
      'id', v_audit_id,
      'action', 'update',
      'entity', 'Project',
      'record_id', p_record_id,
      'actor_id', p_actor_id,
      'actor_name', coalesce(nullif(p_actor_name, ''), 'Sistema'),
      'field', 'schedule_data',
      'changed_days', pg_catalog.to_jsonb(v_changed_days),
      'before', pg_catalog.jsonb_build_object('schedule_data', v_before),
      'after', pg_catalog.jsonb_build_object('schedule_data', v_after -> 'schedule_data'),
      'occurred_at', v_now
    ),
    v_now,
    v_now
  );

  return v_after;
end;
$$;

revoke execute on function public.maestro_patch_project_schedule(text, jsonb, text, text)
  from public, anon, authenticated;
grant execute on function public.maestro_patch_project_schedule(text, jsonb, text, text)
  to service_role;
