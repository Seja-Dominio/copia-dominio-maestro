import { supabase } from "@/api/supabaseClient";

const table = () => supabase?.schema("migration").from("base44_records");

function matches(payload, query = {}) {
  return Object.entries(query).every(([key, expected]) => {
    if (expected && typeof expected === "object") {
      if ("$in" in expected) return expected.$in.includes(payload?.[key]);
      if ("$ne" in expected) return payload?.[key] !== expected.$ne;
      return true;
    }
    return payload?.[key] === expected;
  });
}

function sortRows(rows, sort) {
  if (!sort) return rows;
  const descending = sort.startsWith("-");
  const field = descending ? sort.slice(1) : sort;
  return [...rows].sort((a, b) => {
    const av = a?.[field] ?? "";
    const bv = b?.[field] ?? "";
    const result = String(av).localeCompare(String(bv), undefined, { numeric: true });
    return descending ? -result : result;
  });
}

async function readEntity(entityName, query, sort, limit) {
  if (!supabase) throw new Error("Supabase não está configurado.");
  const { data, error } = await table().select("entity_name,source_id,payload").eq("entity_name", entityName).limit(10000);
  if (error) throw error;
  const rows = (data || []).map(row => ({ ...row.payload, id: row.source_id }));
  return sortRows(rows.filter(row => matches(row, query)), sort).slice(0, limit || 50);
}

function entity(entityName) {
  return {
    async list(sort, limit) { return readEntity(entityName, {}, sort, limit); },
    async filter(query, sort, limit) { return readEntity(entityName, query, sort, limit); },
    async get(id) {
      const { data, error } = await table().select("source_id,payload").eq("entity_name", entityName).eq("source_id", String(id)).maybeSingle();
      if (error) throw error;
      return data ? { ...data.payload, id: data.source_id } : null;
    },
    async update(id, changes) {
      const current = await this.get(id);
      if (!current) throw new Error(`${entityName} ${id} não encontrado.`);
      const payload = { ...current, ...changes, id: undefined };
      delete payload.id;
      const { data, error } = await table().update({ payload, imported_at: new Date().toISOString() }).eq("entity_name", entityName).eq("source_id", String(id)).select("source_id,payload").single();
      if (error) throw error;
      return { ...data.payload, id: data.source_id };
    },
    async delete(id) {
      const { error } = await table().delete().eq("entity_name", entityName).eq("source_id", String(id));
      if (error) throw error;
    },
    async create(record) {
      const { id, ...payload } = record;
      const { data, error } = await table().insert({ entity_name: entityName, source_id: String(id || crypto.randomUUID()), payload, payload_hash: "adapter" }).select("source_id,payload").single();
      if (error) throw error;
      return { ...data.payload, id: data.source_id };
    },
  };
}

export function createSupabaseEntities() {
  return new Proxy({}, { get: (_, name) => entity(name) });
}
