import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
const sessionSecret = Deno.env.get("MAESTRO_SESSION_SECRET") || "";
const allowedOrigins = new Set(["http://127.0.0.1:4173", "http://localhost:4173", "https://dominiomaestro.com.br"]);
function corsHeaders(origin = "") {
  return {
  "Access-Control-Allow-Origin": allowedOrigins.has(origin) ? origin : "https://dominiomaestro.com.br",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  };
}
type Session = { sub: string; exp: number };
type Row = { entity: string; record_id: string; payload: Record<string, unknown> };

function decode(value: string) {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
  return atob(padded);
}
function json(body: Record<string, unknown>, status = 200, origin = "") {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders(origin), "Content-Type": "application/json" } });
}
async function authorize(token: string) {
  const [body, signature] = token.split(".");
  if (!body || !signature) return false;
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(sessionSecret), { name: "HMAC", hash: "SHA-256" }, false, ["verify"]);
  const valid = await crypto.subtle.verify("HMAC", key, Uint8Array.from(decode(signature), (c) => c.charCodeAt(0)), new TextEncoder().encode(body));
  if (!valid) return false;
  let session: Session;
  try { session = JSON.parse(decode(body)) as Session; } catch { return false; }
  if (!session.sub || !session.exp || session.exp < Math.floor(Date.now() / 1000)) return false;
  const { data } = await supabase.from("maestro_collaborators").select("is_active, profile").eq("id", session.sub).maybeSingle();
  return Boolean(data?.is_active && data.profile?.access_level === "master");
}
async function load(entity: string) {
  const rows: Row[] = [];
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await supabase.from("legacy_records").select("entity, record_id, payload").eq("entity", entity).range(offset, offset + 999);
    if (error) throw error;
    rows.push(...((data || []) as Row[]));
    if (!data || data.length < 1000) break;
  }
  return rows.map((row) => ({ ...row.payload, id: row.record_id }));
}
function safe(value: unknown) {
  return String(value ?? "—").replace(/[|\n]/g, " ");
}
function report(data: Record<string, Record<string, unknown>[]>, today: string) {
  const clients = data.Client || [], projects = data.Project || [], jobs = data.Job || [], subtasks = data.Subtask || [], collaborators = data.Collaborator || [];
  const activeClients = clients.filter((c) => c.status === "active");
  const activeProjects = projects.filter((p) => ["in_progress", "no_status"].includes(String(p.status)));
  const activeJobs = jobs.filter((j) => !["completed", "cancelled"].includes(String(j.status)));
  const overdueJobs = activeJobs.filter((j) => String(j.post_date || "") < today && j.post_date);
  const overdueSubs = subtasks.filter((s) => !s.is_completed && String(s.deadline || "") < today && s.deadline);
  let md = `# 📊 Relatório Geral do Sistema\n> Gerado em: ${new Date().toLocaleString("pt-BR", { timeZone: "America/Manaus" })}\n\n`;
  md += `## Resumo Geral\n\n| Indicador | Quantidade |\n|---|---:|\n| Clientes ativos | ${activeClients.length} |\n| Projetos em andamento | ${activeProjects.length} |\n| Jobs ativos | ${activeJobs.length} |\n| Jobs atrasados | ${overdueJobs.length} |\n| Colaboradores ativos | ${collaborators.filter((c) => c.is_active !== false).length} |\n| Subtarefas atrasadas | ${overdueSubs.length} |\n\n`;
  md += `## Jobs atrasados\n\n| Cliente | Projeto | Job | Status | Data de post | Responsável |\n|---|---|---|---|---|---|\n`;
  overdueJobs.sort((a, b) => String(a.post_date).localeCompare(String(b.post_date))).forEach((j) => {
    md += `| ${safe(j.client_name)} | ${safe(j.project_name)} | ${safe(j.title || j.number)} | ${safe(j.status)} | ${safe(j.post_date)} | ${safe(j.responsible_name)} |\n`;
  });
  md += `\n## Subtarefas atrasadas\n\n| Subtarefa | Prazo | Responsável | Job |\n|---|---|---|---|\n`;
  overdueSubs.slice(0, 100).forEach((s) => { md += `| ${safe(s.title)} | ${safe(s.deadline)} | ${safe(s.responsible_name)} | ${safe(s.job_id)} |\n`; });
  md += `\n## Colaboradores\n\n| Nome | Cargo | Acesso | Ativo |\n|---|---|---|---|\n`;
  collaborators.filter((c) => c.is_active !== false).forEach((c) => { md += `| ${safe(c.name)} | ${safe(c.role)} | ${safe(c.access_level)} | Sim |\n`; });
  return md + `\n_Fim do relatório._\n`;
}
function blueprint(data: Record<string, Record<string, unknown>[]>, today: string) {
  let md = `# 🏗️ DOMÍNIO MAESTRO — Blueprint de Migração\n> Gerado em: ${new Date().toLocaleString("pt-BR", { timeZone: "America/Manaus" })}\n\n`;
  md += `## Plataforma atual\n\n- Frontend: React + Vite\n- Dados: Supabase, tabela de compatibilidade legacy_records\n- Autenticação: sessão HMAC de colaboradores\n- Fuso horário: America/Manaus\n- Base44: mantido como fallback durante a transição\n\n## Entidades migradas\n\n| Entidade | Registros | Campos de amostra |\n|---|---:|---|\n`;
  Object.entries(data).forEach(([entity, rows]) => {
    const sample = rows.find((row) => entity !== "Collaborator") || rows[0] || {};
    const fields = Object.keys(sample).filter((field) => field !== "password_hash").slice(0, 30);
    md += `| ${entity} | ${rows.length} | ${fields.join(", ")} |\n`;
  });
  md += `\n## Funções migradas nesta etapa\n\n- admin-timesheets: exclusão, limpeza em massa e encerramento de timers\n- system-reports: relatório operacional e blueprint\n\n## Data da geração\n\n${today}\n`;
  return md;
}

Deno.serve(async (request) => {
  const origin = request.headers.get("Origin") || "";
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders(origin) });
  try {
    if (request.method !== "POST") return json({ error: "Método não permitido" }, 405, origin);
    const token = request.headers.get("Authorization")?.replace(/^Bearer\s+/i, "");
    if (!token || !(await authorize(token))) return json({ error: "Acesso administrativo necessário" }, 403, origin);
    const { action } = await request.json();
    const entities = ["Client", "Project", "Job", "Collaborator", "Subtask", "FeeContract", "JobTemplate", "AppConfig", "Squad", "BankAccount", "CostCenter", "Timesheet", "FinancialEntry", "DeleteLog"];
    const rows = await Promise.all(entities.map(async (entity) => [entity, await load(entity)] as const));
    const data = Object.fromEntries(rows);
    const today = new Date().toLocaleDateString("en-CA", { timeZone: "America/Manaus" });
    const isBlueprint = action === "blueprint";
    if (!isBlueprint && action !== "report") return json({ error: "Ação não suportada" }, 400, origin);
    return json({ markdown: isBlueprint ? blueprint(data, today) : report(data, today), filename: `${isBlueprint ? "dominio-maestro-blueprint" : "relatorio-sistema"}-${today}.md` }, 200, origin);
  } catch (error) {
    console.error("System reports error:", error);
    return json({ error: "Erro ao gerar exportação" }, 500, origin);
  }
});
