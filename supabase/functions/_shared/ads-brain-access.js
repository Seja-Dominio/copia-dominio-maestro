const MANAGEMENT_ACTIONS = new Set([
  "start",
  "complete",
  "save",
  "campaign_create",
  "campaign_update",
  "campaign_set_status",
  "remove",
  "update_metrics",
  "update_account",
  "update_card_organization",
  "sync",
]);

export function isGroupAdsBrainSession(session) {
  return session?.scope === "group";
}

export function canManageAdsBrain(profile) {
  const rawLevel = String(profile?.access_level || "collaborator").toLowerCase();
  const accessLevel = rawLevel === "admin" ? "master" : rawLevel;
  return ["master", "gestor"].includes(accessLevel);
}

export function requiresAdsBrainManager(action) {
  return MANAGEMENT_ACTIONS.has(String(action || ""));
}
