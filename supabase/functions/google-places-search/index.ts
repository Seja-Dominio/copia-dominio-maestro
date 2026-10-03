import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { loadActiveProspectingManagerSession } from "../_shared/prospecting-authorization.mjs";

const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
const corsHeaders = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type", "Access-Control-Allow-Methods": "POST, OPTIONS" };
const json = (body: Record<string, unknown>, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
const decode = (value: string) => atob(value.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(value.length / 4) * 4, "="));
async function verifySession(token: string) {
  const secret = Deno.env.get("MAESTRO_SESSION_SECRET") || ""; const [body, rawSig] = token.split(".");
  if (!secret || !body || !rawSig) return null;
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["verify"]);
  const valid = await crypto.subtle.verify("HMAC", key, Uint8Array.from(decode(rawSig), (char) => char.charCodeAt(0)), new TextEncoder().encode(body));
  if (!valid) return null; const session = JSON.parse(decode(body)); return session.exp < Math.floor(Date.now() / 1000) ? null : session;
}
Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const claims = await verifySession(request.headers.get("Authorization")?.replace(/^Bearer\s+/i, "") || "");
    const session = claims ? await loadActiveProspectingManagerSession(supabase, claims) : null;
    if (!session) return json({ error: "A prospecção está disponível apenas para Gestor ou Master com vínculo ativo." }, 403);
    const apiKey = Deno.env.get("GOOGLE_MAPS_API_KEY") || ""; if (!apiKey) return json({ error: "A integração com Google Places ainda não foi configurada." }, 503);
    const body = await request.json(); const query = String(body.query || "").trim();
    if (query.length < 3 || query.length > 180) return json({ error: "Informe uma busca entre 3 e 180 caracteres." }, 400);
    const response = await fetch("https://places.googleapis.com/v1/places:searchText", { method: "POST", headers: { "Content-Type": "application/json", "X-Goog-Api-Key": apiKey, "X-Goog-FieldMask": "places.id,places.displayName,places.formattedAddress,places.nationalPhoneNumber,places.websiteUri,places.rating,places.userRatingCount,places.googleMapsUri" }, body: JSON.stringify({ textQuery: query, languageCode: "pt-BR", regionCode: "BR", pageSize: 20 }) });
    const data = await response.json(); if (!response.ok) return json({ error: data?.error?.message || "Não foi possível consultar o Google Places." }, response.status);
    const places = (data.places || []).map((place: Record<string, unknown>) => ({ id: place.id || "", name: (place.displayName as Record<string, string>)?.text || "Empresa sem nome", address: place.formattedAddress || "", phone: place.nationalPhoneNumber || "", website: place.websiteUri || "", rating: place.rating ?? null, reviews: place.userRatingCount ?? null, maps_url: place.googleMapsUri || "" }));
    return json({ places, next_page_token: data.nextPageToken || null });
  } catch (error) { return json({ error: error instanceof Error ? error.message : "Erro inesperado na pesquisa." }, 500); }
});
