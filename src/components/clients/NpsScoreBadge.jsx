export function getNpsColor(score) {
  if (score >= 90) return { bg: "bg-green-500", text: "text-white", ring: "ring-green-400", label: "Excelente", light: "bg-green-100 text-green-700" };
  if (score >= 70) return { bg: "bg-amber-400", text: "text-white", ring: "ring-amber-300", label: "Bom", light: "bg-amber-100 text-amber-700" };
  return { bg: "bg-red-500", text: "text-white", ring: "ring-red-400", label: "Crítico", light: "bg-red-100 text-red-700" };
}

export default function NpsScoreBadge({ score, size = "md" }) {
  const c = getNpsColor(score ?? 100);
  const sz = size === "lg" ? "w-14 h-14 text-xl font-black" : size === "sm" ? "w-8 h-8 text-xs font-black" : "w-11 h-11 text-sm font-black";
  return (
    <div className={`${sz} rounded-full ${c.bg} ${c.text} ring-2 ${c.ring} flex items-center justify-center flex-shrink-0`}>
      {score ?? "—"}
    </div>
  );
}