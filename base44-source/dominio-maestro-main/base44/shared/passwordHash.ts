// Shared password hashing using SHA-256 + salt

export async function hashPassword(password) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const saltHex = Array.from(salt).map(b => b.toString(16).padStart(2, "0")).join("");
  const data = new TextEncoder().encode(saltHex + password);
  const hashBuf = await crypto.subtle.digest("SHA-256", data);
  const hashHex = Array.from(new Uint8Array(hashBuf)).map(b => b.toString(16).padStart(2, "0")).join("");
  return saltHex + ":" + hashHex;
}

export async function verifyPassword(password, storedHash) {
  // Support legacy plaintext passwords (no ":" separator)
  if (!storedHash.includes(":")) {
    return storedHash === password;
  }
  const [saltHex, expectedHash] = storedHash.split(":");
  const data = new TextEncoder().encode(saltHex + password);
  const hashBuf = await crypto.subtle.digest("SHA-256", data);
  const hashHex = Array.from(new Uint8Array(hashBuf)).map(b => b.toString(16).padStart(2, "0")).join("");
  return hashHex === expectedHash;
}