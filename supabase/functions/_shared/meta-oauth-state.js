export function createMetaOAuthNonce() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function isMetaOAuthStateBound(state, collaboratorId, organizationId, nowSeconds = Math.floor(Date.now() / 1000)) {
  return Boolean(
    state
    && typeof state === "object"
    && state.sub === collaboratorId
    && state.organization_id === organizationId
    && typeof state.nonce === "string"
    && /^[A-Za-z0-9_-]{43}$/.test(state.nonce)
    && Number.isFinite(Number(state.exp))
    && Number(state.exp) > nowSeconds,
  );
}

export async function hashMetaOAuthNonce(nonce) {
  if (typeof nonce !== "string" || !/^[A-Za-z0-9_-]{43}$/.test(nonce)) {
    throw new Error("Nonce OAuth inválido");
  }
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(nonce));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}
