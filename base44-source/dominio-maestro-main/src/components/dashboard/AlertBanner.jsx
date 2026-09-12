export default function AlertBanner({ count, label, color, icon: Icon }) {
  return (
    <div className={`flex items-center gap-3 px-4 py-3 rounded-xl border ${color}`}>
      <Icon className="w-4 h-4 flex-shrink-0" />
      <span className="text-sm font-semibold">{count} {label}</span>
    </div>
  );
}