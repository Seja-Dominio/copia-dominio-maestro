/**
 * Access control helpers for the 3-level permission system:
 * - master: full access
 * - gestor: access to operational management, without financial or destructive settings actions
 * - collaborator: basic user
 */

export function getAccessLevel(collaborator) {
  if (!collaborator) return "collaborator";
  const level = String(collaborator.access_level || "collaborator").toLowerCase();
  // Normalize old records without exposing a fourth access level in the UI.
  return level === "admin" ? "master" : level;
}

export function isMaster(collaborator) {
  return getAccessLevel(collaborator) === "master";
}

export function isGestor(collaborator) {
  return getAccessLevel(collaborator) === "gestor";
}

export function isAdminLevel(collaborator) {
  const level = getAccessLevel(collaborator);
  return level === "master" || level === "gestor";
}

/**
 * Check if user can access financial pages/data
 */
export function canAccessFinancial(collaborator) {
  return isMaster(collaborator);
}

/**
 * Check if user can delete sensitive entities (clients, projects, collaborators)
 */
export function canDeleteEntities(collaborator) {
  return isMaster(collaborator);
}

/**
 * Check if user can download system exports (.md reports, blueprint)
 */
export function canExportSystem(collaborator) {
  return isMaster(collaborator);
}

/**
 * Check if gestor needs to request master approval for an action
 */
export function needsMasterApproval(collaborator) {
  return isGestor(collaborator);
}
