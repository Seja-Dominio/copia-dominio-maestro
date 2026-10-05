const allowedOrigins = new Set([
  "https://dominiomaestro.com.br",
  "http://localhost:4173",
  "http://127.0.0.1:4173",
  "http://localhost:4174",
  "http://127.0.0.1:4174",
  "http://localhost:4175",
  "http://127.0.0.1:4175",
]);

const fallbackOrigin = "https://dominiomaestro.com.br";

export function buildAdsBrainCorsHeaders(origin = "") {
  return {
    "Access-Control-Allow-Origin": allowedOrigins.has(origin) ? origin : fallbackOrigin,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
  };
}
