const ACTIVE_PRODUCT_STATUSES = new Set(["trial", "enabled"]);

export function hasActiveOrganizationProduct(rows, productKey) {
  return (Array.isArray(rows) ? rows : []).some((row) =>
    String(row?.product_key || "") === productKey
      && ACTIVE_PRODUCT_STATUSES.has(String(row?.status || ""))
  );
}
