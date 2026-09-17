import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
const sessionSecret = Deno.env.get("MAESTRO_SESSION_SECRET") || "";
const cronSecret = Deno.env.get("DOMINUS_AUDIT_CRON_SECRET") || "";
const APP_TIME_ZONE = "America/Manaus";
const PAGE_SIZE = 1000;
const origins = new Set([
  "http://127.0.0.1:4173", "http://localhost:4173", "http://127.0.0.1:4174", "http://localhost:4174",
  "http://127.0.0.1:4175", "http://localhost:4175", "http://127.0.0.1:5173", "http://localhost:5173",
  "https://dominiomaestro.com.br",
]);

type Session = { sub: string; exp: number; access_level: string; scope?: "user" | "group"; authenticated?: boolean };
type Row = { entity: string; record_id: string; payload: Record<string, any>; source_updated_at?: string | null };
type Finding = {
  category: string;
  severity: "low" | "medium" | "high" | "critical";
  title: string;
  description: string;
  entity?: string;
  record_id?: string;
  evidence: Record<string, unknown>;
  suggested_action: string;
};

function decode(value: string) {
  return atob(value.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(value.length / 4) * 4, "="));
}

function localDate(value = new Date()) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-US", {
    timeZone: APP_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(value).map(part => [part.type, part.value]));
  return `${parts.year}-${parts.month}-${parts.day}`;
}

function safeText(value: unknown, max = 4000) {
  return String(value ?? "").replace(/[\u0000-\u001f]/g, " ").trim().slice(0, max);
}

function corsHeaders(origin: string) {
  return {
    "Access-Control-Allow-Origin": origins.has(origin) ? origin : "https://dominiomaestro.com.br",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-dominus-audit-secret",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  };
}

function json(body: Record<string, unknown>, status: number, origin: string) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(origin), "Content-Type": "application/json" },
  });
}

function isMaster(session: Session | null): session is Session {
  return Boolean(session?.scope === "user" && session.authenticated === true && String(session.access_level).toLowerCase() === "master");
}

async function verifySession(token: string): Promise<Session | null> {
  if (!sessionSecret) return null;
  try {
    const [body, signature] = token.split(".");
    if (!body || !signature) return null;
    const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(sessionSecret), { name: "HMAC", hash: "SHA-256" }, false, ["verify"]);
    const valid = await crypto.subtle.verify("HMAC", key, Uint8Array.from(decode(signature), character => character.charCodeAt(0)), new TextEncoder().encode(body));
    if (!valid) return null;
    const payload = JSON.parse(decode(body)) as Record<string, any>;
    if (!payload.sub || !payload.exp || payload.exp < Math.floor(Date.now() / 1000) || payload.scope !== "user") return null;
    const { data } = await db.from("maestro_collaborators").select("id,is_active,profile").eq("id", payload.sub).maybeSingle();
    if (!data?.is_active) return null;
    return {
      sub: String(data.id),
      exp: Number(payload.exp),
      access_level: String(data.profile?.access_level || payload.access_level || "collaborator").toLowerCase() === "admin" ? "master" : String(data.profile?.access_level || payload.access_level || "collaborator").toLowerCase(),
      scope: "user",
      authenticated: true,
    };
  } catch {
    return null;
  }
}

async function cronAuthorized(request: Request) {
  const supplied = request.headers.get("x-dominus-audit-secret") || "";
  if (!supplied) return false;
  let expected = cronSecret;
  if (!expected) {
    const result = await db.rpc("get_whatsapp_automation_cron_secret");
    expected = String(result.data || "");
  }
  return Boolean(expected && supplied.length === expected.length && supplied === expected);
}

async function loadEntity(entity: string) {
  const rows: Row[] = [];
  for (let offset = 0; ; offset += PAGE_SIZE) {
    const { data, error } = await db
      .from("legacy_records")
      .select("entity,record_id,payload,source_updated_at")
      .eq("entity", entity)
      .order("record_id", { ascending: true })
      .range(offset, offset + PAGE_SIZE - 1);
    if (error) throw error;
    rows.push(...((data || []) as Row[]));
    if (!data || data.length < PAGE_SIZE) break;
  }
  return rows;
}

function isCompletedSubtask(payload: Record<string, any>) {
  return payload.is_completed === true || ["completed", "concluido", "concluída", "done", "finished"].includes(String(payload.status || "").toLowerCase());
}

function isCompletedJob(payload: Record<string, any>) {
  return payload.is_completed === true || ["completed", "concluido", "concluída", "done", "published", "finalizado"].includes(String(payload.status || "").toLowerCase());
}

function isClosedJob(payload: Record<string, any>) {
  return isCompletedJob(payload) || ["cancelled", "canceled", "archived", "arquivado", "cancelado"].includes(String(payload.status || "").toLowerCase());
}

function localDateForValue(value: unknown) {
  const raw = String(value || "");
  if (!raw) return "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? raw.slice(0, 10) : localDate(parsed);
}

function daysLate(value: unknown, today: string) {
  const date = String(value || "").slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || date >= today) return 0;
  return Math.floor((Date.parse(`${today}T12:00:00Z`) - Date.parse(`${date}T12:00:00Z`)) / 86400000);
}

function numberValue(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const parsed = Number(String(value ?? "").replace("%", "").replace(",", ".").trim());
  return Number.isFinite(parsed) ? parsed : null;
}

function addFinding(findings: Finding[], finding: Finding) {
  findings.push({
    ...finding,
    title: safeText(finding.title, 500),
    description: safeText(finding.description, 4000),
    suggested_action: safeText(finding.suggested_action, 2000),
  });
}

function jobLabel(job: Row) {
  return safeText(job.payload.title || job.payload.name || job.payload.number || job.record_id, 180);
}

function auditData(jobs: Row[], subtasks: Row[], projects: Row[], clients: Row[], today: string) {
  const findings: Finding[] = [];
  const jobById = new Map<string, Row>();
  const projectIds = new Set(projects.map(row => row.record_id));
  const clientIds = new Set(clients.map(row => row.record_id));
  const tasksByJob = new Map<string, Row[]>();
  const openTasksByResponsible = new Map<string, { name: string; count: number; jobs: Set<string> }>();
  const overdueJobsByStage = new Map<string, { name: string; count: number; jobs: Set<string> }>();

  for (const job of jobs) {
    jobById.set(job.record_id, job);
    if (job.payload.id) jobById.set(String(job.payload.id), job);
  }
  for (const task of subtasks) {
    const jobId = String(task.payload.job_id || "");
    if (jobId) {
      const list = tasksByJob.get(jobId) || [];
      list.push(task);
      tasksByJob.set(jobId, list);
    }
    if (jobId && !jobById.has(jobId)) {
      addFinding(findings, {
        category: "orphan_data",
        severity: "high",
        title: `Subtask sem Job vinculado: ${safeText(task.payload.title || task.record_id, 160)}`,
        description: "A subtask aponta para um Job que não foi encontrado na base operacional.",
        entity: "Subtask",
        record_id: task.record_id,
        evidence: { subtask_id: task.record_id, job_id: jobId },
        suggested_action: "Verificar o vínculo da subtask antes de contar o atraso ou a entrega.",
      });
    }
  }

  for (const job of jobs) {
    const taskList = tasksByJob.get(job.record_id) || tasksByJob.get(String(job.payload.id || "")) || [];
    const openTasks = taskList.filter(task => !isCompletedSubtask(task.payload));
    const completedTasks = taskList.length - openTasks.length;
    const overdueDays = daysLate(job.payload.post_date, today);
    const jobName = jobLabel(job);
    const clientName = safeText(job.payload.client_name || "Cliente não informado", 140);

    if (isCompletedJob(job.payload) && openTasks.length > 0) {
      addFinding(findings, {
        category: "workflow_inconsistency",
        severity: "high",
        title: `Job concluído com subtarefas abertas: ${jobName}`,
        description: "O status do Job indica conclusão, mas ainda existem subtarefas abertas.",
        entity: "Job",
        record_id: job.record_id,
        evidence: { job_id: job.record_id, open_subtasks: openTasks.length, total_subtasks: taskList.length },
        suggested_action: "Reabrir o Job ou concluir/corrigir as subtarefas pendentes.",
      });
    }

    if (isClosedJob(job.payload)) continue;

    if (!safeText(job.payload.briefing, 20)) {
      addFinding(findings, {
        category: "empty_briefing",
        severity: overdueDays > 0 ? "high" : "medium",
        title: `Briefing vazio: ${jobName}`,
        description: `${clientName} tem um Job ativo sem briefing preenchido. Isso impede uma execução confiável e pode travar a próxima etapa.`,
        entity: "Job",
        record_id: job.record_id,
        evidence: { job_id: job.record_id, client_name: clientName, post_date: safeText(job.payload.post_date, 40), status: safeText(job.payload.status, 60), days_late: overdueDays },
        suggested_action: "Preencher o briefing mínimo antes de avançar o Job.",
      });
    }

    if (taskList.length === 0) {
      addFinding(findings, {
        category: "job_without_subtasks",
        severity: overdueDays > 0 ? "high" : "medium",
        title: `Job sem subtarefas: ${jobName}`,
        description: `${clientName} tem um Job ativo sem subtarefas cadastradas. O fluxo não consegue mostrar responsável, bloqueio ou progresso com segurança.`,
        entity: "Job",
        record_id: job.record_id,
        evidence: { job_id: job.record_id, client_name: clientName, post_date: safeText(job.payload.post_date, 40), status: safeText(job.payload.status, 60), days_late: overdueDays },
        suggested_action: "Criar as subtarefas necessárias ou confirmar que o Job não precisa de decomposição.",
      });
    }

    if (job.payload.project_id && !projectIds.has(String(job.payload.project_id))) {
      addFinding(findings, {
        category: "missing_data",
        severity: "medium",
        title: `Projeto não encontrado para ${jobName}`,
        description: "O Job possui um project_id, mas o projeto correspondente não foi encontrado.",
        entity: "Job",
        record_id: job.record_id,
        evidence: { job_id: job.record_id, project_id: String(job.payload.project_id) },
        suggested_action: "Corrigir o vínculo do Job ou restaurar o projeto referenciado.",
      });
    }
    if (job.payload.client_id && !clientIds.has(String(job.payload.client_id))) {
      addFinding(findings, {
        category: "missing_data",
        severity: "high",
        title: `Cliente não encontrado para ${jobName}`,
        description: "O Job possui um client_id, mas o cliente correspondente não foi encontrado.",
        entity: "Job",
        record_id: job.record_id,
        evidence: { job_id: job.record_id, client_id: String(job.payload.client_id) },
        suggested_action: "Corrigir o vínculo do Job antes de usar prioridade ou indicadores por cliente.",
      });
    }

    if (!isCompletedJob(job.payload) && taskList.length > 0 && openTasks.length === 0) {
      addFinding(findings, {
        category: "workflow_inconsistency",
        severity: overdueDays > 0 ? "high" : "medium",
        title: `Todas as subtarefas concluídas, mas Job aberto: ${jobName}`,
        description: "As subtarefas reais já foram concluídas, mas o Job ainda não foi encerrado.",
        entity: "Job",
        record_id: job.record_id,
        evidence: { job_id: job.record_id, completed_subtasks: completedTasks, status: safeText(job.payload.status, 60), days_late: overdueDays },
        suggested_action: "Validar a publicação e finalizar o Job ou registrar o motivo do bloqueio.",
      });
    }
    if (overdueDays > 0) {
      const stage = safeText(job.payload.stage_title || "Etapa não informada", 120);
      const current = overdueJobsByStage.get(stage) || { name: stage, count: 0, jobs: new Set<string>() };
      current.count += 1;
      current.jobs.add(job.record_id);
      overdueJobsByStage.set(stage, current);
    }

    const reportedTotal = ["subtasks_total", "total_subtasks", "tasks_total", "subtask_count"].map(key => ({ key, value: numberValue(job.payload[key]) })).find(item => item.value !== null);
    if (reportedTotal && reportedTotal.value !== taskList.length) {
      addFinding(findings, {
        category: "indicator_inconsistency",
        severity: "medium",
        title: `Indicador de subtarefas divergente: ${jobName}`,
        description: "O total informado no registro do Job não bate com a quantidade real de subtarefas vinculadas.",
        entity: "Job",
        record_id: job.record_id,
        evidence: { job_id: job.record_id, field: reportedTotal.key, informado: reportedTotal.value, calculado: taskList.length },
        suggested_action: "Recalcular o indicador a partir das subtarefas reais antes de exibir progresso.",
      });
    }
    const reportedCompleted = ["subtasks_completed", "completed_subtasks", "tasks_completed"].map(key => ({ key, value: numberValue(job.payload[key]) })).find(item => item.value !== null);
    if (reportedCompleted && reportedCompleted.value !== completedTasks) {
      addFinding(findings, {
        category: "indicator_inconsistency",
        severity: "medium",
        title: `Indicador de conclusão divergente: ${jobName}`,
        description: "A quantidade de subtarefas concluídas informada no Job não bate com os status das subtarefas.",
        entity: "Job",
        record_id: job.record_id,
        evidence: { job_id: job.record_id, field: reportedCompleted.key, informado: reportedCompleted.value, calculado: completedTasks },
        suggested_action: "Recalcular o indicador usando apenas subtarefas efetivamente concluídas.",
      });
    }
    const reportedProgress = numberValue(job.payload.progress_percent ?? job.payload.progress);
    if (reportedProgress !== null && taskList.length > 0 && reportedProgress >= 0 && reportedProgress <= 100) {
      const calculatedProgress = Math.round((completedTasks / taskList.length) * 100);
      if (Math.abs(reportedProgress - calculatedProgress) > 1) {
        addFinding(findings, {
          category: "indicator_inconsistency",
          severity: "low",
          title: `Progresso divergente: ${jobName}`,
          description: "O percentual informado no Job não bate com o percentual calculado pelas subtarefas.",
          entity: "Job",
          record_id: job.record_id,
          evidence: { job_id: job.record_id, informado: reportedProgress, calculado: calculatedProgress, total_subtasks: taskList.length },
          suggested_action: "Usar a quantidade de subtarefas concluídas como fonte do progresso.",
        });
      }
    }
  }

  for (const task of subtasks) {
    if (isCompletedSubtask(task.payload)) continue;
    const dueDate = String(task.payload.deadline || "").slice(0, 10);
    if (!dueDate || daysLate(dueDate, today) <= 0) continue;
    const responsible = safeText(task.payload.responsible_name || "Sem responsável", 120) || "Sem responsável";
    const current = openTasksByResponsible.get(responsible) || { name: responsible, count: 0, jobs: new Set<string>() };
    current.count += 1;
    if (task.payload.job_id) current.jobs.add(String(task.payload.job_id));
    openTasksByResponsible.set(responsible, current);
  }

  for (const item of openTasksByResponsible.values()) {
    if (item.count < 3) continue;
    addFinding(findings, {
      category: "bottleneck",
      severity: item.count >= 8 ? "critical" : item.count >= 5 ? "high" : "medium",
      title: `Gargalo por responsável: ${item.name}`,
      description: `${item.name} concentra ${item.count} subtarefas vencidas em ${item.jobs.size} Job(s).`,
      entity: "Collaborator",
      evidence: { responsavel: item.name, subtasks_atrasadas: item.count, jobs_afetados: item.jobs.size, job_ids: [...item.jobs].slice(0, 30) },
      suggested_action: "Priorizar a fila vencida, redistribuir subtarefas ou registrar o bloqueio que depende de outra pessoa.",
    });
  }
  for (const item of overdueJobsByStage.values()) {
    if (item.count < 3) continue;
    addFinding(findings, {
      category: "bottleneck",
      severity: item.count >= 8 ? "critical" : item.count >= 5 ? "high" : "medium",
      title: `Gargalo por etapa: ${item.name}`,
      description: `A etapa ${item.name} concentra ${item.count} Jobs com data de postagem vencida.`,
      entity: "Job",
      evidence: { etapa: item.name, jobs_atrasados: item.count, job_ids: [...item.jobs].slice(0, 30) },
      suggested_action: "Revisar capacidade da etapa e ordenar os Jobs por cliente, atraso e dependências abertas.",
    });
  }

  const severityOrder = { critical: 0, high: 1, medium: 2, low: 3 };
  findings.sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity] || a.category.localeCompare(b.category) || a.title.localeCompare(b.title));
  return findings.slice(0, 5000);
}

function candidateFor(category: string, count: number, today: string) {
  const candidates: Record<string, { key: string; rule: string; rationale: string }> = {
    empty_briefing: {
      key: "audit.empty_briefing",
      rule: "Não considerar um Job pronto para produção sem briefing mínimo preenchido; sinalizar a ausência antes de avançar o fluxo.",
      rationale: `A auditoria de ${today} encontrou ${count} Job(s) ativo(s) com briefing vazio. Regra sugerida para validação do Master.`,
    },
    job_without_subtasks: {
      key: "audit.job_without_subtasks",
      rule: "Todo Job ativo deve ter subtarefas suficientes para identificar responsável, dependências e progresso; exceções precisam ser revisadas.",
      rationale: `A auditoria de ${today} encontrou ${count} Job(s) ativo(s) sem subtarefas. Regra sugerida para validação do Master.`,
    },
    workflow_inconsistency: {
      key: "audit.workflow_consistency",
      rule: "Quando todas as subtarefas estiverem concluídas, sinalizar o Job ainda aberto; quando o Job estiver concluído com subtarefas abertas, sinalizar a inconsistência.",
      rationale: `A auditoria de ${today} encontrou ${count} inconsistência(s) entre status de Jobs e subtarefas. Regra sugerida para validação do Master.`,
    },
    indicator_inconsistency: {
      key: "audit.indicator_consistency",
      rule: "Antes de apresentar progresso de um Job, validar os indicadores contra as subtarefas reais vinculadas.",
      rationale: `A auditoria de ${today} encontrou ${count} divergência(s) de indicadores. Regra sugerida para validação do Master.`,
    },
  };
  return candidates[category] || null;
}

async function createLearningCandidates(findings: Finding[], today: string) {
  const counts = new Map<string, number>();
  findings.forEach(finding => counts.set(finding.category, (counts.get(finding.category) || 0) + 1));
  let created = 0;
  for (const [category, count] of counts) {
    const candidate = candidateFor(category, count, today);
    if (!candidate) continue;
    const { data: existing, error: lookupError } = await db.from("dominus_learning_reviews").select("id,status").eq("memory_key", candidate.key).order("created_at", { ascending: false }).limit(1);
    if (lookupError) throw lookupError;
    if (existing?.length) continue;
    const { error } = await db.from("dominus_learning_reviews").insert({
      memory_key: candidate.key,
      status: "pending",
      proposed_rule: candidate.rule,
      rationale: candidate.rationale,
      scope: "agency",
      scope_id: null,
      evidence: [{ category, finding_count: count, audit_date: today }],
      source_refs: [],
      proposed_by: "dominus-audit",
    });
    if (error) throw error;
    created += 1;
  }
  return created;
}

function buildSummary(findings: Finding[], today: string, candidatesCreated: number) {
  const categoryLabels: Record<string, string> = {
    empty_briefing: "briefings vazios",
    job_without_subtasks: "Jobs sem subtarefas",
    workflow_inconsistency: "inconsistências de fluxo",
    indicator_inconsistency: "indicadores divergentes",
    missing_data: "dados ausentes",
    orphan_data: "dados órfãos",
    bottleneck: "gargalos",
    stale_data: "dados desatualizados",
    other: "outros achados",
  };
  const severityLabels: Record<string, string> = { critical: "crítico", high: "alto", medium: "médio", low: "baixo" };
  const counts = new Map<string, number>();
  findings.forEach((finding) => counts.set(finding.category, (counts.get(finding.category) || 0) + 1));
  const overview = [...counts.entries()].map(([category, count]) => `${count} ${categoryLabels[category] || category}`).join(" · ");
  const lines = [
    `📊 *Resumo diário do Dominus — ${today}*`,
    findings.length ? `Foram encontrados *${findings.length} achado(s)*: ${overview}.` : "Nenhum problema operacional foi identificado nesta auditoria.",
  ];
  const priority = findings.filter((finding) => ["critical", "high", "medium"].includes(finding.severity)).slice(0, 8);
  if (priority.length) {
    lines.push("", "*Prioridades:*", ...priority.map((finding) => `• [${severityLabels[finding.severity] || finding.severity}] ${finding.title}`));
  }
  lines.push("", `Candidatos de aprendizado aguardando revisão do Master: *${candidatesCreated}*.`, "Nenhuma regra ou Job foi alterado automaticamente.");
  return {
    text: lines.join("\n"),
    counts: Object.fromEntries(counts),
    critical_count: findings.filter((finding) => finding.severity === "critical").length,
    high_count: findings.filter((finding) => finding.severity === "high").length,
  };
}

async function runAudit(triggeredBy: string) {
  const now = new Date();
  const today = localDate(now);
  const { data: existingRun, error: existingRunError } = await db
    .from("dominus_audit_runs")
    .select("id,status,findings_count,finished_at,created_at")
    .eq("status", "completed")
    .gte("started_at", `${today}T00:00:00-04:00`)
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (existingRunError) throw existingRunError;
  if (existingRun) {
    return {
      run_id: existingRun.id,
      status: "already_completed",
      findings_count: existingRun.findings_count || 0,
      candidates_created: 0,
      generated_at: existingRun.finished_at || existingRun.created_at,
      source: "Maestro",
      timezone: APP_TIME_ZONE,
    };
  }
  const { data: run, error: runError } = await db.from("dominus_audit_runs").insert({
    status: "running",
    period_start: `${today}T00:00:00-04:00`,
    period_end: now.toISOString(),
    triggered_by: triggeredBy,
  }).select("id").single();
  if (runError) throw runError;
  try {
    const [jobs, subtasks, projects, clients] = await Promise.all([
      loadEntity("Job"), loadEntity("Subtask"), loadEntity("Project"), loadEntity("Client"),
    ]);
    const findings = auditData(jobs, subtasks, projects, clients, today);
    for (let offset = 0; offset < findings.length; offset += 100) {
      const chunk = findings.slice(offset, offset + 100).map(finding => ({ ...finding, run_id: run.id }));
      const { error } = await db.from("dominus_audit_findings").insert(chunk);
      if (error) throw error;
    }
    const candidatesCreated = await createLearningCandidates(findings, today);
    const summary = buildSummary(findings, today, candidatesCreated);
    const summaryTimestamp = new Date().toISOString();
    const { error: summaryError } = await db.from("legacy_records").upsert({
      entity: "DominusAuditSummary",
      record_id: `daily:${today}`,
      payload: { date: today, run_id: run.id, findings_count: findings.length, candidates_created: candidatesCreated, ...summary, generated_at: summaryTimestamp },
      source_created_at: summaryTimestamp,
      source_updated_at: summaryTimestamp,
    }, { onConflict: "entity,record_id" });
    if (summaryError) throw summaryError;
    const finishedAt = new Date().toISOString();
    const { error: finishError } = await db.from("dominus_audit_runs").update({ status: "completed", findings_count: findings.length, finished_at: finishedAt }).eq("id", run.id);
    if (finishError) throw finishError;
    return { run_id: run.id, status: "completed", findings_count: findings.length, candidates_created: candidatesCreated, generated_at: finishedAt, summary_text: summary.text, summary: { ...summary, generated_at: finishedAt }, source: "Maestro", timezone: APP_TIME_ZONE };
  } catch (error) {
    await db.from("dominus_audit_runs").update({ status: "failed", error_message: safeText(error instanceof Error ? error.message : error, 4000), finished_at: new Date().toISOString() }).eq("id", run.id);
    throw error;
  }
}

async function listAudits(runId = "") {
  const { data: runs, error: runsError } = await db.from("dominus_audit_runs").select("id,status,period_start,period_end,findings_count,triggered_by,error_message,started_at,finished_at,created_at").order("started_at", { ascending: false }).limit(20);
  if (runsError) throw runsError;
  const selectedRunId = runId || runs?.[0]?.id || "";
  const { data: findings, error: findingsError } = selectedRunId
    ? await db.from("dominus_audit_findings").select("id,run_id,category,severity,status,title,description,entity,record_id,evidence,suggested_action,created_at,updated_at").eq("run_id", selectedRunId).order("created_at", { ascending: false }).limit(500)
    : { data: [], error: null };
  if (findingsError) throw findingsError;
  const severityOrder = { critical: 0, high: 1, medium: 2, low: 3 };
  const orderedFindings = [...(findings || [])].sort((a: any, b: any) => (severityOrder[a.severity as keyof typeof severityOrder] ?? 9) - (severityOrder[b.severity as keyof typeof severityOrder] ?? 9));
  return { runs: runs || [], selected_run_id: selectedRunId, findings: orderedFindings };
}

Deno.serve(async (request) => {
  const origin = request.headers.get("Origin") || "";
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders(origin) });
  try {
    if (request.method !== "POST") return json({ error: "Método não permitido" }, 405, origin);
    const body = await request.json().catch(() => ({})) as Record<string, any>;
    const action = String(body.action || "").trim();
    const cron = await cronAuthorized(request);
    const token = request.headers.get("Authorization")?.replace(/^Bearer\s+/i, "") || "";
    const session = token ? await verifySession(token) : null;
    if (action === "run" && (cron || isMaster(session))) return json(await runAudit(cron ? "cron" : session!.sub), 200, origin);
    if (action === "list" && isMaster(session)) return json(await listAudits(String(body.run_id || "")), 200, origin);
    return json({ error: "Acesso exclusivo para Master autenticado ou execução interna autorizada." }, 403, origin);
  } catch (error) {
    console.error("Dominus audit error:", error);
    return json({ error: error instanceof Error ? error.message : "Não foi possível executar a auditoria do Dominus." }, 500, origin);
  }
});
