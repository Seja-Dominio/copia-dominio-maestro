-- Mantém o núcleo relacional atualizado durante a janela de compatibilidade.
-- A sincronização automática só ocorre quando há uma única organização ativa.
-- Em multiempresa real, o escritor deverá fornecer o organization_id explicitamente.

create or replace function public.maestro_sync_relational_work_core()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_organization_id uuid;
  v_second_organization uuid;
  v_legacy_id text;
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
  where status = 'active'
    and id <> v_organization_id
  limit 1;

  -- Não adivinhar tenant quando o Maestro já tiver mais de uma organização.
  if v_organization_id is null or v_second_organization is not null then
    return new;
  end if;

  v_legacy_id := new.record_id;

  insert into public.organization_legacy_records (
    organization_id, legacy_entity, legacy_record_id, scope_status, source
  ) values (
    v_organization_id, new.entity, v_legacy_id, 'confirmed', 'single-organization-trigger'
  ) on conflict (organization_id, legacy_entity, legacy_record_id) do nothing;

  if new.entity = 'Client' then
    insert into public.maestro_clients (
      organization_id, legacy_record_id, name, company_name, status, email, phone, source_payload, updated_at
    ) values (
      v_organization_id,
      v_legacy_id,
      coalesce(nullif(new.payload ->> 'name', ''), nullif(new.payload ->> 'company_name', ''), 'Cliente sem nome'),
      new.payload ->> 'company_name',
      new.payload ->> 'status',
      new.payload ->> 'email',
      new.payload ->> 'phone',
      new.payload,
      coalesce(new.source_updated_at, now())
    )
    on conflict (organization_id, legacy_record_id) do update set
      name = excluded.name,
      company_name = excluded.company_name,
      status = excluded.status,
      email = excluded.email,
      phone = excluded.phone,
      source_payload = excluded.source_payload,
      updated_at = excluded.updated_at;
  elsif new.entity = 'Project' then
    insert into public.maestro_projects (
      organization_id, legacy_record_id, client_legacy_record_id, name, status, reference_month, source_payload, updated_at
    ) values (
      v_organization_id,
      v_legacy_id,
      new.payload ->> 'client_id',
      coalesce(nullif(new.payload ->> 'name', ''), 'Projeto sem nome'),
      new.payload ->> 'status',
      new.payload ->> 'reference_month',
      new.payload,
      coalesce(new.source_updated_at, now())
    )
    on conflict (organization_id, legacy_record_id) do update set
      client_legacy_record_id = excluded.client_legacy_record_id,
      name = excluded.name,
      status = excluded.status,
      reference_month = excluded.reference_month,
      source_payload = excluded.source_payload,
      updated_at = excluded.updated_at;
  elsif new.entity = 'Job' then
    insert into public.maestro_jobs (
      organization_id, legacy_record_id, project_legacy_record_id, client_legacy_record_id,
      title, status, content_type, post_date, briefing, caption, source_payload, updated_at
    ) values (
      v_organization_id,
      v_legacy_id,
      new.payload ->> 'project_id',
      new.payload ->> 'client_id',
      coalesce(nullif(new.payload ->> 'title', ''), 'Job sem título'),
      new.payload ->> 'status',
      new.payload ->> 'content_type',
      case when new.payload ->> 'post_date' ~ '^\\d{4}-\\d{2}-\\d{2}'
        then (new.payload ->> 'post_date')::date else null end,
      new.payload ->> 'briefing',
      new.payload ->> 'caption',
      new.payload,
      coalesce(new.source_updated_at, now())
    )
    on conflict (organization_id, legacy_record_id) do update set
      project_legacy_record_id = excluded.project_legacy_record_id,
      client_legacy_record_id = excluded.client_legacy_record_id,
      title = excluded.title,
      status = excluded.status,
      content_type = excluded.content_type,
      post_date = excluded.post_date,
      briefing = excluded.briefing,
      caption = excluded.caption,
      source_payload = excluded.source_payload,
      updated_at = excluded.updated_at;
  end if;

  return new;
end;
$$;

drop trigger if exists legacy_records_relational_work_core_sync on public.legacy_records;
create trigger legacy_records_relational_work_core_sync
after insert or update of entity, record_id, payload, source_updated_at
on public.legacy_records
for each row execute function public.maestro_sync_relational_work_core();

revoke execute on function public.maestro_sync_relational_work_core() from public, anon, authenticated;

comment on function public.maestro_sync_relational_work_core() is
  'Dual-write temporário para o núcleo relacional; não escolhe tenant automaticamente quando há múltiplas organizações ativas.';
