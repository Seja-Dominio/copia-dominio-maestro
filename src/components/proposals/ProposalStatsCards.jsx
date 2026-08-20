import { FileText, Send, CheckCircle2, XCircle, TrendingUp, DollarSign, Clock } from "lucide-react";

const fmt = (val) => `R$ ${val.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`;

export default function ProposalStatsCards({ proposals }) {
  const totalCount = proposals.length;
  const totalVal = proposals.reduce((s, p) => s + (p.total_amount || 0), 0);

  const sent = proposals.filter(p => p.status === "sent");
  const approved = proposals.filter(p => p.status === "approved");
  const rejected = proposals.filter(p => p.status === "rejected");
  const expired = proposals.filter(p => p.status === "expired");

  const sentVal = sent.reduce((s, p) => s + (p.total_amount || 0), 0);
  const approvedVal = approved.reduce((s, p) => s + (p.total_amount || 0), 0);
  const rejectedVal = rejected.reduce((s, p) => s + (p.total_amount || 0), 0);
  const expiredVal = expired.reduce((s, p) => s + (p.total_amount || 0), 0);

  const decided = approved.length + rejected.length;
  const conversionRate = decided > 0 ? ((approved.length / decided) * 100).toFixed(0) : "—";

  const cards = [
    { label: `Total (${totalCount})`, value: fmt(totalVal), icon: FileText, color: "text-foreground", bg: "bg-muted/50" },
    { label: `Enviadas (${sent.length})`, value: fmt(sentVal), icon: Send, color: "text-blue-600", bg: "bg-blue-50" },
    { label: `Aprovadas (${approved.length})`, value: fmt(approvedVal), icon: CheckCircle2, color: "text-green-600", bg: "bg-green-50" },
    { label: `Recusadas (${rejected.length})`, value: fmt(rejectedVal), icon: XCircle, color: "text-red-600", bg: "bg-red-50" },
    { label: `Vencidas (${expired.length})`, value: fmt(expiredVal), icon: Clock, color: "text-orange-600", bg: "bg-orange-50" },
    {
      label: "Taxa de Conversão",
      value: conversionRate === "—" ? "—" : `${conversionRate}%`,
      icon: TrendingUp,
      color: Number(conversionRate) >= 50 ? "text-green-600" : "text-amber-600",
      bg: Number(conversionRate) >= 50 ? "bg-green-50" : "bg-amber-50",
    },
  ];

  return (
    <div className="space-y-3">
      <div className="flex flex-col lg:flex-row gap-3">
        {/* Status cards */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 flex-1 min-w-0">
          {cards.map(c => (
            <div key={c.label} className={`glass-card p-3 ${c.bg} flex flex-col items-center justify-center text-center min-w-0`}>
              <c.icon className={`w-4 h-4 ${c.color} mb-1`} />
              <p className={`text-sm font-black ${c.color} leading-tight whitespace-nowrap`}>{c.value}</p>
              <p className="text-[10px] text-muted-foreground mt-0.5 truncate w-full">{c.label}</p>
            </div>
          ))}
        </div>
        {/* Valor total aprovado */}
        <div className="glass-card p-4 bg-primary/5 flex items-center gap-3 lg:min-w-[240px] flex-shrink-0">
          <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0">
            <DollarSign className="w-5 h-5 text-primary" />
          </div>
          <div className="min-w-0">
            <p className="text-[10px] text-muted-foreground">Valor Total Aprovado</p>
            <p className="text-lg font-black text-foreground whitespace-nowrap">
              {fmt(approvedVal)}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}