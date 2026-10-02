const SESSION_LIFETIME_SECONDS = 24 * 60 * 60;

export function buildRenewedSessionClaims(session, nowMs = Date.now()) {
  return {
    sub: session.sub,
    access_level: session.access_level,
    exp: Math.floor(nowMs / 1000) + SESSION_LIFETIME_SECONDS,
    ...(session.scope ? { scope: session.scope } : {}),
    ...(session.group_id ? { group_id: session.group_id } : {}),
    ...(session.organization_id ? { organization_id: session.organization_id } : {}),
  };
}
