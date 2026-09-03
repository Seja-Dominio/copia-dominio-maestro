import { useState } from "react";
import { createPageUrl } from "@/utils";
import { ArrowRight, TrendingDown, Crown } from "lucide-react";
import { getNpsColor } from "@/components/clients/NpsScoreBadge";

export default function NpsAlertPanel({ clients }) {
  const sorted = [...clients].sort((a, b) => (a.nps_score ?? 100) - (b.nps_score ?? 100)).slice(0, 20);
  const PAGE_SIZE = 5;
  const [page, setPage] = useState(0);
  const pages = Math.ceil(sorted.length / PAGE_SIZE);
  const visible = sorted.slice(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE);

  if (sorted.length === 0) return null;

  return (
    <div className="bg-card border border-border rounded-2xl overflow-hidden shadow-sm">
      <div className="flex items-center justify-between px-5 py-4 border-b border-border">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 bg-red-500 rounded-lg flex items-center justify-center">
            <TrendingDown className="w-3.5 h-3.5 text-white" />
          </div>
          <h3 className="text-sm font-bold text-foreground">NPS Mais Baixos</h3>
        </div>
        <a href={createPageUrl("ClientPortfolio")} className="text-xs text-primary font-semibold hover:underline flex items-center gap-1 no-underline">
          Ver carteira <ArrowRight className="w-3 h-3" />
        </a>
      </div>
      <div className="divide-y divide-border">
        {visible.map(c => {
          const col = getNpsColor(c.nps_score ?? 100);
          return (
            <div key={c.id} className="flex items-center gap-3 px-5 py-2.5">
              <div className="w-7 h-7 rounded-full bg-gradient-to-br from-primary to-violet-500 flex items-center justify-center text-white text-[10px] font-bold flex-shrink-0">
                {c.name[0]?.toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1">
                  <p className="text-xs font-semibold text-foreground truncate">{c.name}</p>
                  {c.tier === "elite" && <Crown className="w-3 h-3 text-amber-500 flex-shrink-0" />}
                </div>
                <p className="text-[10px] text-muted-foreground">{c.responsible || "—"}</p>
              </div>
              <div className={`w-9 h-9 rounded-full ${col.bg} ${col.text} flex items-center justify-center text-xs font-black flex-shrink-0`}>
                {c.nps_score ?? 100}
              </div>
            </div>
          );
        })}
      </div>
      {pages > 1 && (
        <div className="flex items-center justify-between px-5 py-2 border-t border-border">
          <button onClick={() => setPage(p => Math.max(0, p - 1))} disabled={page === 0} className="text-xs text-muted-foreground hover:text-foreground disabled:opacity-30 font-semibold">← Ant</button>
          <span className="text-[10px] text-muted-foreground">{page + 1}/{pages}</span>
          <button onClick={() => setPage(p => Math.min(pages - 1, p + 1))} disabled={page === pages - 1} className="text-xs text-muted-foreground hover:text-foreground disabled:opacity-30 font-semibold">Próx →</button>
        </div>
      )}
    </div>
  );
}