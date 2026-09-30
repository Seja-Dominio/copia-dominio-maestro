-- Persist critical job/project mutations and their audit records atomically.
-- The Edge Function performs authorization before calling this RPC.
create or replace function public.maestro_apply_legacy_mutation(
  p_action text,
  p_entity text,
  p_record_id text,
  p_payload jsonb,
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
  v_next_payload jsonb;
  v_effective_payload jsonb;
  v_audit_id text;
  v_history_id text;
  v_now timestamptz := pg_catalog.clock_timestamp();
  v_key text;
  v_old_value jsonb;
  v_new_value jsonb;
  v_audit_old jsonb;
  v_audit_new jsonb;
  v_before jsonb := '{}'::jsonb;
  v_after jsonb := '{}'::jsonb;
  v_changed_fields text[] := array[]::text[];
  v_history_type text;
  v_history_text text;
  v_history_job_id text;
begin
  if p_entity not in ('Job', 'Project', 'Subtask', 'AgendaEvent') then
    raise exception 'Entidade não habilitada para mutação auditada';
  end if;
  if p_action not in ('create', 'update', 'delete') then
    raise exception 'Ação não habilitada para mutação auditada';
  end if;
  if coalesce(p_record_id, '') = '' then
    raise exception 'ID inválido';
  end if;

  v_audit_id := pg_catalog.replace(pg_catalog.gen_random_uuid()::text, '-', '');

  if p_action = 'create' then
    if exists (
      select 1 from public.legacy_records
      where entity = p_entity and record_id = p_record_id
    ) then
      raise exception 'Registro já existe';
    end if;
    v_next_payload := coalesce(p_payload, '{}'::jsonb) || pg_catalog.jsonb_build_object('id', p_record_id);
    insert into public.legacy_records (entity, record_id, payload, source_created_at, source_updated_at)
    values (p_entity, p_record_id, v_next_payload, v_now, v_now);

    v_audit_new := v_next_payload;
    if pg_catalog.jsonb_typeof(v_next_payload -> 'attachments') = 'array' then
      select pg_catalog.jsonb_set(
        v_next_payload,
        '{attachments}',
        coalesce(pg_catalog.jsonb_agg(value - 'url'), '[]'::jsonb),
        true
      ) into v_audit_new
      from pg_catalog.jsonb_array_elements(v_next_payload -> 'attachments') as elements(value);
    end if;

    insert into public.legacy_records (entity, record_id, payload, source_created_at, source_updated_at)
    values (
      'SystemAuditLog',
      v_audit_id,
      pg_catalog.jsonb_build_object(
        'id', v_audit_id,
        'action', 'create',
        'entity', p_entity,
        'record_id', p_record_id,
        'actor_id', p_actor_id,
        'actor_name', coalesce(nullif(p_actor_name, ''), 'Sistema'),
        'after', v_audit_new,
        'occurred_at', v_now
      ),
      v_now,
      v_now
    );

    v_history_job_id := case when p_entity = 'Job' then p_record_id else v_next_payload ->> 'job_id' end;
    if v_history_job_id is not null and p_entity in ('Job', 'Subtask') then
      v_history_id := pg_catalog.replace(pg_catalog.gen_random_uuid()::text, '-', '');
      insert into public.legacy_records (entity, record_id, payload, source_created_at, source_updated_at)
      values (
        'JobHistory',
        v_history_id,
        pg_catalog.jsonb_build_object(
          'id', v_history_id,
          'job_id', v_history_job_id,
          'type', case when p_entity = 'Job' then 'created' else 'subtask_add' end,
          'text', case when p_entity = 'Job'
            then 'Job criado'
            else pg_catalog.format('Tarefa adicionada: "%s"', coalesce(v_next_payload ->> 'title', 'Tarefa'))
          end,
          'user', coalesce(nullif(p_actor_name, ''), 'Sistema'),
          'collaborator_id', nullif(p_actor_id, ''),
          'time', v_now
        ),
        v_now,
        v_now
      );
    end if;
    return v_next_payload;
  end if;

  select * into v_current
  from public.legacy_records
  where entity = p_entity and record_id = p_record_id
  for update;

  if not found then
    if p_action = 'delete' then
      return pg_catalog.jsonb_build_object('id', p_record_id, 'deleted', false);
    end if;
    raise exception 'Registro não encontrado';
  end if;

  if p_action = 'update' then
    v_effective_payload := coalesce(p_payload, '{}'::jsonb);
    v_next_payload := coalesce(v_current.payload, '{}'::jsonb)
      || v_effective_payload
      || pg_catalog.jsonb_build_object('id', p_record_id);

    for v_key, v_new_value in
      select key, value from pg_catalog.jsonb_each(v_effective_payload)
    loop
      v_old_value := v_current.payload -> v_key;
      if v_old_value is distinct from v_new_value then
        v_changed_fields := pg_catalog.array_append(v_changed_fields, v_key);
        v_audit_old := v_old_value;
        v_audit_new := v_new_value;

        -- Signed URLs are bearer credentials; retain stable paths, not URLs.
        if v_key = 'attachments' then
          if pg_catalog.jsonb_typeof(v_old_value) = 'array' then
            select coalesce(pg_catalog.jsonb_agg(value - 'url'), '[]'::jsonb)
              into v_audit_old
            from pg_catalog.jsonb_array_elements(v_old_value) as elements(value);
          end if;
          if pg_catalog.jsonb_typeof(v_new_value) = 'array' then
            select coalesce(pg_catalog.jsonb_agg(value - 'url'), '[]'::jsonb)
              into v_audit_new
            from pg_catalog.jsonb_array_elements(v_new_value) as elements(value);
          end if;
        end if;

        v_before := v_before || pg_catalog.jsonb_build_object(v_key, v_audit_old);
        v_after := v_after || pg_catalog.jsonb_build_object(v_key, v_audit_new);

        v_history_job_id := case when p_entity = 'Job' then p_record_id else v_current.payload ->> 'job_id' end;
        if v_history_job_id is not null and p_entity in ('Job', 'Subtask') then
          v_history_id := pg_catalog.replace(pg_catalog.gen_random_uuid()::text, '-', '');
          v_history_type := case
            when p_entity = 'Subtask' then 'subtask'
            when v_key = 'attachments'
              and pg_catalog.jsonb_typeof(v_old_value) = 'array'
              and pg_catalog.jsonb_typeof(v_new_value) = 'array'
              and pg_catalog.jsonb_array_length(v_new_value) < pg_catalog.jsonb_array_length(v_old_value)
              then 'attachment_del'
            when v_key = 'attachments' then 'attachment_add'
            else 'change'
          end;
          v_history_text := case when p_entity = 'Subtask'
            then pg_catalog.format('Tarefa "%s" atualizada', coalesce(v_current.payload ->> 'title', p_record_id))
            else case v_key
            when 'status' then pg_catalog.format('Status: %s → %s', coalesce(v_old_value #>> '{}', '—'), coalesce(v_new_value #>> '{}', '—'))
            when 'post_date' then 'Data de postagem alterada'
            when 'delivery_date' then 'Data de entrega alterada'
            when 'attachments' then 'Lista de anexos atualizada'
            when 'title' then 'Título alterado'
            when 'briefing' then 'Briefing atualizado'
            when 'caption' then 'Legenda atualizada'
            else pg_catalog.format('Campo "%s" alterado', v_key)
            end
          end;

          insert into public.legacy_records (entity, record_id, payload, source_created_at, source_updated_at)
          values (
            'JobHistory',
            v_history_id,
            pg_catalog.jsonb_strip_nulls(pg_catalog.jsonb_build_object(
              'id', v_history_id,
              'job_id', v_history_job_id,
              'type', v_history_type,
              'text', v_history_text,
              'user', coalesce(nullif(p_actor_name, ''), 'Sistema'),
              'collaborator_id', nullif(p_actor_id, ''),
              'field', v_key,
              'old_value', case when v_key = 'attachments' then null else pg_catalog.left(coalesce(v_old_value #>> '{}', ''), 240) end,
              'new_value', case when v_key = 'attachments' then null else pg_catalog.left(coalesce(v_new_value #>> '{}', ''), 240) end,
              'time', v_now
            )),
            v_now,
            v_now
          );
        end if;
      end if;
    end loop;

    insert into public.legacy_records (entity, record_id, payload, source_created_at, source_updated_at)
    values (p_entity, p_record_id, v_next_payload, v_current.source_created_at, v_now)
    on conflict (entity, record_id) do update
      set payload = excluded.payload,
          source_updated_at = excluded.source_updated_at;

    if pg_catalog.cardinality(v_changed_fields) > 0 then
      insert into public.legacy_records (entity, record_id, payload, source_created_at, source_updated_at)
      values (
        'SystemAuditLog',
        v_audit_id,
        pg_catalog.jsonb_build_object(
          'id', v_audit_id,
          'action', 'update',
          'entity', p_entity,
          'record_id', p_record_id,
          'actor_id', p_actor_id,
          'actor_name', coalesce(nullif(p_actor_name, ''), 'Sistema'),
          'changed_fields', pg_catalog.to_jsonb(v_changed_fields),
          'before', v_before,
          'after', v_after,
          'occurred_at', v_now
        ),
        v_now,
        v_now
      );
    end if;

    return v_next_payload;
  end if;

  -- Preserve a recoverable snapshot and audit record in the same transaction
  -- as the delete, regardless of which UI route initiated it.
  v_audit_old := v_current.payload;
  if pg_catalog.jsonb_typeof(v_current.payload -> 'attachments') = 'array' then
    select pg_catalog.jsonb_set(
      v_current.payload,
      '{attachments}',
      coalesce(pg_catalog.jsonb_agg(value - 'url'), '[]'::jsonb),
      true
    ) into v_audit_old
    from pg_catalog.jsonb_array_elements(v_current.payload -> 'attachments') as elements(value);
  end if;

  if p_entity = 'Subtask' and nullif(v_current.payload ->> 'job_id', '') is not null then
    v_history_id := pg_catalog.replace(pg_catalog.gen_random_uuid()::text, '-', '');
    insert into public.legacy_records (entity, record_id, payload, source_created_at, source_updated_at)
    values (
      'JobHistory',
      v_history_id,
      pg_catalog.jsonb_build_object(
        'id', v_history_id,
        'job_id', v_current.payload ->> 'job_id',
        'type', 'subtask_del',
        'text', pg_catalog.format('Tarefa removida: "%s"', coalesce(v_current.payload ->> 'title', p_record_id)),
        'user', coalesce(nullif(p_actor_name, ''), 'Sistema'),
        'collaborator_id', nullif(p_actor_id, ''),
        'time', v_now
      ),
      v_now,
      v_now
    );
  end if;

  insert into public.legacy_records (entity, record_id, payload, source_created_at, source_updated_at)
  values (
    'DeleteLog',
    v_audit_id,
    pg_catalog.jsonb_build_object(
      'id', v_audit_id,
      'entity_type', pg_catalog.lower(p_entity),
      'entity_id', p_record_id,
      'entity_data', v_audit_old,
      'deleted_by', coalesce(nullif(p_actor_id, ''), 'system'),
      'deleted_by_name', coalesce(nullif(p_actor_name, ''), 'Sistema'),
      'deleted_at', v_now,
      'is_restored', false
    ),
    v_now,
    v_now
  );

  insert into public.legacy_records (entity, record_id, payload, source_created_at, source_updated_at)
  values (
    'SystemAuditLog',
    v_audit_id,
    pg_catalog.jsonb_build_object(
      'id', v_audit_id,
      'action', 'delete',
      'entity', p_entity,
      'record_id', p_record_id,
      'actor_id', p_actor_id,
      'actor_name', coalesce(nullif(p_actor_name, ''), 'Sistema'),
      'before', v_audit_old,
      'after', null,
      'occurred_at', v_now
    ),
    v_now,
    v_now
  );

  delete from public.legacy_records
  where entity = p_entity and record_id = p_record_id;

  return pg_catalog.jsonb_build_object('id', p_record_id, 'deleted', true);
end;
$$;

revoke execute on function public.maestro_apply_legacy_mutation(text, text, text, jsonb, text, text)
  from public, anon, authenticated;
grant execute on function public.maestro_apply_legacy_mutation(text, text, text, jsonb, text, text)
  to service_role;
