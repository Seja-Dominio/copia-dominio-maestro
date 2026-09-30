-- O dual-write do núcleo deve respeitar o tenant já materializado no registro.
-- O fallback de organização única permanece apenas para compatibilidade legada.
create or replace function public.maestro_sync_relational_work_core()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_organization_id uuid := new.organization_id;
  v_active_count integer;
  v_legacy_id text := new.record_id;
begin
  if new.entity not in ('Client', 'Project', 'Job') then
    return new;
  end if;

  if v_organization_id is null then
    select count(*)::integer into v_active_count from public.organizations where status = 'active';
    if v_active_count <> 1 then return new; end if;
    select id into v_organization_id from public.organizations where status = 'active' limit 1;
  end if;

  if not exists (select 1 from public.organizations where id = v_organization_id and status = 'active') then
    raise exception 'legacy record organization is not active';
  end if;

  insert into public.organization_legacy_records (organization_id, legacy_entity, legacy_record_id, scope_status, source)
  values (v_organization_id, new.entity, v_legacy_id, 'confirmed', 'tenant-aware-relational-trigger')
  on conflict (organization_id, legacy_entity, legacy_record_id) do nothing;

  if new.entity = 'Client' then
    insert into public.maestro_clients (organization_id, legacy_record_id, name, company_name, status, email, phone, source_payload, updated_at)
    values (v_organization_id, v_legacy_id, coalesce(nullif(new.payload ->> 'name', ''), nullif(new.payload ->> 'company_name', ''), 'Cliente sem nome'), new.payload ->> 'company_name', new.payload ->> 'status', new.payload ->> 'email', new.payload ->> 'phone', new.payload, coalesce(new.source_updated_at, now()))
    on conflict (organization_id, legacy_record_id) do update set name = excluded.name, company_name = excluded.company_name, status = excluded.status, email = excluded.email, phone = excluded.phone, source_payload = excluded.source_payload, updated_at = excluded.updated_at;
  elsif new.entity = 'Project' then
    insert into public.maestro_projects (organization_id, legacy_record_id, client_legacy_record_id, name, status, reference_month, source_payload, updated_at)
    values (v_organization_id, v_legacy_id, new.payload ->> 'client_id', coalesce(nullif(new.payload ->> 'name', ''), 'Projeto sem nome'), new.payload ->> 'status', new.payload ->> 'reference_month', new.payload, coalesce(new.source_updated_at, now()))
    on conflict (organization_id, legacy_record_id) do update set client_legacy_record_id = excluded.client_legacy_record_id, name = excluded.name, status = excluded.status, reference_month = excluded.reference_month, source_payload = excluded.source_payload, updated_at = excluded.updated_at;
  elsif new.entity = 'Job' then
    insert into public.maestro_jobs (organization_id, legacy_record_id, project_legacy_record_id, client_legacy_record_id, title, status, content_type, post_date, briefing, caption, source_payload, updated_at)
    values (v_organization_id, v_legacy_id, new.payload ->> 'project_id', new.payload ->> 'client_id', coalesce(nullif(new.payload ->> 'title', ''), 'Job sem título'), new.payload ->> 'status', new.payload ->> 'content_type', case when new.payload ->> 'post_date' ~ '^\\d{4}-\\d{2}-\\d{2}' then (new.payload ->> 'post_date')::date else null end, new.payload ->> 'briefing', new.payload ->> 'caption', new.payload, coalesce(new.source_updated_at, now()))
    on conflict (organization_id, legacy_record_id) do update set project_legacy_record_id = excluded.project_legacy_record_id, client_legacy_record_id = excluded.client_legacy_record_id, title = excluded.title, status = excluded.status, content_type = excluded.content_type, post_date = excluded.post_date, briefing = excluded.briefing, caption = excluded.caption, source_payload = excluded.source_payload, updated_at = excluded.updated_at;
  end if;
  return new;
end;
$$;

revoke execute on function public.maestro_sync_relational_work_core() from public, anon, authenticated;
