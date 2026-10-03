/**
 * Maestro Edge Functions may return legacy-compatible records wrapped in a
 * payload. Flatten them for the entity-shaped rows consumed by the UI.
 */
export function normalizeEntityRows(result) {
  const rows = Array.isArray(result) ? result : (Array.isArray(result?.data) ? result.data : []);
  return rows.map((row) => {
    if (!row || typeof row !== 'object' || !row.payload || typeof row.payload !== 'object') return row;
    return {
      ...row.payload,
      id: row.payload.id || row.record_id,
      created_at: row.source_created_at || row.payload.created_at || undefined,
      created_date: row.payload.created_date || row.source_created_at || undefined,
      updated_date: row.payload.updated_date || row.source_updated_at || undefined,
    };
  });
}
