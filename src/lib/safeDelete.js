import { base44 } from "@/api/base44Client";

/**
 * Safely deletes an entity record by first logging it to DeleteLog for recovery.
 * @param {string} entityType - The entity type key (e.g. "client", "job", "agenda_event")
 * @param {string} entityName - The Base44 entity name (e.g. "Client", "Job", "AgendaEvent")
 * @param {object} entityData - The full entity data object (must include .id)
 * @param {object} [opts] - Optional: { reason, collaboratorId, collaboratorName }
 */
export async function safeDelete(entityType, entityName, entityData, opts = {}) {
  const collab = (() => {
    try { return JSON.parse(sessionStorage.getItem("collaborator") || "null"); } catch { return null; }
  })();

  // Log to DeleteLog for recovery
  await base44.entities.DeleteLog.create({
    entity_type: entityType,
    entity_id: entityData.id,
    entity_data: entityData,
    deleted_by: opts.collaboratorId || collab?.id || "unknown",
    deleted_by_name: opts.collaboratorName || collab?.name || "Sistema",
    deleted_at: new Date().toISOString(),
    reason: opts.reason || "",
    is_restored: false,
  });

  // Actually delete the entity
  await base44.entities[entityName].delete(entityData.id);
}