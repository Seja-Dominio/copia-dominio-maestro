const pairs = [
  ["Client", "maestro_clients"], ["Project", "maestro_projects"], ["Job", "maestro_jobs"],
  ["Subtask", "maestro_job_tasks"], ["FinancialEntry", "maestro_financial_entries"],
  ["AgendaEvent", "maestro_agenda_events"], ["Timesheet", "maestro_timesheets"],
  ["Notification", "maestro_notifications"], ["JobHistory", "maestro_job_history"],
  ["DominusWebhookReceipt", "maestro_webhook_receipts"], ["AIQueryLog", "maestro_ai_query_logs", "id"],
  ["WhatsappContact", "maestro_whatsapp_contacts"], ["WhatsappGroup", "maestro_whatsapp_groups"],
  ["BankAccount", "maestro_bank_accounts"], ["FinancialCategory", "maestro_financial_categories"],
  ["CostCenter", "maestro_cost_centers"], ["JobTemplate", "maestro_job_templates"],
  ["Proposal", "maestro_proposals"], ["Note", "maestro_notes"], ["NpsEntry", "maestro_nps_entries"],
  ["NpsHistory", "maestro_nps_history"], ["Comment", "maestro_job_comments"],
  ["DominusWebhookParsed", "maestro_webhook_parsed_messages"],
  ["DominusQueryLog", "maestro_dominus_query_logs"],
  ["DominusSentMessage", "maestro_dominus_sent_messages"],
  ["DominusPendingMessage", "maestro_dominus_pending_messages"],
  ["MiniTask", "maestro_mini_tasks"], ["DeleteLog", "maestro_delete_logs"],
  ["DominusConversationState", "maestro_conversation_states"],
  ["DominusAuditSummary", "maestro_audit_summaries"], ["SystemAuditLog", "maestro_system_audit_logs"],
  ["AppConfig", "maestro_app_configs"], ["Squad", "maestro_squads"],
  ["WhatsappAutomation", "maestro_whatsapp_automations"],
].map(([entity, table, relationalId = "legacy_record_id"]) => ({ entity, table, relationalId }));

const legacyScope = (entity, alias = "l") => entity === "Comment"
  ? ` and coalesce(${alias}.payload->>'entity_type', 'job') = 'job'`
  : "";

export function buildRelationalParityCoverageSql(selectedPairs = pairs) {
  return selectedPairs.map(({ entity, table, relationalId = "legacy_record_id" }) => {
    if (![entity, table, relationalId].every((part) => /^[A-Za-z_][A-Za-z0-9_]*$/.test(part))) {
      throw new Error(`Unsafe relational parity identifier for ${entity}`);
    }
    const legacyLookupPredicate = `l.entity = '${entity}'${legacyScope(entity)}`;
    return `select '${entity}' as entity,
      (select count(*) from public.legacy_records l
        where ${legacyLookupPredicate}
          and not exists (select 1 from public.${table} r
            where r.organization_id = l.organization_id
              and r.${relationalId} = l.record_id)
      ) as missing_relational,
      (select count(*) from public.${table} r
        where not exists (select 1 from public.legacy_records l
          where ${legacyLookupPredicate}
            and l.organization_id = r.organization_id
            and l.record_id = r.${relationalId})
      ) as missing_legacy`;
  }).join("\nunion all\n");
}

export const relationalParityEntityCount = pairs.length;
