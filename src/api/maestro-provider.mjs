const SUPPORTED_PROVIDERS = new Set(["supabase", "base44"]);

export function resolveMaestroProvider(value) {
  const provider = String(value || "supabase").trim().toLowerCase();
  if (!SUPPORTED_PROVIDERS.has(provider)) {
    throw new Error(`VITE_MAESTRO_DATA_PROVIDER inválido: ${provider || "(vazio)"}. Use supabase ou base44.`);
  }
  return provider;
}

export function resolveMaestroFunctionFallback(value) {
  return resolveMaestroProvider(value) === "base44" ? "base44" : "unsupported";
}
