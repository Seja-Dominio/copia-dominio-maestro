const allowedOrigins = new Set([
  "https://dominiomaestro.com.br",
  "http://localhost:4173",
  "http://127.0.0.1:4173",
  "http://localhost:4174",
  "http://127.0.0.1:4174",
  "http://localhost:5173",
  "http://127.0.0.1:5173",
]);

const productionOrigin = "https://dominiomaestro.com.br";

export function resolveCoreDataCorsOrigin(origin = "") {
  return allowedOrigins.has(origin) ? origin : productionOrigin;
}
