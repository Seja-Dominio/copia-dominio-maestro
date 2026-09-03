import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { X, Briefcase, Loader2, CheckSquare, Square, RefreshCw } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

const FORMAT_OPTIONS = [
  { value: "card",           label: "Card",             bg: "#4ade80", text: "#166534" },
  { value: "reels",          label: "Reels",            bg: "#60a5fa", text: "#1e3a8a" },
  { value: "video_trafego",  label: "Vídeo de Tráfego", bg: "#38bdf8", text: "#0c4a6e" },
  { value: "card_trafego",   label: "Card de Tráfego",  bg: "#34d399", text: "#064e3b" },
  { value: "foto",           label: "Foto",             bg: "#fbbf24", text: "#78350f" },
  { value: "vt",             label: "VT",               bg: "#fb923c", text: "#7c2d12" },
  { value: "stories",        label: "Stories",          bg: "#a78bfa", text: "#3b0764" },
];

// Maps schedule format → possible template content_type values (direct + entity enum)
const FORMAT_TO_CONTENT_TYPES = {
  card:           ["card", "feed_card"],
  reels:          ["reels"],
  video_trafego:  ["video_trafego", "reels"],
  card_trafego:   ["card_trafego", "card"],
  foto:           ["foto"],
  stories:        ["stories", "story"],
  vt:             ["vt", "video"],
};

const NAME_KEYWORDS = {
  card:           ["card", "estático", "estatico"],
  reels:          ["reels", "reel"],
  video_trafego:  ["vídeo tráfego", "video tráfego", "video trafego", "criativo vídeo tráfego", "criativo video trafego"],
  card_trafego:   ["estático tráfego", "estatico trafego", "criativo estático tráfego", "criativo estatico trafego"],
  foto:           ["foto", "photo"],
  stories:        ["stories", "story", "storie"],
  vt:             ["vt"],
};

function findBestTemplate(post, templateList) {
  const fmt = post.formats?.[0];
  if (!fmt || !templateList.length) return null;
  
  const possibleTypes = FORMAT_TO_CONTENT_TYPES[fmt] || [fmt];
  
  // 1) Match by content_types array (preferred — newer templates)
  let match = templateList.find(t =>
    t.content_types?.length > 0 &&
    t.content_types.some(ct => possibleTypes.includes(ct))
  );
  if (match) return match;
  
  // 2) Match by legacy content_type string
  match = templateList.find(t =>
    t.content_type && possibleTypes.includes(t.content_type)
  );
  if (match) return match;
  
  // 3) Fallback: match by template name keywords
  const keywords = NAME_KEYWORDS[fmt] || [];
  if (keywords.length > 0) {
    match = templateList.find(t =>
      keywords.some(kw => (t.name || "").toLowerCase().includes(kw))
    );
    if (match) return match;
  }
  
  return null;
}

/**
 * posts: [{ dayStr, post, suggestedTemplate }]
 * templates: array of JobTemplate
 * onConfirm: (selectedItems: [{ dayStr, post, templateId }]) => void
 */
export default function BulkJobConfirmModal({ posts, templates, onConfirm, onClose, defaultTeam, allTemplates }) {
  // Use allTemplates (unfiltered) if provided, otherwise fall back to templates prop
  const fullTemplateList = allTemplates || templates;

  // Derive unique teams from ALL templates
  const allTeams = [...new Set(
    fullTemplateList.flatMap(t => t.teams?.length ? t.teams : t.team ? [t.team] : [])
  )].sort();

  const initialTeam = defaultTeam && allTeams.includes(defaultTeam) ? defaultTeam : (allTeams[0] || "");
  const [selectedTeam, setSelectedTeam] = useState(initialTeam);
  const [creating, setCreating] = useState(false);

  // Templates filtered by team
  const filteredTemplates = selectedTeam
    ? fullTemplateList.filter(t => t.teams?.includes(selectedTeam) || t.team === selectedTeam)
    : fullTemplateList;

  const [items, setItems] = useState(() => {
    const tpls = initialTeam
      ? fullTemplateList.filter(t => t.teams?.includes(initialTeam) || t.team === initialTeam)
      : fullTemplateList;
    return posts.map(p => {
      const best = findBestTemplate(p.post, tpls);
      return {
        ...p,
        selected: false,
        templateId: best?.id || "",
      };
    }).sort((a, b) => (a.dayStr || "").localeCompare(b.dayStr || ""));
  });

  // Re-suggest templates when team changes
  function handleTeamChange(team) {
    setSelectedTeam(team);
    const tpls = team
      ? fullTemplateList.filter(t => t.teams?.includes(team) || t.team === team)
      : fullTemplateList;
    setItems(prev => prev.map(item => {
      const best = findBestTemplate(item.post, tpls);
      return { ...item, templateId: best?.id || "" };
    }));
  }

  const allSelected = items.every(i => i.selected);
  const selectedCount = items.filter(i => i.selected).length;

  function toggleAll() {
    setItems(prev => prev.map(i => ({ ...i, selected: !allSelected })));
  }

  function toggleItem(idx) {
    setItems(prev => prev.map((i, n) => n === idx ? { ...i, selected: !i.selected } : i));
  }

  function setTemplate(idx, tplId) {
    setItems(prev => prev.map((i, n) => n === idx ? { ...i, templateId: tplId } : i));
  }

  async function handleConfirm() {
    setCreating(true);
    const selected = items.filter(i => i.selected).map(i => ({
      dayStr: i.dayStr,
      post: i.post,
      templateId: i.templateId,
    }));
    await onConfirm(selected);
    setCreating(false);
  }

  return (
    <div className="fixed inset-0 bg-black/60 z-[10001] flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[85vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <div>
            <h2 className="text-lg font-bold text-gray-800">Criar Jobs do Mês</h2>
            <p className="text-xs text-gray-500">
              {posts.length} postagens · {posts.filter(p => p.post.job_created).length} já com job · {selectedCount} selecionadas
            </p>
          </div>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-gray-100 text-gray-500">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Select all + Team selector */}
        <div className="px-6 py-2.5 border-b border-gray-100 bg-gray-50 flex items-center gap-3">
          <button onClick={toggleAll} className="flex items-center gap-1.5 text-xs font-semibold text-gray-600 hover:text-gray-800 transition-colors flex-shrink-0">
            {allSelected ? <CheckSquare className="w-4 h-4 text-blue-600" /> : <Square className="w-4 h-4" />}
            {allSelected ? "Desmarcar todos" : "Selecionar todos"}
          </button>
          {allTeams.length > 0 && (
            <div className="flex items-center gap-2 ml-auto">
              <span className="text-[10px] font-semibold text-gray-500 whitespace-nowrap">Equipe:</span>
              <select
                className="h-7 rounded-md border border-gray-200 bg-white px-2 text-xs focus:outline-none focus:ring-1 focus:ring-blue-400 max-w-[200px]"
                value={selectedTeam}
                onChange={e => handleTeamChange(e.target.value)}
              >
                <option value="">— Todas —</option>
                {allTeams.map(t => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
            </div>
          )}
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto divide-y divide-gray-50">
          {items.map((item, idx) => {
            const dateLabel = format(new Date(item.dayStr + "T12:00:00"), "dd/MM (EEE)", { locale: ptBR });
            const selectedTpl = templates.find(t => t.id === item.templateId);
            return (
              <div
                key={idx}
                className={`flex items-start gap-3 px-6 py-3 transition-colors ${item.selected ? "bg-white" : "bg-gray-50 opacity-50"}`}
              >
                {/* Checkbox */}
                <button onClick={() => toggleItem(idx)} className="mt-0.5 flex-shrink-0 text-blue-600">
                  {item.selected ? <CheckSquare className="w-4 h-4" /> : <Square className="w-4 h-4 text-gray-400" />}
                </button>

                {/* Date */}
                <div className="w-20 flex-shrink-0">
                  <span className="text-xs font-bold text-gray-600">{dateLabel}</span>
                </div>

                {/* Formats */}
                <div className="flex flex-wrap gap-0.5 flex-shrink-0 w-28">
                  {(item.post.formats || []).map(f => {
                    const o = FORMAT_OPTIONS.find(x => x.value === f);
                    return (
                      <span key={f} className="px-1.5 py-0.5 rounded-full text-[9px] font-black uppercase"
                        style={{ backgroundColor: o?.bg || "#888", color: "#fff" }}>
                        {o?.label || f}
                      </span>
                    );
                  })}
                </div>

                {/* Post text */}
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-gray-600 truncate">{item.post.text || "—"}</p>
                  {item.post.job_created && (
                    <span className="inline-flex items-center gap-0.5 text-[9px] font-semibold text-green-600 bg-green-50 rounded px-1 py-0.5 mt-0.5">
                      <Briefcase className="w-2.5 h-2.5" /> Job já criado
                    </span>
                  )}
                </div>

                {/* Template selector */}
                <div className="w-52 flex-shrink-0">
                  <select
                    className="w-full h-7 rounded-md border border-gray-200 bg-white px-2 text-xs focus:outline-none focus:ring-1 focus:ring-blue-400"
                    value={item.templateId}
                    onChange={e => setTemplate(idx, e.target.value)}
                  >
                    <option value="">— Sem template —</option>
                    {filteredTemplates.map(t => (
                      <option key={t.id} value={t.id}>{t.name}</option>
                    ))}
                  </select>
                  {selectedTpl && (
                    <p className="text-[9px] text-gray-400 mt-0.5 truncate">
                      {selectedTpl.subtasks?.length || 0} tarefas · {selectedTpl.job_title || selectedTpl.name}
                    </p>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-gray-100 bg-gray-50">
          <p className="text-xs text-gray-500">
            {selectedCount === 0
              ? "Nenhum job será criado"
              : `${selectedCount} job(s) serão criados${items.filter(i => i.selected && i.post.job_created).length > 0 ? ` (${items.filter(i => i.selected && i.post.job_created).length} recriaçõe(s))` : ""}`
            }
          </p>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={onClose} disabled={creating}>Cancelar</Button>
            <Button size="sm" onClick={handleConfirm} disabled={creating || selectedCount === 0} className="gap-1.5">
              {creating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Briefcase className="w-3.5 h-3.5" />}
              {creating ? "Criando jobs..." : `Criar ${selectedCount} job(s)`}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}