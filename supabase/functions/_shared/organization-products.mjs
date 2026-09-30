const ACTIVE_PRODUCT_STATUSES = new Set(["trial", "enabled"]);
const PRODUCT_KEYS = new Set(["maestro", "cxm", "ads_brain", "insights"]);
const CLASSIFIED_ENTITY_PRODUCTS = new Map([
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

export function hasActiveOrganizationProduct(rows, productKey) {
  return (Array.isArray(rows) ? rows : []).some((row) =>
    String(row?.product_key || "") === productKey
      && ACTIVE_PRODUCT_STATUSES.has(String(row?.status || ""))
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
  if (!productKey) return true;
  if (productKey === "maestro") return true;
  return PRODUCT_KEYS.has(productKey) && hasActiveOrganizationProduct(productRows, productKey);
}
