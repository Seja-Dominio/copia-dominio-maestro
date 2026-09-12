// Serviços disponíveis com cores únicas
export const SERVICE_OPTIONS = [
  { value: "conteudo_instagram_facebook", label: "Conteúdo IG/FB",  color: "#8b5cf6", bg: "#ede9fe", text: "#5b21b6" },
  { value: "conteudo_tiktok",             label: "Conteúdo TikTok", color: "#ec4899", bg: "#fce7f3", text: "#9d174d" },
  { value: "trafego_meta",                label: "Tráfego Meta",    color: "#3b82f6", bg: "#dbeafe", text: "#1e3a8a" },
  { value: "trafego_google",              label: "Tráfego Google",  color: "#f97316", bg: "#ffedd5", text: "#7c2d12" },
  { value: "trafego_linkedin",            label: "Tráfego LinkedIn",color: "#0ea5e9", bg: "#e0f2fe", text: "#0c4a6e" },
  { value: "crm",                         label: "CRM",             color: "#10b981", bg: "#d1fae5", text: "#064e3b" },
  { value: "treinamentos",                label: "Treinamentos",    color: "#f59e0b", bg: "#fef3c7", text: "#78350f" },
];

// Tarjas disponíveis (apenas 1 por cliente)
export const TIER_TAGS = [
  { value: "",            label: "Nenhuma" },
  { value: "elite",       label: "Elite",       color: "#f59e0b", bg: "#fef3c7", text: "#78350f", border: "#fcd34d" },
  { value: "performance", label: "Performance", color: "#3b82f6", bg: "#dbeafe", text: "#1e3a8a", border: "#93c5fd" },
  { value: "trafego",     label: "Tráfego",     color: "#eab308", bg: "#fefce8", text: "#713f12", border: "#fde047" },
];

export function getServiceOption(value) {
  return SERVICE_OPTIONS.find(s => s.value === value);
}

export function getTierTag(value) {
  return TIER_TAGS.find(t => t.value === value);
}