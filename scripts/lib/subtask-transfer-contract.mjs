export function verifySubtaskTransferContract({ edgeSource, migrationSource }) {
  const errors = [];
  const start = edgeSource.indexOf('if (operation === "transferSubtasks") {');
  const end = edgeSource.indexOf('if (operation === "create" || operation === "update") {', start);
  const handler = start < 0 || end < 0 ? "" : edgeSource.slice(start, end);

  if (!handler) errors.push("transferSubtasks: handler não localizado");
  else {
    if (!handler.includes('supabase.rpc("maestro_transfer_subtasks"')) {
      errors.push("transferSubtasks: precisa usar o RPC atômico relacional");
    }
    if (handler.includes('supabase.from("legacy_records").upsert')) {
      errors.push("transferSubtasks: escrita legada não pode contornar o cutover frozen");
    }
  }

  const requiredSql = [
    /create\s+or\s+replace\s+function\s+public\.maestro_transfer_subtasks\s*\(/i,
    /security\s+invoker/i,
    /set\s+search_path\s*=\s*''/i,
    /public\.organization_members/i,
    /public\.maestro_collaborators/i,
    /public\.maestro_job_tasks/i,
    /public\.maestro_job_history/i,
    /for\s+update/i,
    /revoke\s+all\s+on\s+function\s+public\.maestro_transfer_subtasks[\s\S]*?from\s+public\s*,\s*anon\s*,\s*authenticated/i,
    /grant\s+execute\s+on\s+function\s+public\.maestro_transfer_subtasks[\s\S]*?to\s+service_role/i,
  ];
  if (!migrationSource) errors.push("transferSubtasks: migration ausente");
  for (const expression of requiredSql) {
    if (!expression.test(migrationSource)) errors.push(`transferSubtasks: contrato SQL ausente (${expression})`);
  }
  if (/public\.legacy_records/i.test(migrationSource)) {
    errors.push("transferSubtasks: RPC não deve escrever nem depender de legacy_records");
  }

  return errors;
}
