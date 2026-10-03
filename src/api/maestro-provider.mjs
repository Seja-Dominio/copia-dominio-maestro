export function resolveMaestroProvider(value) {
  const provider = String(value || "supabase").trim().toLowerCase();
  if (provider !== "supabase") {
    throw new Error(`VITE_MAESTRO_DATA_PROVIDER inválido: ${provider || "(vazio)"}. O Maestro aceita somente supabase.`);
  }
  return provider;
}
