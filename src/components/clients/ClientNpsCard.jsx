import { useState } from "react";
import { Crown, AlertTriangle, Settings, BarChart3 } from "lucide-react";
import NpsScoreBadge from "./NpsScoreBadge";
import ClientEditDrawer from "./ClientEditDrawer";
import { format, differenceInDays, parseISO } from "date-fns";
import { SERVICE_OPTIONS, TIER_TAGS } from "@/lib/clientServices";

export default function ClientNpsCard({ client, npsHistory, npsEntries, onUpdated, contractExpiry }) {
  const [showDrawer, setShowDrawer] = useState(false);
  const [drawerTab, setDrawerTab] = useState("nps");

  const currentMonth = format(new Date(), "yyyy-MM");
  const currentMonthEntry = npsEntries.find(e => e.client_id === client.id && e.month === currentMonth);
  const daysUntilExpiry = contractExpiry ? differenceInDays(parseISO(contractExpiry), new Date()) : null;
  const showContractAlert = daysUntilExpiry !== null && daysUntilExpiry <= 60;

  const tierTag = TIER_TAGS.find(t => t.value === (client.tier || ""));
  const clientServices = (client.services || []).map(s => SERVICE_OPTIONS.find(o => o.value === s)).filter(Boolean);

  // Borda superior colorida com a cor da tarja
  const borderTopStyle = tierTag?.color
    ? { borderTop: `3px solid ${tierTag.color}` }
    : {};

  return (
    <>
      <div
        className={`bg-card border rounded-2xl shadow-sm overflow-hidden transition-all ${
          tierTag?.value ? "" : "border-border"
        }`}
        style={tierTag?.value ? { ...borderTopStyle, borderColor: tierTag.border } : {}}
      >
        {/* Header — clica para abrir NPS */}
        <div
          className="flex items-center gap-3 p-4 cursor-pointer hover:bg-muted/30 transition-colors"
          onClick={() => { setDrawerTab("nps"); setShowDrawer(true); }}
        >
          {/* Avatar */}
          <div className="w-10 h-10 rounded-full bg-gradient-to-br from-primary to-violet-500 flex items-center justify-center text-white text-sm font-black flex-shrink-0">
            {client.avatar_url
              ? <img src={client.avatar_url} className="w-10 h-10 rounded-full object-cover" alt="" />
              : client.name[0]?.toUpperCase()
            }
          </div>

          {/* Info */}
          <div className="flex-1 min-w-0">
            {/* Tarja */}
            {tierTag?.value && (
              <div className="flex items-center gap-1 mb-1">
                <span
                  className="flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold border"
                  style={{ backgroundColor: tierTag.bg, color: tierTag.text, borderColor: tierTag.border }}
                >
                  {tierTag.value === "elite" && <Crown className="w-2.5 h-2.5" fill="currentColor" />}
                  {tierTag.label}
                </span>
              </div>
            )}

            {/* Serviços */}
            {clientServices.length > 0 && (
              <div className="flex flex-wrap gap-1 mb-1">
                {clientServices.map(svc => (
                  <span
                    key={svc.value}
                    className="px-1.5 py-0.5 rounded-full text-[9px] font-semibold"
                    style={{ backgroundColor: svc.bg, color: svc.text }}
                  >
                    {svc.label}
                  </span>
                ))}
              </div>
            )}

            <p className="text-sm font-bold text-foreground truncate">{client.name}</p>
            <p className="text-[10px] text-muted-foreground">{client.responsible || "Sem responsável"}</p>
            {currentMonthEntry && (
              <span className="text-[9px] font-semibold text-primary bg-primary/10 px-1.5 py-0.5 rounded mt-0.5 inline-block">
                Nota do mês: {currentMonthEntry.monthly_score}
              </span>
            )}
          </div>

          {/* Contract expiry alert */}
          {showContractAlert && (
            <div className={`flex flex-col items-center gap-0.5 flex-shrink-0 ${daysUntilExpiry <= 30 ? "text-red-500" : "text-amber-500"}`}>
              <AlertTriangle className="w-4 h-4" />
              <span className="text-[8px] font-bold">{daysUntilExpiry < 0 ? "Venc." : `${daysUntilExpiry}d`}</span>
            </div>
          )}

          {/* NPS Score */}
          <NpsScoreBadge score={client.nps_score ?? 100} />

          {/* Botão Insights */}
          {client.instagram_account_id && (
            <button
              onClick={e => { e.stopPropagation(); setDrawerTab("insights"); setShowDrawer(true); }}
              className="w-7 h-7 rounded-lg hover:bg-muted flex items-center justify-center text-muted-foreground transition-colors flex-shrink-0"
              title="Insights Instagram"
            >
              <BarChart3 className="w-3.5 h-3.5" />
            </button>
          )}

          {/* Botão Cadastro */}
          <button
            onClick={e => { e.stopPropagation(); setDrawerTab("dados"); setShowDrawer(true); }}
            className="w-7 h-7 rounded-lg hover:bg-muted flex items-center justify-center text-muted-foreground transition-colors flex-shrink-0"
            title="Editar cadastro"
          >
            <Settings className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {showDrawer && (
        <ClientEditDrawer
          client={client}
          npsHistory={npsHistory}
          npsEntries={npsEntries}
          initialTab={drawerTab}
          onClose={() => setShowDrawer(false)}
          onSaved={() => { onUpdated?.(); }}
        />
      )}
    </>
  );
}