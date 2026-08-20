import { useState, useEffect, useMemo } from "react";
import { base44 } from "@/api/base44Client";
import { useSearchParams } from "react-router-dom";
import {
  BarChart3, TrendingUp, Clock, FolderKanban, Briefcase,
  FileText, Film, Radio, Users, ChevronRight
} from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from "recharts";
import PeriodPicker from "@/components/reports/PeriodPicker";
import ExportButton from "@/components/reports/ExportButton";
import TimesheetByClientReport from "@/components/reports/TimesheetByClientReport";
import TimesheetByUserReport from "@/components/reports/TimesheetByUserReport";
import TimesheetFullReport from "@/components/reports/TimesheetFullReport";
import DREReport from "@/components/reports/DREReport";
import EntriesReport from "@/components/reports/EntriesReport";
import AccountsReport from "@/components/reports/AccountsReport";
import FeeContractsReport from "@/components/reports/FeeContractsReport";
import CostCenterReport from "@/components/reports/CostCenterReport";
import CashFlowReport from "@/components/reports/CashFlowReport";
import BillingReport from "@/components/reports/BillingReport";
import ClientProfitabilityReport from "@/components/reports/ClientProfitabilityReport";
import ClientCostReport from "@/components/reports/ClientCostReport";
import ProductivityDailyReport from "@/components/reports/ProductivityDailyReport";
import ActivityVolumeChart from "@/components/agenda/ActivityVolumeChart";
import ClientKeyActivities from "@/components/agenda/ClientKeyActivities";
import { DEFAULT_ACTIVITY_CONFIG } from "@/pages/Agenda";
import { nowManaus, todayStr as getTodayStr } from "@/lib/dateUtils";

const SECTIONS = [
  { id: "productivity", label: "Produtividade", icon: Users },
  { id: "financial", label: "Financeiro", icon: TrendingUp },
  { id: "timesheet", label: "Timesheet", icon: Clock },
  { id: "projects", label: "Projetos", icon: FolderKanban },
  { id: "jobs", label: "Jobs", icon: Briefcase },
  { id: "proposals", label: "Propostas Comerciais", icon: FileText },
  { id: "contracts", label: "Contratos de Fee", icon: FileText },
  { id: "production", label: "Produção", icon: Film },
  { id: "media", label: "Mídia", icon: Radio },
  { id: "records", label: "Cadastros", icon: Users },
  { id: "agenda", label: "Agenda", icon: BarChart3 },
];

const REPORTS = {
  productivity: [
    { id: "daily", name: "Resumo Diário", description: "Jobs criados, timesheets, mudanças de status e clientes atendidos por colaborador" },
  ],
  financial: [
    { id: "cashflow", name: "Fluxo de Caixa", description: "Entradas, saídas e saldo acumulado mês a mês" },
    { id: "dre", name: "DRE — Demonstrativo", description: "Receitas e despesas por competência com margem" },
    { id: "entries", name: "Lançamentos", description: "Receitas e despesas com comparativo previsto vs. realizado" },
    { id: "accounts", name: "Contas", description: "Saldo, realizado e previsto por conta bancária" },
    { id: "cost_center", name: "Centro de Custos", description: "Análise completa com gráficos pizza/barras, orçado vs realizado e desvios" },
    { id: "billing", name: "Faturamento", description: "Receitas por cliente, categoria e período com gráficos" },
    { id: "profitability", name: "Rentabilidade por Cliente", description: "Receita, custo (direto + hora) e margem por cliente" },
    { id: "client_cost", name: "Custo por Cliente", description: "Despesas diretas e custo de hora por cliente" },
  ],
  timesheet: [
    { id: "by_client", name: "Apontamentos por Cliente", description: "Horas, custo e retrabalho por cliente e colaborador" },
    { id: "by_user", name: "Apontamentos por Usuário", description: "Tempo total e custo por colaborador em cada cliente" },
    { id: "full", name: "Timesheet Completo", description: "Histórico detalhado por cliente com jobs, datas e retrabalho" },
  ],
  projects: [
    { id: "board", name: "Pauta de Projetos", description: "Todos os documentos do projeto com informações principais" },
  ],
  jobs: [
    { id: "board", name: "Pauta de Jobs", description: "Volume de jobs com status, subtarefas e envolvidos" },
  ],
  proposals: [
    { id: "billing", name: "Faturamento", description: "Lançamentos gerados por proposta aprovada" },
    { id: "board", name: "Pauta", description: "Propostas por período com análise de fechamentos" },
  ],
  contracts: [
    { id: "expiry", name: "Próximos Vencimentos", description: "Contratos de fee por data de vencimento com alertas de renovação" },
    { id: "hours_professional", name: "Horas por Profissional", description: "Horas contratadas vs. consumidas por profissional" },
    { id: "hours_project", name: "Horas por Projeto", description: "Horas alocadas por projeto" },
    { id: "summary", name: "Resumo do Contrato", description: "Visão geral de todos os contratos de fee ativos" },
  ],
  production: [
    { id: "billing", name: "Faturamento", description: "Lançamentos de produção por cliente e fornecedor" },
    { id: "board", name: "Pauta", description: "Documentos de produção com comissões" },
  ],
  media: [
    { id: "campaigns", name: "Campanhas", description: "Relatório de campanhas de mídia paga" },
    { id: "vehicles", name: "Veículos", description: "Investimento por veículo de mídia" },
  ],
  records: [
    { id: "clients", name: "Clientes", description: "Lista completa de clientes com dados principais" },
    { id: "collaborators", name: "Colaboradores", description: "Colaboradores ativos com cargos e departamentos" },
    { id: "suppliers", name: "Fornecedores", description: "Fornecedores cadastrados com dados de contato" },
  ],
  agenda: [
    { id: "volume", name: "Volume por Atividade", description: "Distribuição de eventos por tipo de atividade" },
    { id: "client_activities", name: "Atividades por Cliente", description: "Atividades-chave organizadas por cliente" },
  ],
};

const CHART_COLORS = ["hsl(var(--primary))", "#22c55e", "#ef4444", "#f59e0b", "#8b5cf6", "#06b6d4"];

function CashFlowChart({ entries, period }) {
  const months = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
  const data = months.map((m, i) => {
    const monthStr = String(i + 1).padStart(2, "0");
    const filtered = period
      ? entries.filter(e => { const d = e.due_date || e.competence_date; return d && d >= period.start && d <= period.end; })
      : entries;
    const rev = filtered.filter(e => e.type === "revenue" && e.due_date?.includes(`-${monthStr}-`)).reduce((s, e) => s + (e.amount || 0), 0);
    const exp = filtered.filter(e => e.type === "expense" && e.due_date?.includes(`-${monthStr}-`)).reduce((s, e) => s + (e.amount || 0), 0);
    return { month: m, receita: rev, despesa: exp, lucro: rev - exp };
  });
  return (
    <ResponsiveContainer width="100%" height={280}>
      <BarChart data={data} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
        <XAxis dataKey="month" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} />
        <YAxis tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} tickFormatter={v => `${(v/1000).toFixed(0)}k`} />
        <Tooltip formatter={(v) => `R$ ${v.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`} />
        <Bar dataKey="receita" fill="#22c55e" radius={[4, 4, 0, 0]} name="Receita" />
        <Bar dataKey="despesa" fill="#ef4444" radius={[4, 4, 0, 0]} name="Despesa" />
      </BarChart>
    </ResponsiveContainer>
  );
}

export default function Reports() {
  const [searchParams] = useSearchParams();
  const sessionCollaborator = (() => { try { return JSON.parse(sessionStorage.getItem("collaborator") || "null"); } catch { return null; } })();
  const isAdmin = sessionCollaborator?.access_level === "admin";
  const initialSection = searchParams.get("section") || "productivity";
  const [section, setSection] = useState(initialSection);
  const [activeReport, setActiveReport] = useState(
    initialSection === "timesheet" ? "by_user" : initialSection === "productivity" ? "daily" : "cashflow"
  );
  const [period, setPeriod] = useState(null);
  const selectedUserId = searchParams.get("user");

  const [entries, setEntries] = useState([]);
  const [accounts, setAccounts] = useState([]);
  const [jobs, setJobs] = useState([]);
  const [timesheets, setTimesheets] = useState([]);
  const [collaborators, setCollaborators] = useState([]);
  const [clients, setClients] = useState([]);
  const [agendaEvents, setAgendaEvents] = useState([]);
  const [loading, setLoading] = useState(false);
  const [loadedSections, setLoadedSections] = useState(new Set());

  // Lazy load por seção
  useEffect(() => {
    if (loadedSections.has(section)) return;
    setLoading(true);

    const fetches = [];

    if (section === "productivity") {
      // ProductivityDailyReport loads its own data internally
      setLoadedSections(prev => new Set([...prev, section]));
      setLoading(false);
      return;
    }

    if (section === "financial") {
      fetches.push(
        base44.entities.FinancialEntry.list("-due_date", 500).then(e => setEntries(e)),
        base44.entities.BankAccount.list().then(a => setAccounts(a)),
        timesheets.length === 0 ? base44.entities.Timesheet.list("-created_date", 1000).then(ts => setTimesheets(ts.filter(t => !t.is_running))) : Promise.resolve(),
        collaborators.length === 0 ? base44.entities.Collaborator.list("name", 100).then(col => setCollaborators(col)) : Promise.resolve(),
      );
    }
    if (section === "timesheet") {
      fetches.push(
        base44.entities.Timesheet.list("-created_date", 1000).then(ts => setTimesheets(ts.filter(t => !t.is_running))),
        collaborators.length === 0 ? base44.entities.Collaborator.list("name", 100).then(col => setCollaborators(col)) : Promise.resolve(),
      );
    }
    if (section === "jobs") {
      fetches.push(
        base44.entities.Job.list("-created_date", 200).then(j => setJobs(j)),
      );
    }
    if (section === "agenda") {
      fetches.push(
        base44.entities.AgendaEvent.list("-date", 300).then(ev => setAgendaEvents(ev)),
        clients.length === 0 ? base44.entities.Client.filter({ status: "active" }, "name", 200).then(cl => setClients(cl)) : Promise.resolve(),
      );
    }
    if (section === "contracts" || section === "records") {
      fetches.push(
        base44.entities.Client.filter({ status: "active" }, "name", 200).then(cl => setClients(cl)),
        collaborators.length === 0 ? base44.entities.Collaborator.list("name", 100).then(col => setCollaborators(col)) : Promise.resolve(),
      );
    }

    Promise.all(fetches).then(() => {
      setLoadedSections(prev => new Set([...prev, section]));
      setLoading(false);
    });
  }, [section]);

  const filteredTimesheets = useMemo(() => {
    if (!period) return timesheets;
    return timesheets.filter(t => {
      const d = t.started_at ? t.started_at.slice(0, 10) : null;
      return d && d >= period.start && d <= period.end;
    });
  }, [timesheets, period]);

  const getQuickPeriod = (type) => {
    const today = nowManaus();
    const dayOfWeek = today.getDay();
    if (type === "today") {
      const ts = getTodayStr();
      return { start: ts, end: ts };
    }
    if (type === "week") {
      const startOfWeek = new Date(today);
      startOfWeek.setDate(today.getDate() - dayOfWeek);
      const endOfWeek = new Date(startOfWeek);
      endOfWeek.setDate(startOfWeek.getDate() + 6);
      const fmt = d => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
      return { start: fmt(startOfWeek), end: fmt(endOfWeek) };
    }
    return null;
  };

  const jobsByStatus = Object.entries(
    jobs.reduce((acc, j) => { acc[j.status] = (acc[j.status] || 0) + 1; return acc; }, {})
  ).map(([name, value]) => ({ name, value }));

  const statusLabels = {
    pending_briefing: "Pend. Briefing", pending_capture: "Pend. Captação",
    pending_design: "Pend. Designer", pending_edit: "Pend. Edição",
    internal_approval: "Aprov. Interna", client_approval: "Aprov. Cliente",
    scheduled: "Agendado", completed: "Concluído",
  };

  // Export data builders
  function getExportData() {
    if (section === "timesheet") {
      const rows = filteredTimesheets.map(t => ({
        "Data": t.started_at ? t.started_at.slice(0, 10) : "",
        "Colaborador": t.collaborator_name || "",
        "Cliente": t.client_name || "",
        "Job": t.job_title || "",
        "Duração (min)": t.duration_minutes || 0,
        "Duração (h)": ((t.duration_minutes || 0) / 60).toFixed(2),
        "Retrabalho": t.is_rework ? "Sim" : "Não",
        "Status": t.status || "",
      }));
      return [{ name: "Timesheet", rows }];
    }
    if (section === "financial") {
      if (activeReport === "entries") {
        const filtered = period
          ? entries.filter(e => { const d = e.due_date || e.competence_date; return d && d >= period.start && d <= period.end; })
          : entries;
        return [{ name: "Lançamentos", rows: filtered.map(e => ({
          "Tipo": e.type, "Título": e.title, "Categoria": e.category || "",
          "Cliente": e.client_name || "", "Vencimento": e.due_date || "", "Status": e.status,
          "Valor": e.amount || 0,
        })) }];
      }
      if (activeReport === "accounts") {
        return [{ name: "Contas", rows: accounts.map(a => ({
          "Conta": a.name, "Banco": a.bank_name || "", "Tipo": a.account_type, "Saldo": a.balance || 0,
        })) }];
      }
    }
    return [{ name: "Dados", rows: [] }];
  }

  const reportLabel = SECTIONS.find(s => s.id === section)?.label + " — " + (REPORTS[section]?.find(r => r.id === activeReport)?.name || "");

  return (
    <div className="flex h-[calc(100vh-7rem)]">
      {/* Sidebar */}
      <div className="w-56 border-r border-border bg-card flex-shrink-0 overflow-y-auto">
        <div className="p-4">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">Módulos</p>
          <nav className="space-y-0.5">
            {SECTIONS.map(s => (
              <button
                key={s.id}
                onClick={() => { setSection(s.id); setActiveReport(REPORTS[s.id]?.[0]?.id || ""); }}
                className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium transition-all text-left ${
                  section === s.id
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:text-foreground hover:bg-muted"
                }`}
              >
                <s.icon className="w-4 h-4 flex-shrink-0" />
                <span className="truncate">{s.label}</span>
              </button>
            ))}
          </nav>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto p-6">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-bold text-foreground">
              {SECTIONS.find(s => s.id === section)?.label}
            </h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              {REPORTS[section]?.find(r => r.id === activeReport)?.description || "Selecione um relatório para visualizar"}
            </p>
          </div>
          <div className="flex gap-2 flex-wrap">
            {section === "timesheet" && (
              <>
                <button
                  onClick={() => setPeriod(getQuickPeriod("today"))}
                  className={`px-3 py-2 rounded-lg text-xs font-medium transition-all ${
                    period?.start === getTodayStr() && period?.end === period?.start
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted text-muted-foreground hover:bg-muted/80"
                  }`}
                >
                  Hoje
                </button>
                <button
                  onClick={() => setPeriod(getQuickPeriod("week"))}
                  className={`px-3 py-2 rounded-lg text-xs font-medium transition-all ${
                    period?.start === getQuickPeriod("week").start
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted text-muted-foreground hover:bg-muted/80"
                  }`}
                >
                  Essa semana
                </button>
              </>
            )}
            <PeriodPicker value={period} onChange={setPeriod} />
            <ExportButton getData={getExportData} filename={reportLabel} period={period} />
          </div>
        </div>

        {/* Report list */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 mb-8">
          {(REPORTS[section] || []).map(r => (
            <button
              key={r.id}
              onClick={() => setActiveReport(r.id)}
              className={`glass-card p-4 text-left hover:shadow-md transition-all ${
                activeReport === r.id ? "ring-2 ring-primary" : ""
              }`}
            >
              <div className="flex items-start justify-between">
                <div>
                  <p className="font-semibold text-foreground text-sm">{r.name}</p>
                  <p className="text-xs text-muted-foreground mt-1 leading-relaxed">{r.description}</p>
                </div>
                <ChevronRight className={`w-4 h-4 mt-0.5 flex-shrink-0 ${activeReport === r.id ? "text-primary" : "text-muted-foreground"}`} />
              </div>
            </button>
          ))}
        </div>

        {/* Report content */}
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="w-7 h-7 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          </div>
        ) : (
          <div>
            {/* PRODUCTIVITY */}
            {section === "productivity" && activeReport === "daily" && (
              <ProductivityDailyReport period={period} />
            )}

            {/* FINANCIAL */}
            {section === "financial" && activeReport === "cashflow" && (
              <CashFlowReport entries={entries} accounts={accounts} period={period} />
            )}
            {section === "financial" && activeReport === "dre" && (
              <DREReport entries={entries} period={period} />
            )}
            {section === "financial" && activeReport === "entries" && (
              <EntriesReport entries={entries} period={period} />
            )}
            {section === "financial" && activeReport === "accounts" && (
              <AccountsReport accounts={accounts} entries={entries} period={period} />
            )}
            {section === "financial" && activeReport === "cost_center" && (
              <CostCenterReport entries={entries} period={period} />
            )}
            {section === "financial" && activeReport === "billing" && (
              <BillingReport entries={entries} period={period} />
            )}
            {section === "financial" && activeReport === "profitability" && (
              <ClientProfitabilityReport entries={entries} timesheets={timesheets} collaborators={collaborators} period={period} />
            )}
            {section === "financial" && activeReport === "client_cost" && (
              <ClientCostReport entries={entries} timesheets={timesheets} collaborators={collaborators} period={period} />
            )}

            {/* TIMESHEET */}
            {section === "timesheet" && activeReport === "by_client" && (
              <TimesheetByClientReport timesheets={filteredTimesheets} collaborators={collaborators} />
            )}
            {section === "timesheet" && activeReport === "by_user" && (
              <TimesheetByUserReport timesheets={filteredTimesheets} collaborators={collaborators} selectedUserId={selectedUserId} />
            )}
            {section === "timesheet" && activeReport === "full" && (
              <TimesheetFullReport
                timesheets={filteredTimesheets}
                collaborators={collaborators}
                isAdmin={isAdmin}
                onRefresh={() => {
                  base44.entities.Timesheet.list("-created_date", 1000).then(ts => setTimesheets(ts.filter(t => !t.is_running)));
                }}
              />
            )}

            {/* JOBS */}
            {section === "jobs" && (
              <div className="glass-card p-6">
                <h3 className="font-semibold text-foreground mb-4">Jobs por Status</h3>
                <div className="flex flex-col lg:flex-row items-center gap-8">
                  <ResponsiveContainer width="100%" height={250}>
                    <PieChart>
                      <Pie data={jobsByStatus} cx="50%" cy="50%" outerRadius={100} dataKey="value" nameKey="name"
                        label={({ name, percent }) => `${(percent * 100).toFixed(0)}%`}>
                        {jobsByStatus.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
                      </Pie>
                      <Tooltip formatter={(v, n) => [v, statusLabels[n] || n]} />
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="space-y-2 min-w-[200px]">
                    {jobsByStatus.map((item, i) => (
                      <div key={item.name} className="flex items-center justify-between gap-4">
                        <div className="flex items-center gap-2">
                          <div className="w-3 h-3 rounded-full" style={{ background: CHART_COLORS[i % CHART_COLORS.length] }} />
                          <span className="text-xs text-muted-foreground">{statusLabels[item.name] || item.name}</span>
                        </div>
                        <span className="text-xs font-bold text-foreground">{item.value}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* CONTRACTS */}
            {section === "contracts" && activeReport === "expiry" && (
              <FeeContractsReport entries={entries} clients={clients} period={period} />
            )}

            {/* AGENDA */}
            {section === "agenda" && activeReport === "volume" && (
              <ActivityVolumeChart monthEvents={period ? agendaEvents.filter(e => e.date >= period.start && e.date <= period.end) : agendaEvents} activityConfig={DEFAULT_ACTIVITY_CONFIG} />
            )}
            {section === "agenda" && activeReport === "client_activities" && (
              <ClientKeyActivities monthEvents={period ? agendaEvents.filter(e => e.date >= period.start && e.date <= period.end) : agendaEvents} clients={clients} />
            )}

            {/* OTHER MODULES — placeholder */}
            {!(["financial", "timesheet", "jobs", "productivity", "agenda"].includes(section) || (section === "contracts" && activeReport === "expiry")) && (
              <div className="glass-card p-12 text-center">
                <BarChart3 className="w-10 h-10 text-muted-foreground mx-auto mb-3 opacity-40" />
                <p className="text-muted-foreground font-medium">Relatório em desenvolvimento</p>
                <p className="text-sm text-muted-foreground mt-1">Em breve</p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}