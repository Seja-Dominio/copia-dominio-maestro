-- External connection registry used to route provider events to a tenant.
create table if not exists public.organization_integrations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  provider text not null,
  external_key text not null,
  status text not null default 'active',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (provider, external_key),
  check (status in ('active', 'paused', 'revoked'))
);

create index if not exists organization_integrations_org_status_idx
  on public.organization_integrations (organization_id, provider, status);

alter table public.organization_integrations enable row level security;

insert into public.organization_integrations (organization_id, provider, external_key, metadata)
select o.id, 'whatsapp', 'maestro_whatsapp', jsonb_build_object('source', 'legacy_webhook_receipts')
from public.organizations o
where o.slug = 'dominio-performance'
on conflict (provider, external_key) do nothing;

create or replace function public.maestro_scope_legacy_record()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  configured_org uuid;
  linked_org uuid;
  integration_org uuid;
  active_org uuid;
  reference_id text;
  reference_entity text;
  provider_key text;
begin
  if new.organization_id is not null then return new; end if;

  begin
    configured_org := nullif(current_setting('maestro.organization_id', true), '')::uuid;
  exception when others then configured_org := null;
  end;
  if configured_org is not null then
    new.organization_id := configured_org;
    return new;
  end if;

  if new.entity = 'DominusWebhookReceipt' then
    provider_key := nullif(new.payload->>'instance', '');
    if provider_key is not null then
      select oi.organization_id into integration_org
      from public.organization_integrations oi
      where oi.provider = 'whatsapp'
        and oi.external_key = provider_key
        and oi.status = 'active'
      limit 1;
      if integration_org is not null then
        new.organization_id := integration_org;
        return new;
      end if;
    end if;
  end if;

  for reference_entity, reference_id in
    select * from (values
      ('Client', nullif(new.payload->>'client_id', '')),
      ('Project', nullif(new.payload->>'project_id', '')),
      ('Job', nullif(new.payload->>'job_id', ''))
    ) refs(entity_name, legacy_id)
    where legacy_id is not null
  loop
    select olr.organization_id into linked_org
    from public.organization_legacy_records olr
    where olr.legacy_entity = reference_entity
      and olr.legacy_record_id = reference_id
    limit 1;
    if linked_org is not null then
      new.organization_id := linked_org;
      return new;
    end if;
  end loop;

  select o.id into active_org from public.organizations o
  where o.status = 'active'
    and (select count(*) from public.organizations o2 where o2.status = 'active') = 1
  limit 1;
  if active_org is not null then new.organization_id := active_org; end if;
  return new;
end;
$$;
