-- Add tenant identity to the CXM-only due queue without creating a dependency
-- on Maestro's relational Client/Project/Job tables.
alter table public.cxm_silence_due_jobs
  add column if not exists organization_id uuid;

update public.cxm_silence_due_jobs as due
set organization_id = rule.organization_id
from public.legacy_records as rule
where rule.entity = 'CXMAutomationRule'
  and rule.record_id = due.rule_id
  and rule.organization_id is not null
  and due.organization_id is null;

do $$
begin
  if exists (
    select 1 from public.cxm_silence_due_jobs where organization_id is null
  ) then
    raise exception 'Cannot tenant-scope CXM silence queue: due job has no organization-scoped automation rule';
  end if;
end;
$$;

alter table public.cxm_silence_due_jobs
  alter column organization_id set not null;

-- This queue belongs to CXM and must remain usable when its Client is stored
-- only in the legacy CXM/agency domain, without a Maestro relational projection.
alter table public.cxm_silence_due_jobs
  drop constraint if exists cxm_silence_due_jobs_organization_client_fkey;

create index if not exists cxm_silence_due_jobs_org_client_idx
  on public.cxm_silence_due_jobs (organization_id, client_id);

create or replace function public.maestro_validate_cxm_silence_due_scope()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_rule_organization_id uuid;
  v_rule_payload jsonb;
begin
  select rule.organization_id, rule.payload
    into v_rule_organization_id, v_rule_payload
  from public.legacy_records as rule
  where rule.entity = 'CXMAutomationRule'
    and rule.record_id = new.rule_id;

  if v_rule_organization_id is null
     or v_rule_organization_id is distinct from new.organization_id
     or not exists (
       select 1
       from public.legacy_records as client
       where client.entity = 'Client'
         and client.record_id = new.client_id
         and client.organization_id = new.organization_id
     )
     or v_rule_payload ->> 'client_id' is distinct from new.client_id
     or v_rule_payload ->> 'scope_type' is distinct from 'client'
     or v_rule_payload ->> 'scope_id' is distinct from new.client_id then
    raise exception 'CXM silence due job must match its tenant-scoped client automation rule'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

revoke all on function public.maestro_validate_cxm_silence_due_scope() from public, anon, authenticated;
drop trigger if exists cxm_silence_due_jobs_tenant_scope on public.cxm_silence_due_jobs;
create trigger cxm_silence_due_jobs_tenant_scope
  before insert or update of organization_id, client_id, rule_id
  on public.cxm_silence_due_jobs
  for each row execute function public.maestro_validate_cxm_silence_due_scope();

revoke all on table public.cxm_silence_due_jobs from public, anon, authenticated;
grant select, insert, update, delete on table public.cxm_silence_due_jobs to service_role;
