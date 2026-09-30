-- Expand/backfill/validate the internal CXM silence queue before tenant cutover.
alter table public.cxm_silence_due_jobs
  add column organization_id uuid;

update public.cxm_silence_due_jobs as due
set organization_id = rule.organization_id
from public.legacy_records as rule
where rule.entity = 'CXMAutomationRule'
  and rule.record_id = due.rule_id
  and rule.organization_id is not null;

do $$
begin
  if exists (
    select 1 from public.cxm_silence_due_jobs where organization_id is null
  ) then
    raise exception 'Cannot tenant-scope CXM silence queue: one or more due jobs have no organization-scoped automation rule';
  end if;
end;
$$;

alter table public.cxm_silence_due_jobs
  alter column organization_id set not null,
  add constraint cxm_silence_due_jobs_organization_fkey
    foreign key (organization_id) references public.organizations(id) on delete restrict,
  add constraint cxm_silence_due_jobs_organization_client_fkey
    foreign key (organization_id, client_id)
    references public.maestro_clients(organization_id, legacy_record_id) on delete restrict;

create index cxm_silence_due_jobs_org_client_idx
  on public.cxm_silence_due_jobs (organization_id, client_id);

create or replace function public.maestro_validate_cxm_silence_due_scope()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_rule_organization_id uuid;
begin
  select rule.organization_id
    into v_rule_organization_id
  from public.legacy_records as rule
  where rule.entity = 'CXMAutomationRule'
    and rule.record_id = new.rule_id;

  if v_rule_organization_id is null
     or v_rule_organization_id is distinct from new.organization_id then
    raise exception 'CXM silence due job organization must match its automation rule'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

revoke all on function public.maestro_validate_cxm_silence_due_scope() from public, anon, authenticated;

create trigger cxm_silence_due_jobs_tenant_scope
  before insert or update of organization_id, rule_id
  on public.cxm_silence_due_jobs
  for each row execute function public.maestro_validate_cxm_silence_due_scope();
