import test from "node:test";
import assert from "node:assert/strict";
import { verifySubtaskTransferContract } from "./subtask-transfer-contract.mjs";

const edgeSource = `
if (operation === "transferSubtasks") {
  const result = await supabase.rpc("maestro_transfer_subtasks", { p_organization_id: session.organization_id });
  return json({ data: result.data }, 200, origin);
}
if (operation === "create" || operation === "update") {}
`;

const migrationSource = `
create or replace function public.maestro_transfer_subtasks(p_organization_id uuid)
returns jsonb language plpgsql security invoker set search_path = '' as $$
begin
  perform 1 from public.organization_members;
  perform 1 from public.maestro_collaborators;
  perform 1 from public.maestro_job_tasks for update;
  insert into public.maestro_job_history default values;
  return '{}'::jsonb;
end;
$$;
revoke all on function public.maestro_transfer_subtasks(uuid) from public, anon, authenticated;
grant execute on function public.maestro_transfer_subtasks(uuid) to service_role;
`;

test("relational subtask transfer uses an atomic server RPC and protected relational history", () => {
  assert.deepEqual(verifySubtaskTransferContract({ edgeSource, migrationSource }), []);
});

test("rejects a legacy upsert in the frozen subtask transfer path", () => {
  const regressed = edgeSource.replace(
    'return json({ data: result.data }, 200, origin);',
    'await supabase.from("legacy_records").upsert(rows); return json({ data: result.data }, 200, origin);',
  );
  assert.match(verifySubtaskTransferContract({ edgeSource: regressed, migrationSource }).join("\n"), /escrita legada/);
});

test("rejects insecure RPC grants or a non-invoker definition", () => {
  const insecure = migrationSource.replace("security invoker", "security definer")
    .replace("to service_role", "to authenticated");
  const errors = verifySubtaskTransferContract({ edgeSource, migrationSource: insecure });
  assert.ok(errors.some((error) => error.includes("security\\s+invoker")));
  assert.ok(errors.some((error) => error.includes("to\\s+service_role")));
});
