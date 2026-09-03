// Shared HMAC signing/verification for approval tokens

export async function signToken(payload, secret) {
  const data = JSON.stringify(payload);
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(data));
  const sigHex = Array.from(new Uint8Array(sig)).map(b => b.toString(16).padStart(2, "0")).join("");
  // token = base64(JSON payload) + "." + hex(HMAC signature)
  return btoa(data) + "." + sigHex;
}

export async function verifyToken(token, secret) {
  const parts = token.split(".");
  if (parts.length !== 2) return null;
  const [b64Data, sigHex] = parts;

  let data;
  try { data = atob(b64Data); } catch { return null; }

  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["verify"]
  );

  const sigBytes = new Uint8Array(sigHex.match(/.{2}/g).map(h => parseInt(h, 16)));
  const valid = await crypto.subtle.verify("HMAC", key, sigBytes, new TextEncoder().encode(data));
  if (!valid) return null;

  return JSON.parse(data);
}