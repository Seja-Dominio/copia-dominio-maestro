const MAX_FINANCIAL_BULK_SIZE = 200;

function asOptionalText(value) {
  return value == null || value === "" ? null : String(value);
}

function normalizeEntries(data, makeId = () => crypto.randomUUID().replaceAll("-", "")) {
  if (!Array.isArray(data) || data.length === 0 || data.length > MAX_FINANCIAL_BULK_SIZE) {
    throw new Error(`Envie de 1 a ${MAX_FINANCIAL_BULK_SIZE} lançamentos por vez`);
  }

  const ids = new Set();
  return data.map((entry) => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
      throw new Error("Cada lançamento precisa ser um objeto válido");
    }
    const id = String(entry.id || makeId());
    if (ids.has(id)) throw new Error("Há lançamentos com identificadores repetidos");
    ids.add(id);
    return { ...entry, id };
  });
}

function toLegacyRows(entries, organizationId, now) {
  return entries.map((payload) => ({
    entity: "FinancialEntry",
    record_id: payload.id,
    organization_id: organizationId,
    payload,
    source_created_at: now,
    source_updated_at: now,
  }));
}

function toRelationalRows(entries, organizationId, now) {
  return entries.map((payload) => {
    const rawAmount = payload.amount;
    const amount = rawAmount == null || rawAmount === "" ? null : Number(String(rawAmount).replace(",", "."));
    if (amount !== null && !Number.isFinite(amount)) throw new Error("O valor de um lançamento é inválido");

    return {
      organization_id: organizationId,
      legacy_record_id: payload.id,
      client_legacy_record_id: asOptionalText(payload.client_id),
      cost_center_legacy_record_id: asOptionalText(payload.cost_center_legacy_record_id || payload.cost_center),
      category_legacy_record_id: asOptionalText(payload.category_legacy_record_id || payload.category),
      bank_account_legacy_record_id: asOptionalText(payload.bank_account_legacy_record_id || payload.bank_account_id),
      type: asOptionalText(payload.type),
      title: String(payload.title || "Lançamento sem título"),
      amount,
      status: asOptionalText(payload.status),
      category: asOptionalText(payload.category),
      subcategory_id: asOptionalText(payload.subcategory_id),
      subcategory_name: asOptionalText(payload.subcategory_name),
      cost_center: asOptionalText(payload.cost_center),
      bank_account_id: asOptionalText(payload.bank_account_id),
      bank_account_name: asOptionalText(payload.bank_account_name),
      due_date: asOptionalText(payload.due_date),
      competence_date: asOptionalText(payload.competence_date),
      billing_date: asOptionalText(payload.billing_date),
      payment_date: asOptionalText(payload.payment_date),
      notes: asOptionalText(payload.notes),
      source_payload: payload,
      updated_at: now,
    };
  });
}

export { MAX_FINANCIAL_BULK_SIZE, normalizeEntries, toLegacyRows, toRelationalRows };
