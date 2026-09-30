-- Reassert the CXM queue tenant guard for environments whose migration ledger
-- contains an older version of 20260928031940. Maestro-only projects no-op.
-- Existing due jobs must satisfy the stronger guard before it is installed.
do $migration$
begin
  if to_regclass('public.cxm_silence_due_jobs') is null then
    raise notice 'Skipping CXM silence tenant guard: CXM queue is not installed';
    return;
  end if;

  if to_regclass('public.legacy_records') is null then
    raise exception 'Cannot reinforce CXM silence tenant guard without public.legacy_records';
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_attribute a
    where a.attrelid = 'public.cxm_silence_due_jobs'::regclass
      and a.attname = 'organization_id'
      and a.attnotnull
      and a.attnum > 0
      and not a.attisdropped
  ) then
    raise exception 'CXM silence queue must have a NOT NULL organization_id before tenant guard installation';
  end if;

  if exists (
    select 1
    from public.cxm_silence_due_jobs as due
    left join public.legacy_records as rule
      on rule.entity = 'CXMAutomationRule'
      and rule.record_id = due.rule_id
    left join public.legacy_records as client
      on client.entity = 'Client'
      and client.record_id = due.client_id
    where rule.organization_id is null
       or rule.organization_id is distinct from due.organization_id
       or client.organization_id is distinct from due.organization_id
       or rule.payload ->> 'client_id' is distinct from due.client_id
       or rule.payload ->> 'scope_type' is distinct from 'client'
       or rule.payload ->> 'scope_id' is distinct from due.client_id
  ) then
    raise exception 'Cannot reinforce CXM silence tenant guard: existing due jobs fail tenant or client-scope validation';
  end if;

  execute $function$
    create or replace function public.maestro_validate_cxm_silence_due_scope()
    returns trigger
    language plpgsql
    set search_path = ''
    as $body$
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
    $body$;
  $function$;

  execute 'revoke all on function public.maestro_validate_cxm_silence_due_scope() from public, anon, authenticated';
  execute 'drop trigger if exists cxm_silence_due_jobs_tenant_scope on public.cxm_silence_due_jobs';
  execute 'create trigger cxm_silence_due_jobs_tenant_scope
    before insert or update of organization_id, client_id, rule_id
    on public.cxm_silence_due_jobs
    for each row execute function public.maestro_validate_cxm_silence_due_scope()';
  execute 'alter table public.cxm_silence_due_jobs enable row level security';
  execute 'revoke all on table public.cxm_silence_due_jobs from public, anon, authenticated';
  execute 'grant select, insert, update, delete on table public.cxm_silence_due_jobs to service_role';
end;
$migration$;
