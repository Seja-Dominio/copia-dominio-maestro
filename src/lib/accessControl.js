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

export const SYSTEM_TAB_PERMISSIONS = [
  { page: "Dashboard", label: "Dashboard" },
  { page: "Projects", label: "Projetos" },
  { page: "Jobs", label: "Jobs" },
  { page: "Proposals", label: "Propostas" },
  { page: "Documentos", label: "Documentos" },
  { page: "Agenda", label: "Agenda" },
  { page: "ClientPortfolio", label: "Carteira" },
  { page: "Financial", label: "Financeiro", restrictedTo: ["gestor", "master"] },
  { page: "Conversations", label: "Conversas" },
  { page: "Instagram", label: "Insights" },
  { page: "Reports", label: "Relatórios" },
  { page: "AdsBrain", label: "Ads Brain" },
];

const DEFAULT_COLLABORATOR_TABS = new Set([
  "Dashboard",
  "Projects",
  "Jobs",
  "Agenda",
  "ClientPortfolio",
  "Conversations",
  "AdsBrain",
]);

function accessLevelFromValue(value) {
  if (typeof value === "string") {
    const level = value.toLowerCase();
    return level === "admin" ? "master" : level;
  }
  return getAccessLevel(value);
}

export function getDefaultTabPermissions(collaboratorOrAccessLevel) {
  const level = accessLevelFromValue(collaboratorOrAccessLevel);
  const isAdmin = level === "master" || level === "gestor";
  return Object.fromEntries(SYSTEM_TAB_PERMISSIONS.map(({ page }) => [
    page,
    page === "Financial"
      ? level === "master"
      : isAdmin || DEFAULT_COLLABORATOR_TABS.has(page),
  ]));
}

export function getTabPermissions(collaborator) {
  const defaults = getDefaultTabPermissions(collaborator);
  const storedTabs = collaborator?.permissions?.tabs;
  if (!storedTabs || typeof storedTabs !== "object" || Array.isArray(storedTabs)) return defaults;

  const level = getAccessLevel(collaborator);
  const canUseFinancial = level === "master" || level === "gestor";
  return Object.fromEntries(SYSTEM_TAB_PERMISSIONS.map(({ page }) => [
    page,
    page === "Financial"
      ? canUseFinancial && storedTabs[page] === true
      : storedTabs[page] === undefined ? defaults[page] : storedTabs[page] === true,
  ]));
}

export function canAccessPage(collaborator, page) {
  const tab = SYSTEM_TAB_PERMISSIONS.find((item) => item.page === page);
  return !tab || getTabPermissions(collaborator)[page] === true;
}

/**
 * Check if user can access financial pages/data
 */
export function canAccessFinancial(collaborator) {
  return canAccessPage(collaborator, "Financial");
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
