import { createContext, useContext, useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";

export const DEFAULT_STATUS_LIST = [
  { key: "pending_briefing",  label: "Pend. Briefing/Roteiro", color: "bg-amber-100 text-amber-700 border-amber-200",   dot: "bg-amber-500" },
  { key: "pending_capture",   label: "Pend. Captação",          color: "bg-orange-100 text-orange-700 border-orange-200", dot: "bg-orange-500" },
  { key: "pending_design",    label: "Pend. Designer",           color: "bg-blue-100 text-blue-700 border-blue-200",       dot: "bg-blue-500" },
  { key: "pending_edit",      label: "Pend. Edição",             color: "bg-purple-100 text-purple-700 border-purple-200", dot: "bg-purple-500" },
  { key: "internal_approval", label: "Aprov. Interna",           color: "bg-cyan-100 text-cyan-700 border-cyan-200",       dot: "bg-cyan-500" },
  { key: "client_approval",   label: "Aprov. Cliente",           color: "bg-pink-100 text-pink-700 border-pink-200",       dot: "bg-pink-500" },
  { key: "scheduled",         label: "Agendado",                 color: "bg-green-100 text-green-700 border-green-200",    dot: "bg-green-500" },
  { key: "completed",         label: "Concluído",                color: "bg-emerald-100 text-emerald-700 border-emerald-200", dot: "bg-emerald-600" },
  { key: "cancelled",         label: "Cancelado",                color: "bg-gray-100 text-gray-500 border-gray-200",           dot: "bg-gray-400" },
];

// Dict for backward-compat O(1) lookup
export const DEFAULT_STATUS_CONFIG = Object.fromEntries(
  DEFAULT_STATUS_LIST.map(({ key, ...rest }) => [key, rest])
);

const AppConfigContext = createContext({
  statusList: DEFAULT_STATUS_LIST,
  statusConfig: DEFAULT_STATUS_CONFIG,
  timezone: "America/Manaus",
  refresh: () => {},
  refreshTimezone: () => {},
});

// Global timezone cache for non-React code (dateUtils.js)
let _globalTimezone = "America/Manaus";
export function getGlobalTimezone() { return _globalTimezone; }

export function AppConfigProvider({ children }) {
  const [statusList, setStatusList] = useState(DEFAULT_STATUS_LIST);
  const [timezone, setTimezone] = useState("America/Manaus");

  async function loadStatuses() {
    try {
      const configs = await base44.entities.AppConfig.filter({ key: "job_statuses_v2" });
      if (configs.length > 0 && configs[0].value?.statuses?.length > 0) {
        setStatusList(configs[0].value.statuses);
        return;
      }
      const old = await base44.entities.AppConfig.filter({ key: "job_statuses" });
      if (old.length > 0 && old[0].value) {
        const saved = old[0].value;
        const migrated = DEFAULT_STATUS_LIST.map(s => ({
          ...s,
          label: saved[s.key]?.label ?? s.label,
        }));
        setStatusList(migrated);
      }
    } catch {}
  }

  async function loadTimezone() {
    try {
      const configs = await base44.entities.AppConfig.filter({ key: "system_timezone" });
      if (configs.length > 0 && configs[0].value?.timezone) {
        const tz = configs[0].value.timezone;
        setTimezone(tz);
        _globalTimezone = tz;
      }
    } catch {}
  }

  useEffect(() => {
    loadStatuses();
    loadTimezone();
  }, []);

  const statusConfig = Object.fromEntries(
    statusList.map(({ key, ...rest }) => [key, rest])
  );

  return (
    <AppConfigContext.Provider value={{ statusList, statusConfig, timezone, refresh: loadStatuses, refreshTimezone: loadTimezone }}>
      {children}
    </AppConfigContext.Provider>
  );
}

export function useStatusConfig() {
  return useContext(AppConfigContext);
}

export function useAppConfig() {
  return useContext(AppConfigContext);
}