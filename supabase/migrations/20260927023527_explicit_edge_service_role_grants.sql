-- Keep Edge Function access working when platform default grants for new
-- public tables are disabled. These privileges are for server-side calls only;
-- end-user authorization remains the responsibility of each Edge Function.

grant select, insert, update on table public.cxm_silence_due_jobs to service_role;

grant select, insert on table
  public.dominus_audit_findings,
  public.dominus_learning_review_comments,
  public.dominus_learning_review_events,
  public.maestro_ads_authorizations,
  public.maestro_webhook_parsed_messages,
  public.team_chat_messages
to service_role;

grant select, insert, update on table
  public.dominus_audit_runs,
  public.dominus_learning_reviews,
  public.dominus_memory,
  public.maestro_collaborators,
  public.maestro_whatsapp_contacts,
  public.maestro_whatsapp_groups
to service_role;

grant insert on table
  public.maestro_ai_query_logs,
  public.maestro_job_history
to service_role;

grant select on table
  public.legacy_cutover_registry,
  public.marketing_mix_observations,
  public.organization_members,
  public.organization_products,
  public.organizations,
  public.team_chat_channels
to service_role;

grant select, insert, delete on table public.team_chat_message_reactions to service_role;

grant select, insert, update, delete on table
  public.legacy_records,
  public.maestro_ads_accounts,
  public.maestro_agenda_events,
  public.maestro_bank_accounts,
  public.maestro_clients,
  public.maestro_cost_centers,
  public.maestro_financial_categories,
  public.maestro_financial_entries,
  public.maestro_job_comments,
  public.maestro_job_tasks,
  public.maestro_jobs,
  public.maestro_job_templates,
  public.maestro_notes,
  public.maestro_notifications,
  public.maestro_nps_entries,
  public.maestro_nps_history,
  public.maestro_projects,
  public.maestro_proposals,
  public.maestro_timesheets,
  public.maestro_whatsapp_automations
to service_role;
