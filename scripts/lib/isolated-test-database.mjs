const forbiddenProjectRefs = new Set([
  "fwpisypiiezjhtqxlmqv", // Produção
  "tqmfuskvllpqmvayjuqu", // Homologação compartilhada
]);

export function getIsolatedTestDatabaseUrl(env = process.env) {
  const connectionString = env.SUPABASE_TEST_DB_URL;
  const expectedProjectRef = env.SUPABASE_TEST_PROJECT_REF;
  if (!connectionString || !expectedProjectRef) {
    throw new Error("Defina SUPABASE_TEST_DB_URL e SUPABASE_TEST_PROJECT_REF para uma branch isolada.");
  }
  if (forbiddenProjectRefs.has(expectedProjectRef)) {
    throw new Error("O verificador bloqueia Produção e Homologação compartilhada; use uma branch de teste isolada.");
  }

  let parsed;
  try {
    parsed = new URL(connectionString);
  } catch {
    throw new Error("SUPABASE_TEST_DB_URL não é uma URL válida.");
  }

  // Disposable local Supabase instances do not encode a remote project ref in
  // the host or pooler username; allow an explicit local sentinel only for loopback URLs.
  if (expectedProjectRef === "maestro-local-verify"
    && ["localhost", "127.0.0.1", "::1"].includes(parsed.hostname)) {
    return connectionString;
  }

  const directHostRef = parsed.hostname.match(/^db\.([a-z0-9]+)\.supabase\.co$/i)?.[1];
  const poolerUserRef = decodeURIComponent(parsed.username).split(".").at(-1);
  const actualProjectRef = directHostRef || poolerUserRef;
  if (actualProjectRef !== expectedProjectRef) {
    throw new Error("A ref declarada em SUPABASE_TEST_PROJECT_REF não corresponde à conexão de teste.");
  }
  return connectionString;
}

export function getIsolatedTestDatabaseSsl(connectionString) {
  const hostname = new URL(connectionString).hostname;
  if (["localhost", "127.0.0.1", "::1"].includes(hostname)) return false;
  return { rejectUnauthorized: false };
}
