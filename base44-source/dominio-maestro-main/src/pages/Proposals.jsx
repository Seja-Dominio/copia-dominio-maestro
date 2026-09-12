import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Plus, Search, FileText, Send, CheckCircle2, XCircle, Clock, Eye, Pencil, Trash2, ChevronLeft, ChevronRight, Calendar, ArrowUpDown, ArrowUp, ArrowDown, AlertTriangle, Repeat, Zap } from "lucide-react";
import { useNavigate } from "react-router-dom";
import ConfirmDeleteModal from "@/components/ConfirmDeleteModal";

import ProposalFormModal from "@/components/proposals/ProposalFormModal";
import ProposalStatsCards from "@/components/proposals/ProposalStatsCards";
import ProposalsChart from "@/components/proposals/ProposalsChart";
import { format, startOfMonth, endOfMonth, subMonths } from "date-fns";
import { ptBR } from "date-fns/locale";

const STATUS_CONFIG = {
  sent: { label: "Enviada", color: "bg-blue-100 text-blue-700", icon: Send },
  approved: { label: "Aprovada", color: "bg-green-100 text-green-700", icon: CheckCircle2 },
  rejected: { label: "Recusada", color: "bg-red-100 text-red-700", icon: XCircle },
  expired: { label: "Vencida", color: "bg-orange-100 text-orange-700", icon: Clock },
};

const TYPE_CONFIG = {
  contrato_mensal: { label: "Contrato Mensal", icon: Repeat, color: "text-purple-600 bg-purple-50 border-purple-200" },
  job_pontual: { label: "Job Pontual", icon: Zap, color: "text-amber-600 bg-amber-50 border-amber-200" },
};

export default function Proposals() {
  const [proposals, setProposals] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [showForm, setShowForm] = useState(false);
  const [editingProposal, setEditingProposal] = useState(null);
  const [dateFilter, setDateFilter] = useState("current"); // "current" | "previous" | "custom"
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [sortField, setSortField] = useState("created_date");
  const [sortDir, setSortDir] = useState("desc");
  const [confirmModal, setConfirmModal] = useState(null); // { type: "delete"|"approve"|"reject", proposal }
  const navigate = useNavigate();

  function toggleSort(field) {
    if (sortField === field) {
      setSortDir(d => d === "desc" ? "asc" : "desc");
    } else {
      setSortField(field);
      setSortDir("desc");
    }
  }

  async function loadProposals() {
    setLoading(true);
    const data = await base44.entities.Proposal.list("-created_date", 200);
    const today = new Date().toISOString().split("T")[0];
    const expirePromises = data.filter(p =>
      p.status === "sent" && p.valid_until && p.valid_until < today
    ).map(p => base44.entities.Proposal.update(p.id, { status: "expired" }));
    if (expirePromises.length > 0) {
      await Promise.all(expirePromises);
      const refreshed = await base44.entities.Proposal.list("-created_date", 200);
      setProposals(refreshed);
    } else {
      setProposals(data);
    }
    setLoading(false);
  }

  useEffect(() => { loadProposals(); }, []);

  // Compute date range
  const now = new Date();
  const dateRange = (() => {
    if (dateFilter === "current") {
      return { from: startOfMonth(now), to: endOfMonth(now) };
    } else if (dateFilter === "previous") {
      const prev = subMonths(now, 1);
      return { from: startOfMonth(prev), to: endOfMonth(prev) };
    } else if (dateFilter === "custom" && customFrom && customTo) {
      return { from: new Date(customFrom + "T00:00:00"), to: new Date(customTo + "T23:59:59") };
    }
    return null;
  })();

  const dateLabel = dateFilter === "current"
    ? format(now, "MMMM yyyy", { locale: ptBR })
    : dateFilter === "previous"
    ? format(subMonths(now, 1), "MMMM yyyy", { locale: ptBR })
    : customFrom && customTo
    ? `${format(new Date(customFrom), "dd/MM")} — ${format(new Date(customTo), "dd/MM/yyyy")}`
    : "Personalizado";

  const filtered = proposals.filter(p => {
    const matchSearch = !search || p.title?.toLowerCase().includes(search.toLowerCase()) || p.client_name?.toLowerCase().includes(search.toLowerCase());
    const matchStatus = statusFilter === "all" || p.status === statusFilter;
    let matchDate = true;
    if (dateRange) {
      const d = p.created_date ? new Date(p.created_date) : null;
      matchDate = d ? d >= dateRange.from && d <= dateRange.to : false;
    }
    return matchSearch && matchStatus && matchDate;
  }).sort((a, b) => {
    let cmp = 0;
    switch (sortField) {
      case "created_date": cmp = new Date(a.created_date || 0) - new Date(b.created_date || 0); break;
      case "title": cmp = (a.title || "").localeCompare(b.title || ""); break;
      case "client": cmp = (a.client_name || "").localeCompare(b.client_name || ""); break;
      case "valid_until": cmp = new Date(a.valid_until || 0) - new Date(b.valid_until || 0); break;
      case "value": cmp = (a.total_amount || 0) - (b.total_amount || 0); break;
      default: cmp = 0;
    }
    return sortDir === "desc" ? -cmp : cmp;
  });

  function openNew() {
    setEditingProposal(null);
    setShowForm(true);
  }

  function openEdit(p) {
    setEditingProposal(p);
    setShowForm(true);
  }

  function requestDelete(p) { setConfirmModal({ type: "delete", proposal: p }); }
  function requestApprove(p) { setConfirmModal({ type: "approve", proposal: p }); }
  function requestReject(p) { setConfirmModal({ type: "reject", proposal: p }); }

  async function executeConfirm() {
    if (!confirmModal) return;
    const { type, proposal } = confirmModal;
    setConfirmModal(null);
    if (type === "delete") {
      await base44.entities.Proposal.delete(proposal.id);
    } else if (type === "approve") {
      const update = { status: "approved" };
      if (!proposal.approved_at) update.approved_at = new Date().toISOString();
      await base44.entities.Proposal.update(proposal.id, update);
      if (proposal.proposal_type === "contrato_mensal" && proposal.client_id) {
        navigate(`/ClientPortfolio?openClient=${proposal.client_id}`);
        return;
      }
    } else if (type === "reject") {
      await base44.entities.Proposal.update(proposal.id, { status: "rejected" });
    }
    loadProposals();
  }

  return (
    <div className="p-4 sm:p-6 max-w-[1400px] mx-auto space-y-5">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-foreground">Propostas Comerciais</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Crie propostas para novos clientes e serviços extras</p>
        </div>
        <Button className="gap-2 self-start sm:self-auto" onClick={openNew}>
          <Plus className="w-4 h-4" /> Nova Proposta
        </Button>
      </div>

      {/* Date filter */}
      <div className="flex items-center gap-2 flex-wrap">
        <button
          onClick={() => { setDateFilter("previous"); }}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
            dateFilter === "previous" ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-muted/80"
          }`}
        >
          <ChevronLeft className="w-3 h-3" /> Mês anterior
        </button>
        <button
          onClick={() => { setDateFilter("current"); }}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
            dateFilter === "current" ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-muted/80"
          }`}
        >
          <Calendar className="w-3 h-3" /> Mês atual
        </button>
        <button
          onClick={() => { setDateFilter("custom"); }}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
            dateFilter === "custom" ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-muted/80"
          }`}
        >
          Personalizado
        </button>
        {dateFilter === "custom" && (
          <div className="flex items-center gap-2">
            <Input type="date" className="h-8 text-xs w-36" value={customFrom} onChange={e => setCustomFrom(e.target.value)} />
            <span className="text-xs text-muted-foreground">a</span>
            <Input type="date" className="h-8 text-xs w-36" value={customTo} onChange={e => setCustomTo(e.target.value)} />
          </div>
        )}
        <span className="text-xs text-muted-foreground font-medium capitalize ml-1">{dateLabel}</span>
      </div>

      {/* Stats */}
      <ProposalStatsCards proposals={filtered} />

      {/* Chart */}
      <ProposalsChart proposals={filtered} />

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input className="pl-9" placeholder="Buscar propostas..." value={search} onChange={e => setSearch(e.target.value)} />
        </div>

        <div className="flex gap-2 flex-wrap">
          {["all", "sent", "approved", "rejected", "expired"].map(s => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                statusFilter === s ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-muted/80"
              }`}
            >
              {s === "all" ? "Todas" : STATUS_CONFIG[s]?.label}
            </button>
          ))}
        </div>
      </div>

      {/* List */}
      {loading ? (
        <div className="space-y-3">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="glass-card p-4 h-16 animate-pulse">
              <div className="h-4 bg-muted rounded w-1/3 mb-2" />
              <div className="h-3 bg-muted rounded w-1/4" />
            </div>
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16">
          <FileText className="w-12 h-12 text-muted-foreground mx-auto mb-3 opacity-30" />
          <p className="text-muted-foreground">Nenhuma proposta encontrada</p>
          <Button className="mt-4 gap-2" onClick={openNew}><Plus className="w-4 h-4" /> Criar proposta</Button>
        </div>
      ) : (
        <>
          {/* Desktop table */}
          <div className="hidden md:block glass-card overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted border-b border-border">
                <tr>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground">Nº</th>
                  {[
                    { key: "title", label: "Título", align: "left" },
                    { key: "client", label: "Cliente", align: "left" },
                    { key: "created_date", label: "Criação", align: "left" },
                    { key: "valid_until", label: "Validade", align: "left" },
                  ].map(col => (
                    <th key={col.key} className={`text-${col.align} px-4 py-3 text-xs font-semibold text-muted-foreground cursor-pointer select-none hover:text-foreground transition-colors`} onClick={() => toggleSort(col.key)}>
                      <span className="inline-flex items-center gap-1">
                        {col.label}
                        {sortField === col.key ? (sortDir === "desc" ? <ArrowDown className="w-3 h-3" /> : <ArrowUp className="w-3 h-3" />) : <ArrowUpDown className="w-3 h-3 opacity-30" />}
                      </span>
                    </th>
                  ))}
                  <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground">Status</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-muted-foreground cursor-pointer select-none hover:text-foreground transition-colors" onClick={() => toggleSort("value")}>
                    <span className="inline-flex items-center gap-1 justify-end">
                      Valor
                      {sortField === "value" ? (sortDir === "desc" ? <ArrowDown className="w-3 h-3" /> : <ArrowUp className="w-3 h-3" />) : <ArrowUpDown className="w-3 h-3 opacity-30" />}
                    </span>
                  </th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody>
                {filtered.map(p => {
                  const sc = STATUS_CONFIG[p.status] || STATUS_CONFIG.sent;
                  const StatusIcon = sc.icon;
                  return (
                    <tr key={p.id} className="border-b border-border hover:bg-muted/40 transition-colors group">
                      <td className="px-4 py-3 font-mono text-xs text-muted-foreground">#{p.number || "—"}</td>
                      <td className="px-4 py-3">
                        <span className="font-medium text-foreground">{p.title}</span>
                        {p.proposal_type && (() => {
                          const tc = TYPE_CONFIG[p.proposal_type];
                          if (!tc) return null;
                          const TypeIcon = tc.icon;
                          return (
                            <span className={`ml-2 inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold border ${tc.color} no-touch-min`}>
                              <TypeIcon className="w-2.5 h-2.5" /> {tc.label}
                            </span>
                          );
                        })()}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">{p.client_name || "—"}</td>
                      <td className="px-4 py-3 text-xs text-muted-foreground">
                        {p.created_date ? format(new Date(p.created_date), "dd/MM/yyyy") : "—"}
                      </td>
                      <td className="px-4 py-3 text-xs text-muted-foreground">
                        {p.valid_until ? format(new Date(p.valid_until), "dd/MM/yyyy") : "—"}
                      </td>
                      <td className="px-4 py-3">
                        <Badge className={`${sc.color} border-0 text-xs flex items-center gap-1 w-fit`}>
                          <StatusIcon className="w-3 h-3" />
                          {sc.label}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 text-right font-bold text-foreground">
                        {p.total_amount ? `R$ ${p.total_amount.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}` : "—"}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1">
                          {(p.status === "sent" || p.status === "expired") && (
                            <>
                              <Button variant="outline" size="sm" className="h-7 px-2.5 text-green-600 border-green-200 hover:bg-green-50 gap-1 text-xs font-medium" onClick={() => requestApprove(p)}>
                                <CheckCircle2 className="w-3.5 h-3.5" /> Aprovar
                              </Button>
                              <Button variant="outline" size="sm" className="h-7 px-2.5 text-red-600 border-red-200 hover:bg-red-50 gap-1 text-xs font-medium" onClick={() => requestReject(p)}>
                                <XCircle className="w-3.5 h-3.5" /> Recusar
                              </Button>
                            </>
                          )}
                          <Button variant="ghost" size="icon" className="w-7 h-7 opacity-0 group-hover:opacity-100 transition-opacity" onClick={() => openEdit(p)} title="Editar">
                            <Pencil className="w-3.5 h-3.5" />
                          </Button>
                          <Button variant="ghost" size="icon" className="w-7 h-7 text-destructive/60 hover:text-destructive opacity-0 group-hover:opacity-100 transition-opacity" onClick={() => requestDelete(p)} title="Excluir">
                            <Trash2 className="w-3.5 h-3.5" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Mobile cards */}
          <div className="md:hidden space-y-3">
            {filtered.map(p => {
              const sc = STATUS_CONFIG[p.status] || STATUS_CONFIG.sent;
              const StatusIcon = sc.icon;
              return (
                <div key={p.id} className="glass-card p-4" onClick={() => openEdit(p)}>
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-sm font-bold text-foreground truncate">{p.title}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">{p.client_name || "Sem cliente"}</p>
                    </div>
                    <Badge className={`${sc.color} border-0 text-xs flex items-center gap-1 flex-shrink-0`}>
                      <StatusIcon className="w-3 h-3" /> {sc.label}
                    </Badge>
                  </div>
                  <div className="flex items-center justify-between mt-2">
                    <span className="text-xs text-muted-foreground">
                      #{p.number || "—"} • {p.valid_until ? format(new Date(p.valid_until), "dd/MM/yyyy") : "Sem validade"}
                    </span>
                    <span className="text-sm font-bold text-foreground">
                      {p.total_amount ? `R$ ${p.total_amount.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}` : "—"}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}

      {/* Confirm Modal — Delete */}
      <ConfirmDeleteModal
        title={confirmModal?.type === "delete" ? "Excluir proposta?" : confirmModal?.type === "approve" ? "Aprovar proposta?" : "Recusar proposta?"}
        itemName={confirmModal?.proposal?.title || ""}
        message={
          confirmModal?.type === "delete"
            ? "Esta ação não pode ser desfeita."
            : confirmModal?.type === "approve"
            ? "A proposta será marcada como aprovada."
            : "A proposta será marcada como recusada."
        }
        isOpen={!!confirmModal}
        onConfirm={executeConfirm}
        onCancel={() => setConfirmModal(null)}
      />

      {/* Form Modal */}
      {showForm && (
        <ProposalFormModal
          proposal={editingProposal}
          onClose={() => { setShowForm(false); setEditingProposal(null); }}
          onSaved={() => { setShowForm(false); setEditingProposal(null); loadProposals(); }}
        />
      )}
    </div>
  );
}