-- Health gate compatible with partially reconciled environments.
-- Build directional coverage only for relational tables that actually exist;
-- never report an unobservable registry entity as healthy.
do $$
declare
  v_directional_sql text := '';
  v_has_directional boolean := false;
  v_parity_sql text := '';
  v_has_parity boolean := false;
  v_item record;
begin
  for v_item in
    select * from (values
      ('Client'::text, 'maestro_clients'::text, 'true'::text, 'source_payload'::text),
      ('Project', 'maestro_projects', 'true', 'source_payload'),
      ('Job', 'maestro_jobs', 'true', 'source_payload'),
      ('Subtask', 'maestro_job_tasks', 'true', 'source_payload'),
      ('FinancialEntry', 'maestro_financial_entries', 'true', 'source_payload'),
      ('AgendaEvent', 'maestro_agenda_events', 'true', 'source_payload'),
      ('Timesheet', 'maestro_timesheets', 'true', 'source_payload'),
      ('Notification', 'maestro_notifications', 'true', 'source_payload'),
      ('BankAccount', 'maestro_bank_accounts', 'true', 'payload'),
      ('FinancialCategory', 'maestro_financial_categories', 'true', 'payload'),
      ('CostCenter', 'maestro_cost_centers', 'true', 'payload'),
      ('JobTemplate', 'maestro_job_templates', 'true', 'template_payload'),
      ('Proposal', 'maestro_proposals', 'true', 'proposal_payload'),
      ('Note', 'maestro_notes', 'true', 'note_payload'),
      ('WhatsappContact', 'maestro_whatsapp_contacts', 'true', 'payload'),
      ('WhatsappGroup', 'maestro_whatsapp_groups', 'true', 'payload'),
      ('NpsEntry', 'maestro_nps_entries', 'true', 'payload'),
      ('NpsHistory', 'maestro_nps_history', 'true', 'payload'),
      ('Comment', 'maestro_job_comments', $filter$coalesce(l.payload->>'entity_type', 'job') = 'job'$filter$, 'payload'),
      ('DominusWebhookParsed', 'maestro_webhook_parsed_messages', 'true', 'payload'),
      ('WhatsappAutomation', 'maestro_whatsapp_automations', 'true', 'automation_payload')
    ) as candidates(entity, relation_name, legacy_filter, relational_payload_column)
  loop
    if to_regclass(format('public.%I', v_item.relation_name)) is null then
      continue;
    end if;

    if v_has_directional then
      v_directional_sql := v_directional_sql || E'\nunion all\n';
    end if;

    v_directional_sql := v_directional_sql || format(
      $query$
      select %L::text as entity,
        (select count(*) from public.legacy_records l
          where l.entity = %L and (%s) and not exists (
            select 1 from public.%I r
            where r.organization_id = l.organization_id
              and r.legacy_record_id = l.record_id
          ))::bigint as legacy_only_count,
        (select count(*) from public.%I r
          where not exists (
            select 1 from public.legacy_records l
            where l.organization_id = r.organization_id
              and l.entity = %L
              and l.record_id = r.legacy_record_id
          ))::bigint as relational_only_count
      $query$,
      v_item.entity,
      v_item.entity,
      v_item.legacy_filter,
      v_item.relation_name,
      v_item.relation_name,
      v_item.entity
    );
    v_has_directional := true;

    if v_has_parity then
      v_parity_sql := v_parity_sql || E'\nunion all\n';
    end if;
    v_parity_sql := v_parity_sql || format(
      $query$
      select %L::text as entity,
        (select count(*) from public.legacy_records l
          where l.entity = %L and (%s))::bigint as legacy_count,
        (select count(*) from public.%I r)::bigint as relational_count,
        (select count(*) from public.%I r
          join public.legacy_records l
            on l.organization_id = r.organization_id
           and l.entity = %L
           and l.record_id = r.legacy_record_id
          where (%s) and to_jsonb(r) -> %L is distinct from l.payload)::bigint as payload_mismatches
      $query$,
      v_item.entity,
      v_item.entity,
      v_item.legacy_filter,
      v_item.relation_name,
      v_item.relation_name,
      v_item.entity,
      v_item.legacy_filter,
      v_item.relational_payload_column
    );
    v_has_parity := true;
  end loop;

  if not v_has_directional then
    v_directional_sql := 'select null::text as entity, null::bigint as legacy_only_count, null::bigint as relational_only_count where false';
  end if;
  if not v_has_parity then
    v_parity_sql := 'select null::text as entity, null::bigint as legacy_count, null::bigint as relational_count, null::bigint as payload_mismatches where false';
  end if;

  execute format($view$
    create or replace view public.maestro_legacy_cutover_health
    with (security_invoker = true) as
    with directional as (
      %s
    ), parity as (
      %s
    ), report as (
      select r.entity, r.module_key, r.status, r.read_mode, r.write_mode,
        r.legacy_read_allowed, r.legacy_write_allowed,
        h.legacy_count, h.relational_count, h.payload_mismatches,
        case
          when r.relational_table is not null and to_regclass(format('public.%%I', r.relational_table)) is null then 'schema_incomplete'
          when r.status in ('frozen', 'retired') and r.legacy_write_allowed then 'invalid_cutover'
          when r.status in ('frozen', 'retired') and r.read_mode = 'relational'
            and r.write_mode = 'relational' and not r.legacy_write_allowed
            and d.entity is not null then
              case when d.legacy_only_count > 0 then 'diverged' else 'ok' end
          when h.entity is not null and (
            h.payload_mismatches <> 0
            or h.legacy_count <> h.relational_count
            or coalesce(d.legacy_only_count, 0) <> 0
            or coalesce(d.relational_only_count, 0) <> 0
          ) then 'diverged'
          when h.entity is not null then 'ok'
          else 'not_in_health_view'
        end as health_status,
        d.legacy_only_count,
        d.relational_only_count
      from public.legacy_cutover_registry r
      left join parity h on h.entity = r.entity
      left join directional d on d.entity = r.entity
    )
    select entity, module_key, status, read_mode, write_mode, legacy_read_allowed,
      legacy_write_allowed, legacy_count, relational_count, payload_mismatches,
      health_status, legacy_only_count, relational_only_count
    from report
  $view$, v_directional_sql, v_parity_sql);
end;
$$;

comment on view public.maestro_legacy_cutover_health is
  'Fail-closed cutover gate: strict parity where observable and directional legacy-to-relational coverage for frozen relational entities.';

revoke all on public.maestro_legacy_cutover_health from public, anon, authenticated;
grant select on public.maestro_legacy_cutover_health to service_role;
