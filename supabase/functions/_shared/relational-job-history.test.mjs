import test from "node:test";
import assert from "node:assert/strict";
import { listRelationalJobHistoryRows } from "./relational-job-history.js";

function createQuery({ data = [], error = null } = {}) {
  const calls = [];
  const query = {
    select: (...args) => { calls.push(["select", ...args]); return query; },
    eq: (...args) => { calls.push(["eq", ...args]); return query; },
    gt: (...args) => { calls.push(["gt", ...args]); return query; },
    gte: (...args) => { calls.push(["gte", ...args]); return query; },
    lt: (...args) => { calls.push(["lt", ...args]); return query; },
    lte: (...args) => { calls.push(["lte", ...args]); return query; },
    in: (...args) => { calls.push(["in", ...args]); return query; },
    not: (...args) => { calls.push(["not", ...args]); return query; },
    is: (...args) => { calls.push(["is", ...args]); return query; },
    filter: (...args) => { calls.push(["filter", ...args]); return query; },
    order: (...args) => { calls.push(["order", ...args]); return query; },
    range: (...args) => { calls.push(["range", ...args]); return query; },
    then: (resolve, reject) => Promise.resolve({ data, error }).then(resolve, reject),
  };
  return { calls, client: { from: (table) => { calls.push(["from", table]); return query; } } };
}

test("JobHistory relational reader requires an explicit tenant before querying", async () => {
  let queried = false;
  const client = { from: () => { queried = true; throw new Error("must not query"); } };
  await assert.rejects(listRelationalJobHistoryRows(client), /Sessão sem organização/);
  assert.equal(queried, false);
});

test("JobHistory relational reader honors a zero-row page without querying", async () => {
  let queried = false;
  const client = { from: () => { queried = true; throw new Error("must not query"); } };
  assert.deepEqual(await listRelationalJobHistoryRows(client, { limit: 0 }, "tenant-a"), []);
  assert.equal(queried, false);
});

test("JobHistory relational reader tenant-scopes, filters, sorts, paginates and maps legacy payload", async () => {
  const { client, calls } = createQuery({ data: [{
    legacy_record_id: "history-1",
    job_legacy_id: "job-1",
    collaborator_legacy_id: "collaborator-1",
    event_type: "change",
    field_name: "status",
    old_value: "Briefing",
    new_value: "Aprovado",
    message: "Status atualizado",
    occurred_at: "2026-10-03T10:00:00.000Z",
    created_at: "2026-10-03T10:00:01.000Z",
    source_payload: { actor_name: "Ana", type: "stale-event-type", preserved: true },
  }] });

  const rows = await listRelationalJobHistoryRows(client, {
    filters: { job_id: "job-1", type: "change" },
    sort: "-created_date",
    offset: 10,
    limit: 20,
  }, "tenant-a");

  assert.equal(calls.some(([method, table]) => method === "from" && table === "maestro_job_history"), true);
  assert.equal(calls.some(([method, column, value]) => method === "eq" && column === "organization_id" && value === "tenant-a"), true);
  assert.equal(calls.some(([method, column, value]) => method === "eq" && column === "job_legacy_id" && value === "job-1"), true);
  assert.equal(calls.some(([method, column, value]) => method === "eq" && column === "event_type" && value === "change"), true);
  assert.equal(calls.some(([method, column, options]) => method === "order" && column === "occurred_at" && options.ascending === false), true);
  assert.equal(calls.some(([method, column, options]) => method === "order" && column === "legacy_record_id" && options.ascending === true), true);
  assert.equal(calls.some(([method, start, end]) => method === "range" && start === 10 && end === 29), true);
  assert.deepEqual(rows[0], {
    entity: "JobHistory",
    record_id: "history-1",
    payload: {
      actor_name: "Ana", type: "change", preserved: true,
      id: "history-1", job_id: "job-1", collaborator_id: "collaborator-1",
      field: "status", old_value: "Briefing", new_value: "Aprovado",
      text: "Status atualizado", created_date: "2026-10-03T10:00:00.000Z",
      updated_date: "2026-10-03T10:00:01.000Z", user: "Ana",
    },
    source_created_at: "2026-10-03T10:00:00.000Z",
    source_updated_at: "2026-10-03T10:00:01.000Z",
  });
});

test("JobHistory relational reader propagates persistence errors", async () => {
  const { client } = createQuery({ error: new Error("database unavailable") });
  await assert.rejects(listRelationalJobHistoryRows(client, {}, "tenant-a"), /database unavailable/);
});
