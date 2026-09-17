import { useState, useEffect, useMemo } from "react";
import { maestro, invokeMaestroFunction } from "@/api/maestroClient";
import { format, subDays } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  Users, Eye, Heart, TrendingUp, Trash2,
  RefreshCw, Sparkles, ExternalLink, Loader2,
  Image, Film, LayoutGrid, AlertCircle
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, BarChart, Bar
} from "recharts";
import ReactMarkdown from "react-markdown";

const POST_TYPE_LABELS = {
  IMAGE: { label: "Foto", icon: Image, color: "bg-blue-100 text-blue-700" },
  VIDEO: { label: "Vídeo", icon: Film, color: "bg-purple-100 text-purple-700" },
  CAROUSEL_ALBUM: { label: "Carrossel", icon: LayoutGrid, color: "bg-green-100 text-green-700" },
  REELS: { label: "Reels", icon: Film, color: "bg-pink-100 text-pink-700" },
};

const PERIOD_OPTIONS = [
  { value: "7", label: "7 dias" },
  { value: "15", label: "15 dias" },
  { value: "30", label: "30 dias" },
  { value: "60", label: "60 dias" },
  { value: "90", label: "90 dias" },
];

function comparisonRange(days) {
  const length = Number(days) + 1;
  return {
    from: format(subDays(new Date(), length + Number(days)), "yyyy-MM-dd"),
    to: format(subDays(new Date(), length), "yyyy-MM-dd"),
  };
}

function variation(current, previous) {
  if (!Number.isFinite(Number(current)) || !Number.isFinite(Number(previous))) return null;
  if (Number(previous) === 0) return Number(current) === 0 ? 0 : null;
  return ((Number(current) - Number(previous)) / Math.abs(Number(previous))) * 100;
}

function VariationLabel({ current, previous, suffix = "%" }) {
  const delta = variation(current, previous);
  if (delta == null) return <span className="text-[10px] text-muted-foreground">sem base anterior</span>;
  return <span className={`text-[10px] font-bold ${delta >= 0 ? "text-green-600" : "text-red-600"}`}>{delta >= 0 ? "+" : ""}{delta.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}{suffix} vs. período anterior</span>;
}

export default function InsightsTab({ client }) {
  const [insights, setInsights] = useState([]);
  const [posts, setPosts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [period, setPeriod] = useState("30");
  const [aiAnalysis, setAiAnalysis] = useState(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [sortBy, setSortBy] = useState("engagement");
  const [sortDir, setSortDir] = useState("desc");

  const dateFrom = format(subDays(new Date(), Number(period)), "yyyy-MM-dd");
  const dateTo = format(new Date(), "yyyy-MM-dd");
  const previousRange = comparisonRange(period);

  async function loadData() {
    setLoading(true);
    const [ins, pts] = await Promise.all([
      maestro.entities.ClientInsight.filter({ client_id: client.id }, "-date", 200),
      maestro.entities.PostMetric.filter({ client_id: client.id }, "-published_at", 200),
    ]);
    setInsights(ins);
    setPosts(pts);
    setLoading(false);
  }

  useEffect(() => { loadData(); }, [client.id]);

  async function handleSync() {
    if (!client.instagram_account_id) return;
    setSyncing(true);
    await invokeMaestroFunction("fetchInstagramInsights", {
      client_id: client.id,
      instagram_account_id: client.instagram_account_id,
    });
    await loadData();
    setSyncing(false);
  }

  async function handleGenerateAI() {
    setAiLoading(true);
    const res = await invokeMaestroFunction("generateAIInsights", {
      client_id: client.id,
      client_name: client.name,
      date_from: dateFrom,
      date_to: dateTo,
    });
    setAiAnalysis(res.data);
    setAiLoading(false);
  }

  async function handleExcludePost(postId) {
    await maestro.entities.PostMetric.update(postId, { is_excluded: true });
    setPosts(prev => prev.map(p => p.id === postId ? { ...p, is_excluded: true } : p));
  }

  async function handleRestorePost(postId) {
    await maestro.entities.PostMetric.update(postId, { is_excluded: false });
    setPosts(prev => prev.map(p => p.id === postId ? { ...p, is_excluded: false } : p));
  }

  // Filtered data
  const filteredInsights = useMemo(() =>
    insights.filter(i => !i.is_excluded && i.date >= dateFrom && i.date <= dateTo)
      .sort((a, b) => a.date.localeCompare(b.date)),
    [insights, dateFrom, dateTo]
  );

  const filteredPosts = useMemo(() =>
    posts.filter(p => {
      const d = p.published_at?.split("T")[0] || "";
      return d >= dateFrom && d <= dateTo;
    }),
    [posts, dateFrom, dateTo]
  );

  const activePosts = filteredPosts.filter(p => !p.is_excluded);
  const previousInsights = useMemo(() => insights.filter(i => !i.is_excluded && i.date >= previousRange.from && i.date <= previousRange.to).sort((a, b) => a.date.localeCompare(b.date)), [insights, previousRange.from, previousRange.to]);
  const previousPosts = useMemo(() => posts.filter(p => {
    const d = p.published_at?.split("T")[0] || "";
    return d >= previousRange.from && d <= previousRange.to && !p.is_excluded;
  }), [posts, previousRange.from, previousRange.to]);

  // KPIs
  const kpis = useMemo(() => {
    const lastFollowers = filteredInsights[filteredInsights.length - 1]?.followers_count || 0;
    const firstFollowers = filteredInsights[0]?.followers_count || lastFollowers;
    const followerGrowth = lastFollowers - firstFollowers;
    const totalReach = activePosts.reduce((s, p) => s + (p.reach || 0), 0);
    const avgEngagement = activePosts.length > 0
      ? (activePosts.reduce((s, p) => s + (p.engagement_rate || 0), 0) / activePosts.length).toFixed(2)
      : 0;
    const totalEngagement = activePosts.reduce((s, p) => s + (p.engagement || 0), 0);
    const totalSaves = activePosts.reduce((s, p) => s + (p.saves || 0), 0);
    return { lastFollowers, followerGrowth, totalReach, avgEngagement, totalEngagement, totalSaves };
  }, [filteredInsights, activePosts]);

  const previousKpis = useMemo(() => {
    const lastFollowers = previousInsights[previousInsights.length - 1]?.followers_count || 0;
    const firstFollowers = previousInsights[0]?.followers_count || lastFollowers;
    const totalReach = previousPosts.reduce((s, p) => s + (p.reach || 0), 0);
    const avgEngagement = previousPosts.length > 0
      ? (previousPosts.reduce((s, p) => s + (p.engagement_rate || 0), 0) / previousPosts.length).toFixed(2)
      : 0;
    const totalSaves = previousPosts.reduce((s, p) => s + (p.saves || 0), 0);
    return { lastFollowers, followerGrowth: lastFollowers - firstFollowers, totalReach, avgEngagement, totalSaves };
  }, [previousInsights, previousPosts]);

  // Chart data
  const chartData = filteredInsights.map(i => ({
    date: format(new Date(i.date + "T12:00:00"), "dd/MM", { locale: ptBR }),
    seguidores: i.followers_count,
    alcance: i.profile_reach,
  }));

  // Post performance chart
  const postChartData = activePosts
    .sort((a, b) => (a.published_at || "").localeCompare(b.published_at || ""))
    .map(p => ({
      date: p.published_at ? format(new Date(p.published_at), "dd/MM", { locale: ptBR }) : "",
      engajamento: p.engagement || 0,
      alcance: p.reach || 0,
    }));

  // Sorted posts
  const sortedPosts = [...filteredPosts].sort((a, b) => {
    const va = a[sortBy] || 0;
    const vb = b[sortBy] || 0;
    return sortDir === "desc" ? vb - va : va - vb;
  });

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!client.instagram_account_id) {
    return null;
  }

  return (
    <div className="space-y-4">
      {/* Header: Period + Sync */}
      <div className="flex items-center gap-2 flex-wrap">
        <select
          value={period}
          onChange={e => setPeriod(e.target.value)}
          className="h-8 rounded-lg border border-input bg-background px-2 text-xs font-semibold focus:outline-none focus:ring-1 focus:ring-ring"
        >
          {PERIOD_OPTIONS.map(o => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
        <Button
          size="sm" variant="outline"
          className="h-8 text-xs gap-1.5"
          onClick={handleSync}
          disabled={syncing}
        >
          <RefreshCw className={`w-3.5 h-3.5 ${syncing ? "animate-spin" : ""}`} />
          {syncing ? "Sincronizando..." : "Atualizar dados"}
        </Button>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 gap-2">
        {[
          { label: "Seguidores", value: kpis.lastFollowers.toLocaleString("pt-BR"), previous: previousKpis.lastFollowers, sub: kpis.followerGrowth, icon: Users, color: "text-primary" },
          { label: "Alcance Total", value: kpis.totalReach.toLocaleString("pt-BR"), previous: previousKpis.totalReach, icon: Eye, color: "text-blue-600" },
          { label: "Engajamento Médio", value: `${kpis.avgEngagement}%`, previous: previousKpis.avgEngagement, icon: Heart, color: "text-pink-600" },
          { label: "Salvamentos", value: kpis.totalSaves.toLocaleString("pt-BR"), previous: previousKpis.totalSaves, icon: TrendingUp, color: "text-green-600" },
        ].map(k => (
          <div key={k.label} className="bg-muted/40 rounded-xl p-3">
            <div className="flex items-center gap-1.5 mb-1">
              <k.icon className={`w-3.5 h-3.5 ${k.color}`} />
              <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">{k.label}</span>
            </div>
            <p className="text-lg font-black text-foreground">{k.value}</p>
            <VariationLabel current={Number.parseFloat(String(k.value).replace(/[^\d,-]/g, "").replace(".", "").replace(",", "."))} previous={k.previous} />
            {k.sub !== undefined && (
              <span className={`text-[10px] font-bold ${k.sub >= 0 ? "text-green-600" : "text-red-600"}`}>
                {k.sub >= 0 ? "+" : ""}{k.sub} no período
              </span>
            )}
          </div>
        ))}
      </div>

      <div className="rounded-xl border border-blue-200 bg-blue-50/70 p-4 text-xs text-blue-950">
        <div className="flex items-start gap-2"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-blue-600" /><div><p className="font-semibold">Comparação competitiva</p><p className="mt-1 leading-5">Os insights da conta e a variação do período anterior estão disponíveis. A API oficial do Instagram não entrega métricas privadas de concorrentes; este bloco só será preenchido quando houver uma fonte oficial autorizada ou um benchmark interno cadastrado.</p></div></div>
      </div>

      {/* Charts */}
      {chartData.length > 1 && (
        <div className="bg-muted/30 rounded-xl p-3">
          <p className="text-xs font-bold text-foreground mb-2">Evolução de Seguidores</p>
          <ResponsiveContainer width="100%" height={160}>
            <LineChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis dataKey="date" tick={{ fontSize: 9 }} />
              <YAxis tick={{ fontSize: 9 }} />
              <Tooltip contentStyle={{ fontSize: 11 }} />
              <Line type="monotone" dataKey="seguidores" stroke="hsl(var(--primary))" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      {postChartData.length > 1 && (
        <div className="bg-muted/30 rounded-xl p-3">
          <p className="text-xs font-bold text-foreground mb-2">Engajamento por Post</p>
          <ResponsiveContainer width="100%" height={160}>
            <BarChart data={postChartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis dataKey="date" tick={{ fontSize: 9 }} />
              <YAxis tick={{ fontSize: 9 }} />
              <Tooltip contentStyle={{ fontSize: 11 }} />
              <Bar dataKey="engajamento" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* AI Insights Panel */}
      <div className="bg-gradient-to-br from-violet-50 to-blue-50 dark:from-violet-900/20 dark:to-blue-900/20 rounded-xl p-4 border border-violet-200 dark:border-violet-800">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-violet-600" />
            <span className="text-xs font-bold text-foreground">Insights da IA</span>
          </div>
          <Button
            size="sm" variant="outline"
            className="h-7 text-[10px] gap-1"
            onClick={handleGenerateAI}
            disabled={aiLoading || activePosts.length === 0}
          >
            {aiLoading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />}
            {aiLoading ? "Analisando..." : "Gerar insights"}
          </Button>
        </div>

        {aiAnalysis?.analysis ? (
          <div className="prose prose-sm max-w-none text-xs text-foreground">
            <ReactMarkdown>{aiAnalysis.analysis}</ReactMarkdown>
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">
            {activePosts.length === 0
              ? "Sincronize os dados para gerar insights."
              : "Clique em \"Gerar insights\" para receber uma análise completa do período."}
          </p>
        )}
      </div>

      {/* Posts Table */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <p className="text-xs font-bold text-foreground">Posts do Período ({filteredPosts.length})</p>
          <select
            value={sortBy}
            onChange={e => setSortBy(e.target.value)}
            className="h-7 rounded-md border border-input bg-background px-2 text-[10px] font-semibold"
          >
            <option value="engagement">Engajamento</option>
            <option value="reach">Alcance</option>
            <option value="likes">Curtidas</option>
            <option value="saves">Salvamentos</option>
            <option value="comments">Comentários</option>
            <option value="shares">Compartilhamentos</option>
          </select>
        </div>

        <div className="space-y-1.5 max-h-[300px] overflow-y-auto">
          {sortedPosts.map(post => {
            const typeInfo = POST_TYPE_LABELS[post.post_type] || POST_TYPE_LABELS.IMAGE;
            const TypeIcon = typeInfo.icon;
            return (
              <div
                key={post.id}
                className={`flex items-center gap-2 rounded-lg px-3 py-2 text-xs transition-colors ${
                  post.is_excluded
                    ? "bg-red-50 dark:bg-red-900/10 opacity-60"
                    : "bg-muted/40 hover:bg-muted/60"
                }`}
              >
                <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold ${typeInfo.color}`}>
                  {typeInfo.label}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-foreground font-medium truncate" title={post.caption}>
                    {(post.caption || "Sem legenda").slice(0, 60)}
                  </p>
                  <p className="text-[10px] text-muted-foreground">
                    {post.published_at ? format(new Date(post.published_at), "dd/MM/yy", { locale: ptBR }) : "—"}
                  </p>
                </div>
                <div className="flex items-center gap-3 text-[10px] font-semibold text-muted-foreground flex-shrink-0">
                  <span title="Curtidas">❤️ {post.likes || 0}</span>
                  <span title="Comentários">💬 {post.comments || 0}</span>
                  <span title="Saves">🔖 {post.saves || 0}</span>
                  <span title="Alcance">👁 {post.reach || 0}</span>
                </div>
                {post.permalink && (
                  <a href={post.permalink} target="_blank" rel="noopener noreferrer" className="text-muted-foreground hover:text-primary flex-shrink-0">
                    <ExternalLink className="w-3 h-3" />
                  </a>
                )}
                <button
                  onClick={() => post.is_excluded ? handleRestorePost(post.id) : handleExcludePost(post.id)}
                  className={`w-6 h-6 rounded flex items-center justify-center flex-shrink-0 transition-colors ${
                    post.is_excluded
                      ? "text-green-600 hover:bg-green-100 dark:hover:bg-green-900/30"
                      : "text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                  }`}
                  title={post.is_excluded ? "Restaurar" : "Excluir da análise"}
                >
                  {post.is_excluded ? <RefreshCw className="w-3 h-3" /> : <Trash2 className="w-3 h-3" />}
                </button>
              </div>
            );
          })}
          {sortedPosts.length === 0 && (
            <p className="text-xs text-muted-foreground text-center py-6">
              Nenhum post encontrado. Sincronize os dados primeiro.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
