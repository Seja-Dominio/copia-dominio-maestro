import test from "node:test";
import assert from "node:assert/strict";
import {
  validateRelationalReferenceContracts,
  validateTenantForeignKeyContracts,
} from "./relational-reference-contracts.mjs";

const contract = (table, column, disposition = "tenant_fk_required") => ({
  table, column, disposition, target: "parent.id + organization_id", target_table: "parent",
  target_column: "id", rationale: "Explicit relation contract.",
});

test("requires a disposition for every discovered legacy reference column", () => {
  const actual = [{ table: "maestro_jobs", column: "client_legacy_record_id" }];
  assert.deepEqual(validateRelationalReferenceContracts(actual, []), [
    "maestro_jobs.client_legacy_record_id:relational_reference_contract_missing",
  ]);
});

test("rejects stale, duplicate, or incomplete reference contracts", () => {
  const contracts = [
    contract("maestro_jobs", "client_legacy_record_id"),
    contract("maestro_jobs", "client_legacy_record_id"),
    { table: "maestro_jobs", column: "old_ref", disposition: "unknown", target: "", rationale: "" },
  ];
  assert.deepEqual(validateRelationalReferenceContracts([], contracts), [
    "maestro_jobs.client_legacy_record_id:stale_relational_reference_contract",
    "maestro_jobs.old_ref:stale_relational_reference_contract",
    "maestro_jobs.client_legacy_record_id:duplicate_relational_reference_contract",
    "maestro_jobs.old_ref:incomplete_or_invalid_relational_reference_contract",
  ]);
});

test("accepts complete contracts for enforced relations and audit snapshots", () => {
  const actual = [
    { table: "maestro_jobs", column: "client_legacy_record_id" },
    { table: "maestro_job_history", column: "collaborator_legacy_id" },
  ];
  const contracts = [
    contract("maestro_jobs", "client_legacy_record_id", "tenant_fk_enforced"),
    contract("maestro_job_history", "collaborator_legacy_id", "audit_snapshot"),
  ];
  assert.deepEqual(validateRelationalReferenceContracts(actual, contracts), []);
});

test("requires validated tenant-composite foreign keys for FK contract dispositions", () => {
  const expected = [{
    table: "maestro_agenda_events", column: "client_legacy_record_id",
    target_table: "maestro_clients", target_column: "legacy_record_id",
  }];
  assert.deepEqual(validateTenantForeignKeyContracts(expected, []), [
    "maestro_agenda_events.client_legacy_record_id->maestro_clients.legacy_record_id:tenant_fk_missing_or_unvalidated",
  ]);
  assert.deepEqual(validateTenantForeignKeyContracts(expected, [{ ...expected[0], validated: true }]), []);
});
