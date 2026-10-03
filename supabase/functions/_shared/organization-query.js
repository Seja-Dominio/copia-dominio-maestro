export function scopeToOrganization(query, organizationId) {
  const scope = String(organizationId || "").trim();
  if (!scope) throw new Error("organization_id obrigatório para leitura multi-tenant");
  if (!query || typeof query.eq !== "function") throw new TypeError("Consulta Supabase inválida");
  return query.eq("organization_id", scope);
}
