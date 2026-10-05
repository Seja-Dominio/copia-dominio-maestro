const ACTIVE_PRODUCT_STATUSES = new Set(["trial", "enabled"]);
const PRODUCT_KEYS = new Set(["maestro", "cxm", "ads_brain", "insights"]);
const CLASSIFIED_ENTITY_PRODUCTS = new Map([
  ["AgendaEvent", "maestro"],
  ["AppConfig", "maestro"],
  ["BankAccount", "maestro"],
  ["Client", "maestro"],
  ["Collaborator", "maestro"],
  ["Comment", "maestro"],
  ["CostCenter", "maestro"],
  ["DeleteLog", "maestro"],
  ["FeeContract", "maestro"],
  ["FinancialCategory", "maestro"],
  ["FinancialEntry", "maestro"],
  ["Job", "maestro"],
  ["JobHistory", "maestro"],
  ["JobTemplate", "maestro"],
  ["MasterRequest", "maestro"],
  ["MiniTask", "maestro"],
  ["Note", "maestro"],
  ["Notification", "maestro"],
  ["Project", "maestro"],
  ["ProjectTemplate", "maestro"],
  ["SavingsBox", "maestro"],
  ["SavingsTransaction", "maestro"],
  ["Squad", "maestro"],
  ["Subtask", "maestro"],
  ["Supplier", "maestro"],
  ["Timesheet", "maestro"],
  ["ClientCompetitor", "insights"],
  ["ClientInsight", "insights"],
  ["PostMetric", "insights"],
  ["Proposal", "cxm"],
  ["WhatsappContact", "cxm"],
  ["WhatsappGroup", "cxm"],
  ["WhatsappAutomation", "cxm"],
  ["NpsEntry", "insights"],
  ["NpsHistory", "insights"],
]);

export function knownProductForEntity(entity) {
  return CLASSIFIED_ENTITY_PRODUCTS.get(String(entity || "")) || "";
}

export function hasActiveOrganizationProduct(rows, productKey, nowMs = Date.now()) {
  return (Array.isArray(rows) ? rows : []).some((row) =>
    String(row?.product_key || "") === productKey
      && ACTIVE_PRODUCT_STATUSES.has(String(row?.status || ""))
      && (row?.expires_at == null || (Number.isFinite(Date.parse(row.expires_at)) && Date.parse(row.expires_at) > nowMs))
  );
}

export function entityHasProductClassification(entity, moduleKey) {
  return Boolean(String(moduleKey || "").trim() || knownProductForEntity(entity));
}

export function hasEntityProductAccess(entity, moduleKey, productRows) {
  const configuredProduct = String(moduleKey || "").trim().toLowerCase();
  const canonicalProduct = knownProductForEntity(entity);
  if (configuredProduct && canonicalProduct && configuredProduct !== canonicalProduct) return false;
  const productKey = configuredProduct || canonicalProduct || "";
  if (!productKey) return false;
  return PRODUCT_KEYS.has(productKey) && hasActiveOrganizationProduct(productRows, productKey);
}
