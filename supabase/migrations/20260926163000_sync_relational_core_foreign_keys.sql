-- Mantém as foreign keys internas preenchidas durante a escrita compatível.

create or replace function public.maestro_sync_relational_work_core()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_organization_id uuid;
  v_second_organization uuid;
  v_client_id uuid;
  v_project_id uuid;
begin
  if new.entity not in ('Client', 'Project', 'Job') then
    return new;
  end if;

  select id into v_organization_id
  from public.organizations
  where status = 'active'
  order by created_at asc
  limit 1;

  select id into v_second_organization
  from public.organizations
  where status = 'active' and id <> v_organization_id
  limit 1;

  if v_organization_id is null or v_second_organization is not null then
    return new;
  end if;

  insert into public.organization_legacy_records (
    organization_id, legacy_entity, legacy_record_id, scope_status, source
  ) values (
    v_organization_id, new.entity, new.record_id, 'confirmed', 'single-organization-trigger'
  ) on conflict (organization_id, legacy_entity, legacy_record_id) do nothing;

  if new.entity = 'Client' then
    insert into public.maestro_clients (
      organization_id, legacy_record_id, name, company_name, status, email, phone, source_payload, updated_at
    ) values (
      v_organization_id, new.record_id,
      coalesce(nullif(new.payload ->> 'name', ''), nullif(new.payload ->> 'company_name', ''), 'Cliente sem nome'),
      new.payload ->> 'company_name', new.payload ->> 'status', new.payload ->> 'email', new.payload ->> 'phone',
      new.payload, coalesce(new.source_updated_at, now())
    )
    on conflict (organization_id, legacy_record_id) do update set
      name = excluded.name, company_name = excluded.company_name, status = excluded.status,
      email = excluded.email, phone = excluded.phone, source_payload = excluded.source_payload,
      updated_at = excluded.updated_at;
  elsif new.entity = 'Project' then
    select c.id into v_client_id from public.maestro_clients c
    where c.organization_id = v_organization_id and c.legacy_record_id = new.payload ->> 'client_id';
    insert into public.maestro_projects (
      organization_id, legacy_record_id, client_legacy_record_id, client_id, name, status, reference_month, source_payload, updated_at
    ) values (
      v_organization_id, new.record_id, new.payload ->> 'client_id', v_client_id,
      coalesce(nullif(new.payload ->> 'name', ''), 'Projeto sem nome'), new.payload ->> 'status',
      new.payload ->> 'reference_month', new.payload, coalesce(new.source_updated_at, now())
    )
    on conflict (organization_id, legacy_record_id) do update set
      client_legacy_record_id = excluded.client_legacy_record_id, client_id = excluded.client_id,
      name = excluded.name, status = excluded.status, reference_month = excluded.reference_month,
      source_payload = excluded.source_payload, updated_at = excluded.updated_at;
  elsif new.entity = 'Job' then
    select p.id into v_project_id from public.maestro_projects p
    where p.organization_id = v_organization_id and p.legacy_record_id = new.payload ->> 'project_id';
    select c.id into v_client_id from public.maestro_clients c
    where c.organization_id = v_organization_id and c.legacy_record_id = new.payload ->> 'client_id';
    insert into public.maestro_jobs (
      organization_id, legacy_record_id, project_legacy_record_id, project_id, client_legacy_record_id, client_id,
      title, status, content_type, post_date, briefing, caption, source_payload, updated_at
    ) values (
      v_organization_id, new.record_id, new.payload ->> 'project_id', v_project_id, new.payload ->> 'client_id', v_client_id,
      coalesce(nullif(new.payload ->> 'title', ''), 'Job sem título'), new.payload ->> 'status', new.payload ->> 'content_type',
      case when new.payload ->> 'post_date' ~ '^\\d{4}-\\d{2}-\\d{2}' then (new.payload ->> 'post_date')::date else null end,
      new.payload ->> 'briefing', new.payload ->> 'caption', new.payload, coalesce(new.source_updated_at, now())
    )
    on conflict (organization_id, legacy_record_id) do update set
      project_legacy_record_id = excluded.project_legacy_record_id, project_id = excluded.project_id,
      client_legacy_record_id = excluded.client_legacy_record_id, client_id = excluded.client_id,
      title = excluded.title, status = excluded.status, content_type = excluded.content_type,
      post_date = excluded.post_date, briefing = excluded.briefing, caption = excluded.caption,
      source_payload = excluded.source_payload, updated_at = excluded.updated_at;
  end if;
  return new;
end;
$$;

revoke execute on function public.maestro_sync_relational_work_core() from public, anon, authenticated;
