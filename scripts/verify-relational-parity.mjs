import pg from "pg";
import { getIsolatedTestDatabaseSsl, getIsolatedTestDatabaseUrl } from "./lib/isolated-test-database.mjs";
import { buildRelationalParityCoverageSql, relationalParityEntityCount } from "./lib/relational-parity-coverage.mjs";

let databaseUrl;
try {
  databaseUrl = getIsolatedTestDatabaseUrl();
} catch (error) {
  console.error(error.message);
  process.exit(2);
}

const client = new pg.Client({ connectionString: databaseUrl, ssl: getIsolatedTestDatabaseSsl(databaseUrl) });
const failures = [];

try {
  await client.connect();
  await client.query("begin read only");
  const session = await client.query("select current_setting('transaction_read_only') as read_only");
  if (session.rows[0]?.read_only !== "on") throw new Error("Parity verifier must run in a read-only transaction.");

  const counts = await client.query(`
    select
      (select count(*) from public.legacy_records where entity = 'Client') as legacy_clients,
      (select count(*) from public.maestro_clients) as relational_clients,
      (select count(*) from public.legacy_records where entity = 'Project') as legacy_projects,
      (select count(*) from public.maestro_projects) as relational_projects,
      (select count(*) from public.legacy_records where entity = 'Job') as legacy_jobs,
      (select count(*) from public.maestro_jobs) as relational_jobs,
      (select count(*) from public.legacy_records where entity = 'Subtask') as legacy_subtasks,
      (select count(*) from public.maestro_job_tasks) as relational_tasks,
      (select count(*) from public.legacy_records where entity = 'FinancialEntry') as legacy_financial_entries,
      (select count(*) from public.maestro_financial_entries) as relational_financial_entries
      ,(select count(*) from public.legacy_records where entity = 'AgendaEvent') as legacy_agenda_events
      ,(select count(*) from public.maestro_agenda_events) as relational_agenda_events
      ,(select count(*) from public.legacy_records where entity = 'Timesheet') as legacy_timesheets
      ,(select count(*) from public.maestro_timesheets) as relational_timesheets
      ,(select count(*) from public.legacy_records where entity = 'Notification') as legacy_notifications
      ,(select count(*) from public.maestro_notifications) as relational_notifications
      ,(select count(*) from public.legacy_records where entity = 'JobHistory') as legacy_job_history
      ,(select count(*) from public.maestro_job_history) as relational_job_history
      ,(select count(*) from public.legacy_records where entity = 'DominusWebhookReceipt') as legacy_webhook_receipts
      ,(select count(*) from public.maestro_webhook_receipts) as relational_webhook_receipts
      ,(select count(*) from public.legacy_records where entity = 'AIQueryLog') as legacy_ai_query_logs
      ,(select count(*) from public.maestro_ai_query_logs) as relational_ai_query_logs
      ,(select count(*) from public.legacy_records where entity = 'WhatsappContact') as legacy_whatsapp_contacts
      ,(select count(*) from public.maestro_whatsapp_contacts) as relational_whatsapp_contacts
      ,(select count(*) from public.legacy_records where entity = 'WhatsappGroup') as legacy_whatsapp_groups
      ,(select count(*) from public.maestro_whatsapp_groups) as relational_whatsapp_groups
      ,(select count(*) from public.legacy_records where entity = 'BankAccount') as legacy_bank_accounts
      ,(select count(*) from public.maestro_bank_accounts) as relational_bank_accounts
      ,(select count(*) from public.legacy_records where entity = 'FinancialCategory') as legacy_financial_categories
      ,(select count(*) from public.maestro_financial_categories) as relational_financial_categories
      ,(select count(*) from public.legacy_records where entity = 'CostCenter') as legacy_cost_centers
      ,(select count(*) from public.maestro_cost_centers) as relational_cost_centers
      ,(select count(*) from public.legacy_records where entity = 'JobTemplate') as legacy_job_templates
      ,(select count(*) from public.maestro_job_templates) as relational_job_templates
      ,(select count(*) from public.legacy_records where entity = 'Proposal') as legacy_proposals
      ,(select count(*) from public.maestro_proposals) as relational_proposals
      ,(select count(*) from public.legacy_records where entity = 'Note') as legacy_notes
      ,(select count(*) from public.maestro_notes) as relational_notes
      ,(select count(*) from public.legacy_records where entity = 'NpsEntry') as legacy_nps_entries
      ,(select count(*) from public.maestro_nps_entries) as relational_nps_entries
      ,(select count(*) from public.legacy_records where entity = 'NpsHistory') as legacy_nps_history
      ,(select count(*) from public.maestro_nps_history) as relational_nps_history
      ,(select count(*) from public.legacy_records where entity = 'Comment' and coalesce(payload->>'entity_type','job') = 'job') as legacy_job_comments
      ,(select count(*) from public.maestro_job_comments) as relational_job_comments
      ,(select count(*) from public.legacy_records where entity = 'DominusWebhookParsed') as legacy_webhook_parsed
      ,(select count(*) from public.maestro_webhook_parsed_messages) as relational_webhook_parsed
      ,(select count(*) from public.legacy_records where entity = 'DominusQueryLog') as legacy_dominus_query_logs
      ,(select count(*) from public.maestro_dominus_query_logs) as relational_dominus_query_logs
      ,(select count(*) from public.legacy_records where entity = 'DominusSentMessage') as legacy_dominus_sent_messages
      ,(select count(*) from public.maestro_dominus_sent_messages) as relational_dominus_sent_messages
      ,(select count(*) from public.legacy_records where entity = 'DominusPendingMessage') as legacy_dominus_pending_messages
      ,(select count(*) from public.maestro_dominus_pending_messages) as relational_dominus_pending_messages
      ,(select count(*) from public.legacy_records where entity = 'MiniTask') as legacy_mini_tasks
      ,(select count(*) from public.maestro_mini_tasks) as relational_mini_tasks
      ,(select count(*) from public.legacy_records where entity = 'DeleteLog') as legacy_delete_logs
      ,(select count(*) from public.maestro_delete_logs) as relational_delete_logs
      ,(select count(*) from public.legacy_records where entity = 'DominusConversationState') as legacy_conversation_states
      ,(select count(*) from public.maestro_conversation_states) as relational_conversation_states
      ,(select count(*) from public.legacy_records where entity = 'DominusAuditSummary') as legacy_audit_summaries
      ,(select count(*) from public.maestro_audit_summaries) as relational_audit_summaries
      ,(select count(*) from public.legacy_records where entity = 'SystemAuditLog') as legacy_system_audit_logs
      ,(select count(*) from public.maestro_system_audit_logs) as relational_system_audit_logs
      ,(select count(*) from public.legacy_records where entity = 'AppConfig') as legacy_app_configs
      ,(select count(*) from public.maestro_app_configs) as relational_app_configs
      ,(select count(*) from public.legacy_records where entity = 'Squad') as legacy_squads
      ,(select count(*) from public.maestro_squads) as relational_squads
      ,(select count(*) from public.legacy_records where entity = 'WhatsappAutomation') as legacy_whatsapp_automations
      ,(select count(*) from public.maestro_whatsapp_automations) as relational_whatsapp_automations
  `);
  const totals = counts.rows[0];
  const parityPairs = [
    ["legacy_clients", "relational_clients"],
    ["legacy_projects", "relational_projects"],
    ["legacy_jobs", "relational_jobs"],
    ["legacy_subtasks", "relational_tasks"],
    ["legacy_financial_entries", "relational_financial_entries"],
    ["legacy_agenda_events", "relational_agenda_events"],
    ["legacy_timesheets", "relational_timesheets"],
    ["legacy_notifications", "relational_notifications"],
    ["legacy_job_history", "relational_job_history"],
    ["legacy_webhook_receipts", "relational_webhook_receipts"],
    ["legacy_ai_query_logs", "relational_ai_query_logs"],
    ["legacy_whatsapp_contacts", "relational_whatsapp_contacts"],
    ["legacy_whatsapp_groups", "relational_whatsapp_groups"],
    ["legacy_bank_accounts", "relational_bank_accounts"],
    ["legacy_financial_categories", "relational_financial_categories"],
    ["legacy_cost_centers", "relational_cost_centers"],
    ["legacy_job_templates", "relational_job_templates"],
    ["legacy_proposals", "relational_proposals"],
    ["legacy_notes", "relational_notes"],
    ["legacy_nps_entries", "relational_nps_entries"],
    ["legacy_nps_history", "relational_nps_history"],
    ["legacy_job_comments", "relational_job_comments"],
    ["legacy_webhook_parsed", "relational_webhook_parsed"],
    ["legacy_dominus_query_logs", "relational_dominus_query_logs"],
    ["legacy_dominus_sent_messages", "relational_dominus_sent_messages"],
    ["legacy_dominus_pending_messages", "relational_dominus_pending_messages"],
    ["legacy_mini_tasks", "relational_mini_tasks"],
    ["legacy_delete_logs", "relational_delete_logs"],
    ["legacy_conversation_states", "relational_conversation_states"],
    ["legacy_audit_summaries", "relational_audit_summaries"],
    ["legacy_system_audit_logs", "relational_system_audit_logs"],
    ["legacy_app_configs", "relational_app_configs"],
    ["legacy_squads", "relational_squads"],
    ["legacy_whatsapp_automations", "relational_whatsapp_automations"],
  ];
  const legacyRowsObserved = parityPairs.reduce((sum, [legacy]) => sum + Number(totals[legacy]), 0);
  const relationalRowsObserved = parityPairs.reduce((sum, [, relational]) => sum + Number(totals[relational]), 0);
  const populatedEntityPairs = parityPairs.filter(([legacy, relational]) =>
    Number(totals[legacy]) > 0 || Number(totals[relational]) > 0).length;
  for (const [legacy, relational] of parityPairs) {
    if (Number(totals[legacy]) !== Number(totals[relational])) {
      failures.push(`${legacy}=${totals[legacy]} != ${relational}=${totals[relational]}`);
    }
  }

  const parity = await client.query(`
    select 'Client' as entity, count(*) filter (where r.source_payload is distinct from l.payload) as mismatches
      from public.maestro_clients r join public.legacy_records l on l.entity='Client' and l.record_id=r.legacy_record_id
    union all
    select 'Project', count(*) filter (where r.source_payload is distinct from l.payload)
      from public.maestro_projects r join public.legacy_records l on l.entity='Project' and l.record_id=r.legacy_record_id
    union all
    select 'Job', count(*) filter (where r.source_payload is distinct from l.payload)
      from public.maestro_jobs r join public.legacy_records l on l.entity='Job' and l.record_id=r.legacy_record_id
    union all
    select 'Subtask', count(*) filter (where r.source_payload is distinct from l.payload)
      from public.maestro_job_tasks r join public.legacy_records l on l.entity='Subtask' and l.record_id=r.legacy_record_id
    union all
    select 'FinancialEntry', count(*) filter (where r.source_payload is distinct from l.payload)
      from public.maestro_financial_entries r join public.legacy_records l on l.entity='FinancialEntry' and l.record_id=r.legacy_record_id
    union all
    select 'AgendaEvent', count(*) filter (where r.source_payload is distinct from l.payload)
      from public.maestro_agenda_events r join public.legacy_records l on l.entity='AgendaEvent' and l.record_id=r.legacy_record_id
    union all
    select 'Timesheet', count(*) filter (where r.source_payload is distinct from l.payload)
      from public.maestro_timesheets r join public.legacy_records l on l.entity='Timesheet' and l.record_id=r.legacy_record_id
    union all
    select 'Notification', count(*) filter (where r.source_payload is distinct from l.payload)
      from public.maestro_notifications r join public.legacy_records l on l.entity='Notification' and l.record_id=r.legacy_record_id
    union all
    select 'JobHistory', count(*) filter (where r.source_payload is distinct from l.payload)
      from public.maestro_job_history r join public.legacy_records l on l.entity='JobHistory' and l.record_id=r.legacy_record_id
    union all
    select 'DominusWebhookReceipt', count(*) filter (where r.source_payload is distinct from l.payload)
      from public.maestro_webhook_receipts r join public.legacy_records l on l.entity='DominusWebhookReceipt' and l.record_id=r.legacy_record_id
    union all
    select 'AIQueryLog', count(*) filter (where r.payload is distinct from l.payload)
      from public.maestro_ai_query_logs r join public.legacy_records l on l.entity='AIQueryLog' and l.record_id=r.id
    union all
    select 'WhatsappContact', count(*) filter (where r.payload is distinct from l.payload)
      from public.maestro_whatsapp_contacts r join public.legacy_records l on l.entity='WhatsappContact' and l.record_id=r.legacy_record_id
    union all
    select 'WhatsappGroup', count(*) filter (where r.payload is distinct from l.payload)
      from public.maestro_whatsapp_groups r join public.legacy_records l on l.entity='WhatsappGroup' and l.record_id=r.legacy_record_id
    union all
    select 'BankAccount', count(*) filter (where r.payload is distinct from l.payload)
      from public.maestro_bank_accounts r join public.legacy_records l on l.entity='BankAccount' and l.record_id=r.legacy_record_id
    union all
    select 'FinancialCategory', count(*) filter (where r.payload is distinct from l.payload)
      from public.maestro_financial_categories r join public.legacy_records l on l.entity='FinancialCategory' and l.record_id=r.legacy_record_id
    union all
    select 'CostCenter', count(*) filter (where r.payload is distinct from l.payload)
      from public.maestro_cost_centers r join public.legacy_records l on l.entity='CostCenter' and l.record_id=r.legacy_record_id
    union all
    select 'JobTemplate', count(*) filter (where r.template_payload is distinct from l.payload)
      from public.maestro_job_templates r join public.legacy_records l on l.entity='JobTemplate' and l.record_id=r.legacy_record_id
    union all
    select 'Proposal', count(*) filter (where r.proposal_payload is distinct from l.payload)
      from public.maestro_proposals r join public.legacy_records l on l.entity='Proposal' and l.record_id=r.legacy_record_id
    union all
    select 'Note', count(*) filter (where r.note_payload is distinct from l.payload)
      from public.maestro_notes r join public.legacy_records l on l.entity='Note' and l.record_id=r.legacy_record_id
    union all
    select 'NpsEntry', count(*) filter (where r.payload is distinct from l.payload)
      from public.maestro_nps_entries r join public.legacy_records l on l.entity='NpsEntry' and l.record_id=r.legacy_record_id
    union all
    select 'NpsHistory', count(*) filter (where r.payload is distinct from l.payload)
      from public.maestro_nps_history r join public.legacy_records l on l.entity='NpsHistory' and l.record_id=r.legacy_record_id
    union all
    select 'Comment', count(*) filter (where r.payload is distinct from l.payload)
      from public.maestro_job_comments r join public.legacy_records l on l.entity='Comment' and l.record_id=r.legacy_record_id
    union all
    select 'DominusWebhookParsed', count(*) filter (where r.payload is distinct from l.payload)
      from public.maestro_webhook_parsed_messages r join public.legacy_records l on l.entity='DominusWebhookParsed' and l.record_id=r.legacy_record_id
    union all
    select 'DominusQueryLog', count(*) filter (where r.payload is distinct from l.payload)
      from public.maestro_dominus_query_logs r join public.legacy_records l on l.entity='DominusQueryLog' and l.record_id=r.legacy_record_id
    union all
    select 'DominusSentMessage', count(*) filter (where r.payload is distinct from l.payload)
      from public.maestro_dominus_sent_messages r join public.legacy_records l on l.entity='DominusSentMessage' and l.record_id=r.legacy_record_id
    union all
    select 'DominusPendingMessage', count(*) filter (where r.payload is distinct from l.payload)
      from public.maestro_dominus_pending_messages r join public.legacy_records l on l.entity='DominusPendingMessage' and l.record_id=r.legacy_record_id
    union all
    select 'MiniTask', count(*) filter (where r.task_payload is distinct from l.payload)
      from public.maestro_mini_tasks r join public.legacy_records l on l.entity='MiniTask' and l.record_id=r.legacy_record_id
    union all
    select 'DeleteLog', count(*) filter (where r.payload is distinct from l.payload)
      from public.maestro_delete_logs r join public.legacy_records l on l.entity='DeleteLog' and l.record_id=r.legacy_record_id
    union all
    select 'DominusConversationState', count(*) filter (where r.state_payload is distinct from l.payload)
      from public.maestro_conversation_states r join public.legacy_records l on l.entity='DominusConversationState' and l.record_id=r.legacy_record_id
    union all
    select 'DominusAuditSummary', count(*) filter (where r.audit_payload is distinct from l.payload)
      from public.maestro_audit_summaries r join public.legacy_records l on l.entity='DominusAuditSummary' and l.record_id=r.legacy_record_id
    union all
    select 'SystemAuditLog', count(*) filter (where r.audit_payload is distinct from l.payload)
      from public.maestro_system_audit_logs r join public.legacy_records l on l.entity='SystemAuditLog' and l.record_id=r.legacy_record_id
    union all
    select 'AppConfig', count(*) filter (where r.config_payload is distinct from l.payload)
      from public.maestro_app_configs r join public.legacy_records l on l.entity='AppConfig' and l.record_id=r.legacy_record_id
    union all
    select 'Squad', count(*) filter (where r.squad_payload is distinct from l.payload)
      from public.maestro_squads r join public.legacy_records l on l.entity='Squad' and l.record_id=r.legacy_record_id
    union all
    select 'WhatsappAutomation', count(*) filter (where r.automation_payload is distinct from l.payload)
      from public.maestro_whatsapp_automations r join public.legacy_records l on l.entity='WhatsappAutomation' and l.record_id=r.legacy_record_id
  `);
  for (const row of parity.rows) {
    if (Number(row.mismatches) !== 0) failures.push(`${row.entity} payload mismatches=${row.mismatches}`);
  }

  const coverage = await client.query(buildRelationalParityCoverageSql());
  for (const row of coverage.rows) {
    if (Number(row.missing_relational) !== 0 || Number(row.missing_legacy) !== 0) {
      failures.push(`${row.entity} ID coverage: missing_relational=${row.missing_relational}, missing_legacy=${row.missing_legacy}`);
    }
  }

  const integrity = await client.query(`
    select
      (select count(*) from public.maestro_projects where client_id is null) as projects_without_client,
      (select count(*) from public.maestro_jobs where project_id is null or client_id is null) as jobs_without_links,
      (select count(*) from public.maestro_job_tasks where job_id is null and resolution_status='pending') as pending_tasks,
      (select count(*) from public.relational_integrity_exceptions where resolution_status='pending') as pending_exceptions
  `);
  const integrityRow = integrity.rows[0];
  if (Number(integrityRow.projects_without_client) !== 0) failures.push(`projects_without_client=${integrityRow.projects_without_client}`);

  console.log(JSON.stringify({
    status: failures.length ? "failed" : "ok",
    data_evidence: {
      scope: legacyRowsObserved + relationalRowsObserved === 0
        ? "empty_clean_room_structural_contracts_only"
        : "populated_rows_compared_for_defined_entities",
      entity_pairs: parityPairs.length,
      entity_pairs_with_rows: populatedEntityPairs,
      legacy_rows_observed: legacyRowsObserved,
      relational_rows_observed: relationalRowsObserved,
    },
    counts: totals,
    parity: parity.rows,
    coverage: {
      entities: relationalParityEntityCount,
      missing_relational: coverage.rows.reduce((total, row) => total + Number(row.missing_relational), 0),
      missing_legacy: coverage.rows.reduce((total, row) => total + Number(row.missing_legacy), 0),
    },
    integrity: integrityRow,
    failures,
  }, null, 2));
  process.exitCode = failures.length ? 1 : 0;
} finally {
  await client.query("rollback").catch(() => {});
  await client.end().catch(() => {});
}
