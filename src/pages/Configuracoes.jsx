import { useState, useMemo } from "react";
import { Users, LayoutTemplate, Layers, RotateCcw, Calendar, Briefcase, FolderTree, Settings2, History, ShieldCheck } from "lucide-react";
import Records from "./Records";
import Templates from "./Templates";
import JobStatusesConfig from "../components/settings/JobStatusesConfig";
import Recovery from "./Recovery";
import AgendaActivitiesConfig from "../components/settings/AgendaActivitiesConfig";
import RolesConfig from "../components/settings/RolesConfig";
import FinancialCategoriesConfig from "../components/settings/FinancialCategoriesConfig";
import TimezoneConfig from "../components/settings/TimezoneConfig";
import SystemExportPanel from "../components/settings/SystemExportPanel";
import JobAuditLog from "../components/settings/JobAuditLog";
import MasterRequestsPanel from "../components/MasterRequestsPanel";
import { isMaster } from "@/lib/accessControl";

const ALL_TABS = [
  { id: "system",       label: "Sistema",         icon: Settings2 },
  { id: "requests",     label: "Requisições",     icon: ShieldCheck, masterOnly: true },
  { id: "records",      label: "Cadastros",       icon: Users },
  { id: "roles",        label: "Cargos",          icon: Briefcase },
  { id: "templates",    label: "Templates",       icon: LayoutTemplate },
  { id: "job_statuses", label: "Etapas de Job",   icon: Layers },
  { id: "agenda",       label: "Eventos",         icon: Calendar },
  { id: "financial_cat", label: "Plano de Contas", icon: FolderTree },
  { id: "recovery",     label: "Recuperação",     icon: RotateCcw },
  { id: "audit_log",    label: "Histórico",       icon: History },
];

export default function Configuracoes() {
  const [tab, setTab] = useState("system");

  const collaborator = useMemo(() => {
    try { return JSON.parse(sessionStorage.getItem("collaborator") || "null"); } catch { return null; }
  }, []);

  const userIsMaster = isMaster(collaborator);

  const TABS = useMemo(() => {
    return ALL_TABS.filter(t => !t.masterOnly || userIsMaster);
  }, [userIsMaster]);

  return (
    <div className="flex flex-col h-full">
      {/* Tab bar */}
      <div className="flex gap-1 px-6 pt-4 pb-0 border-b border-border bg-card overflow-x-auto flex-shrink-0">
        {TABS.map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`flex items-center gap-2 px-4 py-2.5 text-sm font-semibold whitespace-nowrap border-b-2 -mb-px transition-all ${
              tab === t.id
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            <t.icon className="w-4 h-4" />
            {t.label}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto">
        {tab === "system"        && <div><TimezoneConfig /><SystemExportPanel /></div>}
        {tab === "requests"      && <div className="p-6 max-w-3xl"><MasterRequestsPanel /></div>}
        {tab === "records"       && <Records />}
        {tab === "roles"         && <RolesConfig />}
        {tab === "templates"     && <Templates />}
        {tab === "job_statuses"  && <JobStatusesConfig />}
        {tab === "agenda"        && <AgendaActivitiesConfig />}
        {tab === "financial_cat" && <FinancialCategoriesConfig />}
        {tab === "recovery"      && <Recovery />}
        {tab === "audit_log"     && <JobAuditLog />}
      </div>
    </div>
  );
}