import test from "node:test";
import assert from "node:assert/strict";
import { buildRelationalParityCoverageSql, relationalParityEntityCount } from "./relational-parity-coverage.mjs";

test("builds bidirectional ID coverage for every relational parity entity", () => {
  const sql = buildRelationalParityCoverageSql();
  assert.equal(relationalParityEntityCount, 34);
  assert.equal((sql.match(/ as missing_relational/g) || []).length, relationalParityEntityCount);
  assert.equal((sql.match(/ as missing_legacy/g) || []).length, relationalParityEntityCount);
  assert.match(sql, /not exists \(select 1 from public\.maestro_clients r\s+where r\.organization_id = l\.organization_id\s+and r\.legacy_record_id = l\.record_id\)/);
  assert.match(sql, /not exists \(select 1 from public\.legacy_records l\s+where l\.entity = 'Client'\s+and l\.organization_id = r\.organization_id\s+and l\.record_id = r\.legacy_record_id\)/);
});

test("uses the AI query-log primary ID and keeps job comments scoped to job records", () => {
  const sql = buildRelationalParityCoverageSql();
  assert.match(sql, /public\.maestro_ai_query_logs r\s+where r\.organization_id = l\.organization_id\s+and r\.id = l\.record_id/);
  assert.match(sql, /l\.entity = 'AIQueryLog'\s+and l\.organization_id = r\.organization_id\s+and l\.record_id = r\.id/);
  assert.match(sql, /l\.entity = 'Comment' and coalesce\(l\.payload->>'entity_type', 'job'\) = 'job'/);
});

test("supports the cutover registry subset with validated identifiers", () => {
  const sql = buildRelationalParityCoverageSql([
    { entity: "Client", table: "maestro_clients" },
  ]);
  assert.equal((sql.match(/ as missing_relational/g) || []).length, 1);
  assert.match(sql, /public\.maestro_clients r\s+where r\.organization_id = l\.organization_id\s+and r\.legacy_record_id = l\.record_id/);
  assert.throws(() => buildRelationalParityCoverageSql([
    { entity: "Client", table: "maestro_clients; drop table legacy_records" },
  ]), /Unsafe relational parity identifier/);
});
