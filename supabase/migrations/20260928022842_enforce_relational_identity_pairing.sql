-- Preserve the legacy identifiers during expand/contract while ensuring they
-- always describe the same tenant-scoped parent as the typed UUID columns.

create or replace function public.maestro_sync_relational_work_core()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_organization_id uuid := new.organization_id;
  v_active_count integer;
  v_client_id uuid;
  v_project_id uuid;
begin
  if new.entity not in ('Client', 'Project', 'Job') then return new; end if;
  if v_organization_id is null then
    select count(*)::integer into v_active_count from public.organizations where status = 'active';
    if v_active_count <> 1 then return new; end if;
    select id into v_organization_id from public.organizations where status = 'active' limit 1;
  end if;
  if not exists (select 1 from public.organizations where id=v_organization_id and status='active') then
    raise exception 'legacy record organization is not active';
  end if;
  insert into public.organization_legacy_records (
    organization_id, legacy_entity, legacy_record_id, scope_status, source
  ) values (
    v_organization_id, new.entity, new.record_id, 'confirmed', 'tenant-aware-relational-trigger'
  ) on conflict (organization_id, legacy_entity, legacy_record_id) do nothing;

  if new.entity = 'Client' then
    insert into public.maestro_clients (
      organization_id, legacy_record_id, name, company_name, status, email, phone, source_payload, updated_at
    ) values (
      v_organization_id, new.record_id,
      coalesce(nullif(new.payload ->> 'name', ''), nullif(new.payload ->> 'company_name', ''), 'Cliente sem nome'),
      new.payload ->> 'company_name', new.payload ->> 'status', new.payload ->> 'email', new.payload ->> 'phone',
      new.payload, coalesce(new.source_updated_at, pg_catalog.now())
    ) on conflict (organization_id, legacy_record_id) do update set
      name=excluded.name, company_name=excluded.company_name, status=excluded.status,
      email=excluded.email, phone=excluded.phone, source_payload=excluded.source_payload, updated_at=excluded.updated_at;
  elsif new.entity = 'Project' then
    select c.id into v_client_id from public.maestro_clients c
    where c.organization_id=v_organization_id and c.legacy_record_id=new.payload ->> 'client_id';
    insert into public.maestro_projects (
      organization_id, legacy_record_id, client_legacy_record_id, client_id,
      name, status, reference_month, source_payload, updated_at
    ) values (
      v_organization_id, new.record_id, new.payload ->> 'client_id', v_client_id,
      coalesce(nullif(new.payload ->> 'name', ''), 'Projeto sem nome'), new.payload ->> 'status',
      new.payload ->> 'reference_month', new.payload, coalesce(new.source_updated_at, pg_catalog.now())
    ) on conflict (organization_id, legacy_record_id) do update set
      client_legacy_record_id=excluded.client_legacy_record_id, client_id=excluded.client_id,
      name=excluded.name, status=excluded.status, reference_month=excluded.reference_month,
      source_payload=excluded.source_payload, updated_at=excluded.updated_at;
  else
    select p.id into v_project_id from public.maestro_projects p
    where p.organization_id=v_organization_id and p.legacy_record_id=new.payload ->> 'project_id';
    select c.id into v_client_id from public.maestro_clients c
    where c.organization_id=v_organization_id and c.legacy_record_id=new.payload ->> 'client_id';
    insert into public.maestro_jobs (
      organization_id, legacy_record_id, project_legacy_record_id, project_id,
      client_legacy_record_id, client_id, title, status, content_type, post_date,
      briefing, caption, source_payload, updated_at
    ) values (
      v_organization_id, new.record_id, new.payload ->> 'project_id', v_project_id,
      new.payload ->> 'client_id', v_client_id,
      coalesce(nullif(new.payload ->> 'title', ''), 'Job sem título'), new.payload ->> 'status',
      new.payload ->> 'content_type',
      case when new.payload ->> 'post_date' ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}' then (new.payload ->> 'post_date')::date else null end,
      new.payload ->> 'briefing', new.payload ->> 'caption', new.payload, coalesce(new.source_updated_at, pg_catalog.now())
    ) on conflict (organization_id, legacy_record_id) do update set
      project_legacy_record_id=excluded.project_legacy_record_id, project_id=excluded.project_id,
      client_legacy_record_id=excluded.client_legacy_record_id, client_id=excluded.client_id,
      title=excluded.title, status=excluded.status, content_type=excluded.content_type,
      post_date=excluded.post_date, briefing=excluded.briefing, caption=excluded.caption,
      source_payload=excluded.source_payload, updated_at=excluded.updated_at;
  end if;
  return new;
end;
$$;
revoke execute on function public.maestro_sync_relational_work_core() from public, anon, authenticated;

alter table public.maestro_clients
  add constraint maestro_clients_org_id_legacy_key
  unique (organization_id, id, legacy_record_id);
alter table public.maestro_projects
  add constraint maestro_projects_org_id_legacy_key
  unique (organization_id, id, legacy_record_id);

do $$
begin
  if exists (
    select 1 from public.maestro_projects p
    where nullif(p.client_legacy_record_id, '') is not null
      and not exists (
        select 1 from public.maestro_clients c
        where c.organization_id = p.organization_id
          and c.legacy_record_id = p.client_legacy_record_id
      )
  ) then
    raise exception 'Cannot pair project client references: unresolved same-tenant legacy client';
  end if;

  if exists (
    select 1 from public.maestro_jobs j
    where nullif(j.project_legacy_record_id, '') is not null
      and not exists (
        select 1 from public.maestro_projects p
        where p.organization_id = j.organization_id
          and p.legacy_record_id = j.project_legacy_record_id
      )
  ) then
    raise exception 'Cannot pair job project references: unresolved same-tenant legacy project';
  end if;

  if exists (
    select 1 from public.maestro_jobs j
    where nullif(j.client_legacy_record_id, '') is not null
      and not exists (
        select 1 from public.maestro_clients c
        where c.organization_id = j.organization_id
          and c.legacy_record_id = j.client_legacy_record_id
      )
  ) then
    raise exception 'Cannot pair job client references: unresolved same-tenant legacy client';
  end if;

  if exists (
    select 1 from public.maestro_projects p
    join public.maestro_clients c on c.id = p.client_id
    where p.client_id is not null
      and (p.organization_id <> c.organization_id or p.client_legacy_record_id is distinct from c.legacy_record_id)
  ) or exists (
    select 1 from public.maestro_jobs j
    join public.maestro_projects p on p.id = j.project_id
    where j.project_id is not null
      and (j.organization_id <> p.organization_id or j.project_legacy_record_id is distinct from p.legacy_record_id)
  ) or exists (
    select 1 from public.maestro_jobs j
    join public.maestro_clients c on c.id = j.client_id
    where j.client_id is not null
      and (j.organization_id <> c.organization_id or j.client_legacy_record_id is distinct from c.legacy_record_id)
  ) then
    raise exception 'Cannot pair typed and legacy relationship identifiers: existing mismatch';
  end if;
end;
$$;

-- Repair the two known null typed links without inferring across tenants.
update public.maestro_projects p
set client_id = c.id
from public.maestro_clients c
where p.client_id is null
  and nullif(p.client_legacy_record_id, '') is not null
  and c.organization_id = p.organization_id
  and c.legacy_record_id = p.client_legacy_record_id;

create index if not exists maestro_projects_org_client_identity_idx
  on public.maestro_projects (organization_id, client_id, client_legacy_record_id);
create index if not exists maestro_jobs_org_project_identity_idx
  on public.maestro_jobs (organization_id, project_id, project_legacy_record_id);
create index if not exists maestro_jobs_org_client_identity_idx
  on public.maestro_jobs (organization_id, client_id, client_legacy_record_id);

alter table public.maestro_projects
  add constraint maestro_projects_org_client_identity_fk
  foreign key (organization_id, client_id, client_legacy_record_id)
  references public.maestro_clients (organization_id, id, legacy_record_id)
  on delete set null (client_id) not valid;
alter table public.maestro_jobs
  add constraint maestro_jobs_org_project_identity_fk
  foreign key (organization_id, project_id, project_legacy_record_id)
  references public.maestro_projects (organization_id, id, legacy_record_id)
  on delete set null (project_id) not valid;
alter table public.maestro_jobs
  add constraint maestro_jobs_org_client_identity_fk
  foreign key (organization_id, client_id, client_legacy_record_id)
  references public.maestro_clients (organization_id, id, legacy_record_id)
  on delete set null (client_id) not valid;

alter table public.maestro_projects validate constraint maestro_projects_org_client_identity_fk;
alter table public.maestro_jobs validate constraint maestro_jobs_org_project_identity_fk;
alter table public.maestro_jobs validate constraint maestro_jobs_org_client_identity_fk;
