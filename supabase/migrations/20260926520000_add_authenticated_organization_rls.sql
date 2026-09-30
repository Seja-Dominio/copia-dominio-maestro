-- Policies tenant-aware preparatórias para eventual acesso direto via Data API.
-- Não concede privilégios de tabela: primeiro é necessário fechar o vínculo
-- Auth↔colaborador e aplicar autorização por produto/módulo nas policies.
-- O frontend atual continua usando o backend assinado e suas validações.

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'maestro_clients','maestro_projects','maestro_jobs','maestro_job_tasks','maestro_financial_entries',
    'maestro_agenda_events','maestro_timesheets','maestro_notifications','maestro_job_history',
    'maestro_webhook_receipts','maestro_whatsapp_contacts','maestro_whatsapp_groups','maestro_bank_accounts',
    'maestro_financial_categories','maestro_cost_centers','maestro_job_templates','maestro_proposals',
    'maestro_notes','maestro_nps_entries','maestro_nps_history','maestro_job_comments',
    'maestro_webhook_parsed_messages','maestro_dominus_query_logs','maestro_dominus_sent_messages',
    'maestro_dominus_pending_messages','maestro_mini_tasks','maestro_delete_logs','maestro_conversation_states',
    'maestro_audit_summaries','maestro_system_audit_logs','maestro_app_configs','maestro_squads',
    'maestro_whatsapp_automations'
  ] loop
    execute format('drop policy if exists %I on public.%I', table_name || '_org_select', table_name);
    execute format('create policy %I on public.%I for select to authenticated using (exists (select 1 from public.organization_members m where m.organization_id = %I.organization_id and m.collaborator_id = (select auth.uid()::text) and m.status = ''active''))', table_name || '_org_select', table_name, table_name);
    execute format('drop policy if exists %I on public.%I', table_name || '_org_insert', table_name);
    execute format('create policy %I on public.%I for insert to authenticated with check (exists (select 1 from public.organization_members m where m.organization_id = %I.organization_id and m.collaborator_id = (select auth.uid()::text) and m.status = ''active''))', table_name || '_org_insert', table_name, table_name);
    execute format('drop policy if exists %I on public.%I', table_name || '_org_update', table_name);
    execute format('create policy %I on public.%I for update to authenticated using (exists (select 1 from public.organization_members m where m.organization_id = %I.organization_id and m.collaborator_id = (select auth.uid()::text) and m.status = ''active'')) with check (exists (select 1 from public.organization_members m where m.organization_id = %I.organization_id and m.collaborator_id = (select auth.uid()::text) and m.status = ''active''))', table_name || '_org_update', table_name, table_name, table_name);
    execute format('drop policy if exists %I on public.%I', table_name || '_org_delete', table_name);
    execute format('create policy %I on public.%I for delete to authenticated using (exists (select 1 from public.organization_members m where m.organization_id = %I.organization_id and m.collaborator_id = (select auth.uid()::text) and m.status = ''active'' and m.role in (''master'', ''gestor'')))', table_name || '_org_delete', table_name, table_name);
  end loop;
end $$;
