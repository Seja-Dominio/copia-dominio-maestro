-- Restore the tenant context set by maestro_apply_legacy_mutation_scoped.
-- Preserve existing core legacy-link and optional provider-owner fallbacks;
-- the integration registry is not installed in every environment.
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
  exception when others then
    configured_org := null;
  end;
  if configured_org is not null then
    new.organization_id := configured_org;
    return new;
  end if;

  if new.entity = 'DominusWebhookReceipt'
    and to_regclass('public.organization_integrations') is not null then
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
