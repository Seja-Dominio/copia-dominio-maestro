const JOB_HISTORY_COLUMNS = {
  id: "legacy_record_id",
  job_id: "job_legacy_id",
  collaborator_id: "collaborator_legacy_id",
  type: "event_type",
  field: "field_name",
  old_value: "old_value",
  new_value: "new_value",
  text: "message",
  created_date: "occurred_at",
  updated_date: "created_at",
};
const SAFE_PAYLOAD_FIELD = /^[A-Za-z_][A-Za-z0-9_]*$/;

function normalizePageValue(value, fallback, maximum) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(maximum, Math.max(0, Math.floor(parsed)));
}

export function relationalJobHistoryColumn(field) {
  return JOB_HISTORY_COLUMNS[field] || `source_payload->>${field}`;
}

export function toLegacyJobHistoryRow(row) {
  const sourcePayload = row.source_payload && typeof row.source_payload === "object"
    ? row.source_payload
    : {};
  const payload = { ...sourcePayload, id: row.legacy_record_id };
  const mappedValues = {
    job_id: row.job_legacy_id,
    collaborator_id: row.collaborator_legacy_id,
    type: row.event_type,
    field: row.field_name,
    old_value: row.old_value,
    new_value: row.new_value,
    text: row.message,
    created_date: row.occurred_at,
    updated_date: row.created_at,
    user: sourcePayload.actor_name,
  };

  for (const [field, value] of Object.entries(mappedValues)) {
    if (value !== null && value !== undefined) payload[field] = value;
  }

  return {
    entity: "JobHistory",
    record_id: row.legacy_record_id,
    payload,
    source_created_at: row.occurred_at || null,
    source_updated_at: row.created_at || row.occurred_at || null,
  };
}

export async function listRelationalJobHistoryRows(client, options = {}, organizationId) {
  if (!organizationId) throw new Error("Sessão sem organização para leitura do histórico de jobs");
  const offset = normalizePageValue(options.offset, 0, 1_000_000);
  const limit = normalizePageValue(options.limit, 100, 10_000);
  if (limit === 0) return [];
  const filters = options.filters || {};
  const sort = typeof options.sort === "string" ? options.sort : "";
  const descending = sort ? sort.startsWith("-") : true;
  const sortField = descending ? sort.slice(1) : sort;

  let query = client.from("maestro_job_history")
    .select("legacy_record_id, job_legacy_id, collaborator_legacy_id, event_type, field_name, old_value, new_value, message, occurred_at, created_at, source_payload")
    .eq("organization_id", organizationId);

  for (const [field, expected] of Object.entries(filters)) {
    if (!SAFE_PAYLOAD_FIELD.test(field)) continue;
    const column = relationalJobHistoryColumn(field);
    const isOperator = expected && typeof expected === "object" && !Array.isArray(expected);
    if (isOperator) {
      const operator = expected;
      if (operator.eq !== undefined) query = query.eq(column, String(operator.eq));
      if (operator.gt !== undefined) query = query.gt(column, String(operator.gt));
      if (operator.gte !== undefined) query = query.gte(column, String(operator.gte));
      if (operator.lt !== undefined) query = query.lt(column, String(operator.lt));
      if (operator.lte !== undefined) query = query.lte(column, String(operator.lte));
      if (Array.isArray(operator.in)) query = query.in(column, operator.in.map(String));
      if (Array.isArray(operator.not_in)) {
        query = query.not(column, "in", `(${operator.not_in.map((value) => `"${String(value).replaceAll('"', '\\"')}"`).join(",")})`);
      }
    } else if (expected === null) {
      query = query.is(column, null);
    } else if (Array.isArray(expected)) {
      query = query.filter(`source_payload->${field}`, "eq", JSON.stringify(expected));
    } else {
      query = query.eq(column, String(expected));
    }
  }

  const orderColumn = sortField && SAFE_PAYLOAD_FIELD.test(sortField)
    ? relationalJobHistoryColumn(sortField)
    : "occurred_at";
  const { data, error } = await query
    .order(orderColumn, { ascending: !descending, nullsFirst: false })
    .order("legacy_record_id", { ascending: true })
    .range(offset, Math.max(offset, offset + limit - 1));
  if (error) throw error;
  return (data || []).map(toLegacyJobHistoryRow);
}
