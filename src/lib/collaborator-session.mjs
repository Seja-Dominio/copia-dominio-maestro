function decodeBase64UrlJson(value) {
  const standard = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = standard.padEnd(Math.ceil(standard.length / 4) * 4, "=");
  return JSON.parse(atob(padded));
}

// This only checks the locally readable session shape and expiry. The HMAC is
// verified by every protected Edge Function; the browser must never be treated
// as the authority for the signature or organization membership.
export function parseCollaboratorSession(collaboratorJson, token, nowSeconds = Math.floor(Date.now() / 1000)) {
  if (typeof collaboratorJson !== "string" || !collaboratorJson || typeof token !== "string") return null;
  const [body, signature, ...extra] = token.split(".");
  if (!body || !signature || extra.length) return null;

  try {
    const session = decodeBase64UrlJson(body);
    const collaborator = JSON.parse(collaboratorJson);
    if (!session?.sub || !Number.isFinite(Number(session.exp)) || Number(session.exp) <= nowSeconds) return null;
    if (!collaborator?.id || String(collaborator.id) !== String(session.sub)) return null;
    if (session.organization_id && String(collaborator.organization_id || "") !== String(session.organization_id)) return null;
    return collaborator;
  } catch {
    return null;
  }
}
