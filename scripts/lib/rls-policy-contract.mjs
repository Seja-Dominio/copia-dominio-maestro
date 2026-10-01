const commands = ["SELECT", "INSERT", "UPDATE", "DELETE"];
const clientPrivileges = ["select", "insert", "update", "delete", "truncate", "references", "trigger"];

export function validateRlsPolicyCatalog(targets, rows) {
  const failures = [];
  for (const table of targets) {
    const entries = rows.filter((row) => row.table_name === table);
    const relation = entries[0];
    if (!relation) {
      failures.push(`${table}:missing_relation`);
      continue;
    }
    if (!relation.rls_enabled) failures.push(`${table}:rls_disabled`);
    for (const privilege of clientPrivileges) {
      if (relation[`anon_${privilege}`]) failures.push(`${table}:anon_${privilege}_granted`);
      if (relation[`authenticated_${privilege}`]) failures.push(`${table}:authenticated_${privilege}_granted`);
    }

    const policies = entries.filter((row) => row.policy_name);
    if (policies.length !== commands.length) {
      failures.push(`${table}:expected_${commands.length}_policies_got_${policies.length}`);
      continue;
    }
    for (const command of commands) {
      const name = `${table}_org_${command.toLowerCase()}`;
      const policy = policies.find((row) => row.policy_name === name && row.command === command);
      if (!policy) {
        failures.push(`${table}:${command.toLowerCase()}_policy_missing_or_misnamed`);
        continue;
      }
      if (policy.permissive !== "PERMISSIVE" || !policy.roles?.includes("authenticated")) {
        failures.push(`${table}:${command.toLowerCase()}_policy_role_or_mode_invalid`);
      }
      const using = policy.using_expression || "";
      const check = policy.check_expression || "";
      const requiredExpressions = command === "INSERT" ? [["check", check]]
        : command === "UPDATE" ? [["using", using], ["check", check]]
          : [["using", using]];
      for (const [clause, expression] of requiredExpressions) {
        for (const fragment of ["organization_members", "organization_id", "collaborator_id", "auth.uid()", "active"]) {
          if (!expression.includes(fragment)) failures.push(`${table}:${command.toLowerCase()}_${clause}_tenant_predicate_missing_${fragment.replaceAll(".", "_")}`);
        }
      }
      if ((command === "SELECT" || command === "UPDATE" || command === "DELETE") && !using) {
        failures.push(`${table}:${command.toLowerCase()}_using_missing`);
      }
      if ((command === "INSERT" || command === "UPDATE") && !check) {
        failures.push(`${table}:${command.toLowerCase()}_check_missing`);
      }
      if (command === "DELETE" && !(using.includes("master") && using.includes("gestor"))) {
        failures.push(`${table}:delete_manager_role_guard_missing`);
      }
    }
  }
  return failures;
}
