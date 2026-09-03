export default function StatCard({ title, value, sub, icon: Icon, color, href }) {
  const inner = (
    <div className="bg-card border border-border rounded-2xl p-5 flex items-center gap-4 shadow-sm hover:shadow-md transition-shadow cursor-pointer">
      <div className={`w-12 h-12 ${color} rounded-2xl flex items-center justify-center flex-shrink-0`}>
        <Icon className="w-5 h-5 text-white" />
      </div>
      <div className="min-w-0">
        <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">{title}</p>
        <p className="text-2xl font-black text-foreground leading-tight">{value}</p>
        {sub && <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>}
      </div>
    </div>
  );
  if (href) return <a href={href} className="no-underline block">{inner}</a>;
  return inner;
}