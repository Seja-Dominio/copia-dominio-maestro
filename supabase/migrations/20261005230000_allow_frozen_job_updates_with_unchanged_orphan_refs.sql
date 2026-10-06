-- Preserve legacy reference snapshots for already-migrated Jobs while allowing
-- unrelated edits. New or changed references must still resolve within tenant.
create or replace function public.maestro_write_frozen_core_with_history(
  p_organization_id uuid,
  p_entity text,
  p_action text,
  p_record_id text,
  p_payload jsonb,
  p_actor_id text,
  p_actor_name text
)
returns jsonb
language plpgsql
set search_path to ''
as $function$
declare
  v_before jsonb;
  v_payload jsonb := coalesce(p_payload, '{}'::jsonb) || pg_catalog.jsonb_build_object('id', p_record_id);
  v_project_id uuid;
  v_client_id uuid;
  v_job_id uuid;
  v_now timestamptz := pg_catalog.clock_timestamp();
  v_key text;
  v_old text;
  v_new text;
  v_event_type text;
  v_message text;
begin
  if p_organization_id is null or nullif(pg_catalog.btrim(p_record_id), '') is null
    or p_entity not in ('Job', 'Subtask') or p_action not in ('create', 'update', 'delete') then
    raise exception 'invalid frozen core mutation';
  end if;
  if not exists (select 1 from public.organizations o where o.id = p_organization_id and o.status = 'active') then
    raise exception 'organization is not active';
  end if;

  if p_entity = 'Job' then
    select j.source_payload into v_before from public.maestro_jobs j
    where j.organization_id = p_organization_id and j.legacy_record_id = p_record_id for update;
  else
    select t.source_payload into v_before from public.maestro_job_tasks t
    where t.organization_id = p_organization_id and t.legacy_record_id = p_record_id for update;
  end if;
  if p_action = 'create' and v_before is not null then raise exception 'record already exists'; end if;
  if p_action in ('update', 'delete') and v_before is null then raise exception 'record not found in organization'; end if;

  if p_entity = 'Job' then
    if p_action = 'delete' then
      update public.maestro_job_history h set job_id = null
      where h.organization_id = p_organization_id and h.job_legacy_id = p_record_id;
      delete from public.maestro_jobs j where j.organization_id = p_organization_id and j.legacy_record_id = p_record_id;
      v_payload := v_before || pg_catalog.jsonb_build_object('id', p_record_id);
    else
      select p.id into v_project_id from public.maestro_projects p
      where p.organization_id = p_organization_id and p.legacy_record_id = nullif(v_payload ->> 'project_id', '');
      if nullif(v_payload ->> 'project_id', '') is not null and v_project_id is null
        and not (p_action = 'update' and nullif(v_before ->> 'project_id', '') is not distinct from nullif(v_payload ->> 'project_id', '')) then
        raise exception 'job project must belong to the same organization';
      end if;
      select c.id into v_client_id from public.maestro_clients c
      where c.organization_id = p_organization_id and c.legacy_record_id = nullif(v_payload ->> 'client_id', '');
      if nullif(v_payload ->> 'client_id', '') is not null and v_client_id is null
        and not (p_action = 'update' and nullif(v_before ->> 'client_id', '') is not distinct from nullif(v_payload ->> 'client_id', '')) then
        raise exception 'job client must belong to the same organization';
      end if;
      -- An unchanged unresolved legacy id remains in source_payload/snapshot;
      -- the typed FK stays NULL. A changed/new unresolved id is rejected above.
      insert into public.maestro_jobs (
        organization_id, legacy_record_id, project_legacy_record_id, project_id,
        client_legacy_record_id, client_id, title, status, content_type, post_date,
        briefing, caption, source_payload, updated_at
      ) values (
        p_organization_id, p_record_id, nullif(v_payload ->> 'project_id', ''), v_project_id,
        nullif(v_payload ->> 'client_id', ''), v_client_id,
        coalesce(nullif(v_payload ->> 'title', ''), 'Job sem título'), v_payload ->> 'status',
        v_payload ->> 'content_type',
        case when v_payload ->> 'post_date' ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}' then (v_payload ->> 'post_date')::date else null end,
        v_payload ->> 'briefing', v_payload ->> 'caption', v_payload, v_now
      ) on conflict (organization_id, legacy_record_id) do update set
        project_legacy_record_id = excluded.project_legacy_record_id, project_id = excluded.project_id,
        client_legacy_record_id = excluded.client_legacy_record_id, client_id = excluded.client_id,
        title = excluded.title, status = excluded.status, content_type = excluded.content_type,
        post_date = excluded.post_date, briefing = excluded.briefing, caption = excluded.caption,
        source_payload = excluded.source_payload, updated_at = excluded.updated_at;
    end if;
    v_job_id := case when p_action = 'delete' then null else
      (select j.id from public.maestro_jobs j where j.organization_id = p_organization_id and j.legacy_record_id = p_record_id) end;
  else
    if p_action = 'delete' then
      select t.job_id into v_job_id from public.maestro_job_tasks t
      where t.organization_id = p_organization_id and t.legacy_record_id = p_record_id;
      delete from public.maestro_job_tasks t where t.organization_id = p_organization_id and t.legacy_record_id = p_record_id;
      v_payload := v_before || pg_catalog.jsonb_build_object('id', p_record_id);
    else
      select j.id into v_job_id from public.maestro_jobs j
      where j.organization_id = p_organization_id and j.legacy_record_id = nullif(v_payload ->> 'job_id', '');
      if nullif(v_payload ->> 'job_id', '') is not null and v_job_id is null then
        raise exception 'subtask job must belong to the same organization';
      end if;
      insert into public.maestro_job_tasks (
        organization_id, legacy_record_id, legacy_job_record_id, job_id, title, status,
        is_completed, completed_at, deadline, task_order, responsible_id, responsible_name,
        resolution_status, source_payload, updated_at
      ) values (
        p_organization_id, p_record_id, nullif(v_payload ->> 'job_id', ''), v_job_id,
        coalesce(nullif(v_payload ->> 'title', ''), 'Tarefa sem título'), v_payload ->> 'status',
        case when v_payload ? 'is_completed' then (v_payload ->> 'is_completed')::boolean else null end,
        case when v_payload ->> 'completed_at' ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}' then (v_payload ->> 'completed_at')::timestamptz else null end,
        case when v_payload ->> 'deadline' ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}' then (v_payload ->> 'deadline')::date else null end,
        case when v_payload ->> 'order' ~ '^[0-9]+$' then (v_payload ->> 'order')::integer else null end,
        v_payload ->> 'responsible_id', v_payload ->> 'responsible_name',
        case when v_job_id is null then 'pending' else 'linked' end, v_payload, v_now
      ) on conflict (organization_id, legacy_record_id) do update set
        legacy_job_record_id = excluded.legacy_job_record_id, job_id = excluded.job_id,
        title = excluded.title, status = excluded.status, is_completed = excluded.is_completed,
        completed_at = excluded.completed_at, deadline = excluded.deadline, task_order = excluded.task_order,
        responsible_id = excluded.responsible_id, responsible_name = excluded.responsible_name,
        resolution_status = excluded.resolution_status, source_payload = excluded.source_payload,
        updated_at = excluded.updated_at;
    end if;
  end if;

  if p_action = 'create' then v_key := 'created';
  elsif p_action = 'delete' then v_key := 'deleted';
  else
    for v_key in select key from pg_catalog.jsonb_object_keys(coalesce(v_before, '{}'::jsonb) || v_payload) as keys(key)
    loop
      if (v_before -> v_key) is not distinct from (v_payload -> v_key) then continue; end if;
      v_old := case when v_key = 'attachments' then null else pg_catalog.left(v_before ->> v_key, 240) end;
      v_new := case when v_key = 'attachments' then null else pg_catalog.left(v_payload ->> v_key, 240) end;
      v_event_type := case when p_entity = 'Subtask' then 'subtask' else 'change' end;
      v_message := case when v_key = 'attachments' then 'Lista de anexos atualizada'
        when v_key = 'briefing' then 'Briefing atualizado'
        when v_key = 'caption' then 'Legenda atualizada'
        else pg_catalog.format('Campo "%s" alterado', v_key) end;
      insert into public.maestro_job_history (
        organization_id, legacy_record_id, job_legacy_id, job_id, collaborator_legacy_id,
        event_type, field_name, old_value, new_value, message, source_payload, occurred_at
      ) values (
        p_organization_id, pg_catalog.gen_random_uuid()::text,
        case when p_entity = 'Job' then p_record_id else coalesce(v_payload ->> 'job_id', v_before ->> 'job_id') end,
        v_job_id, nullif(p_actor_id, ''), v_event_type, v_key, v_old, v_new, v_message,
        pg_catalog.jsonb_build_object('entity', p_entity, 'record_id', p_record_id, 'action', p_action,
          'actor_id', p_actor_id, 'actor_name', pg_catalog.left(coalesce(p_actor_name, ''), 120), 'field', v_key), v_now
      );
    end loop;
    return v_payload;
  end if;

  v_event_type := case when p_action = 'create' then case when p_entity = 'Job' then 'created' else 'subtask_add' end else 'deleted' end;
  v_message := case when p_action = 'create'
    then case when p_entity = 'Job' then 'Job criado' else pg_catalog.format('Tarefa adicionada: "%s"', coalesce(v_payload ->> 'title', 'Tarefa')) end
    else case when p_entity = 'Job' then 'Job excluído' else pg_catalog.format('Tarefa excluída: "%s"', coalesce(v_before ->> 'title', p_record_id)) end end;
  insert into public.maestro_job_history (
    organization_id, legacy_record_id, job_legacy_id, job_id, collaborator_legacy_id,
    event_type, field_name, old_value, new_value, message, source_payload, occurred_at
  ) values (
    p_organization_id, pg_catalog.gen_random_uuid()::text,
    case when p_entity = 'Job' then p_record_id else coalesce(v_payload ->> 'job_id', v_before ->> 'job_id') end,
    v_job_id, nullif(p_actor_id, ''), v_event_type, null,
    case when p_action = 'create' then null else pg_catalog.left(v_before ->> 'title', 240) end,
    case when p_action = 'delete' then null else pg_catalog.left(v_payload ->> 'title', 240) end,
    v_message, pg_catalog.jsonb_build_object('entity', p_entity, 'record_id', p_record_id,
      'action', p_action, 'actor_id', p_actor_id, 'actor_name', pg_catalog.left(coalesce(p_actor_name, ''), 120)), v_now
  );
  return case when p_action = 'delete' then pg_catalog.jsonb_build_object('id', p_record_id, 'deleted', true) else v_payload end;
end;
$function$;

revoke all on function public.maestro_write_frozen_core_with_history(uuid,text,text,text,jsonb,text,text) from public, anon, authenticated;
grant execute on function public.maestro_write_frozen_core_with_history(uuid,text,text,text,jsonb,text,text) to service_role;
