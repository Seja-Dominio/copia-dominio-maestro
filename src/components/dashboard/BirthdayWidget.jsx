import { format, parseISO, addYears, differenceInDays } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Cake } from "lucide-react";

function getNextBirthday(birthdayStr) {
  if (!birthdayStr) return null;
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const bday = parseISO(birthdayStr);
    let next = new Date(today.getFullYear(), bday.getMonth(), bday.getDate());
    if (next < today) next = addYears(next, 1);
    return { date: next, diff: differenceInDays(next, today) };
  } catch {
    return null;
  }
}

export default function BirthdayWidget({ clients, collaborators }) {
  const upcoming = [];

  clients.forEach(c => {
    if (c.birthday) {
      const nb = getNextBirthday(c.birthday);
      if (nb && nb.diff <= 90) {
        upcoming.push({ name: c.name, type: "cliente", diff: nb.diff, date: nb.date, initial: c.name[0]?.toUpperCase(), color: "bg-violet-500" });
      }
    }
    // Contatos do cliente com aniversário
    (c.contacts || []).forEach(contact => {
      if (!contact.birthday || !contact.name) return;
      const nb = getNextBirthday(contact.birthday);
      if (!nb || nb.diff > 90) return;
      upcoming.push({ name: `${contact.name} (${c.name})`, type: "cliente", diff: nb.diff, date: nb.date, initial: contact.name[0]?.toUpperCase(), color: "bg-violet-500" });
    });
  });

  collaborators.forEach(c => {
    if (!c.birthday) return;
    const nb = getNextBirthday(c.birthday);
    if (!nb || nb.diff > 90) return;
    upcoming.push({ name: c.name, type: "equipe", diff: nb.diff, date: nb.date, initial: c.name[0]?.toUpperCase(), color: "bg-primary" });
  });

  upcoming.sort((a, b) => a.diff - b.diff);

  return (
    <div className="bg-card border border-border rounded-2xl overflow-hidden shadow-sm">
      <div className="flex items-center gap-2 px-5 py-4 border-b border-border">
        <div className="w-7 h-7 bg-pink-500 rounded-lg flex items-center justify-center">
          <Cake className="w-3.5 h-3.5 text-white" />
        </div>
        <h3 className="text-sm font-bold text-foreground">Aniversários — próximos 90 dias</h3>
        <span className="ml-auto text-xs bg-muted text-muted-foreground px-2 py-0.5 rounded-full font-semibold">{upcoming.length}</span>
      </div>

      {upcoming.length === 0 ? (
        <div className="py-8 text-center text-sm text-muted-foreground">
          <Cake className="w-8 h-8 mx-auto mb-2 opacity-30" />
          Nenhum aniversário nos próximos 90 dias
        </div>
      ) : (
        <div className="divide-y divide-border">
          {upcoming.slice(0, 8).map((item, i) => (
            <div key={i} className="flex items-center gap-3 px-5 py-2.5">
              <div className={`w-7 h-7 rounded-full ${item.color} flex items-center justify-center text-white text-xs font-bold flex-shrink-0`}>
                {item.initial}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold text-foreground truncate">{item.name}</p>
                <div className="flex items-center gap-1.5">
                  <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${item.type === "cliente" ? "bg-violet-100 text-violet-700" : "bg-primary/10 text-primary"}`}>
                    {item.type === "cliente" ? "Cliente" : "Equipe"}
                  </span>
                  <span className="text-[10px] text-muted-foreground">{format(item.date, "dd/MM", { locale: ptBR })}</span>
                </div>
              </div>
              <div className="flex-shrink-0 text-right">
                {item.diff === 0 ? (
                  <span className="text-xs font-black text-pink-600">🎉 Hoje!</span>
                ) : item.diff === 1 ? (
                  <span className="text-xs font-bold text-amber-600">Amanhã</span>
                ) : (
                  <span className="text-xs text-muted-foreground font-semibold">em {item.diff}d</span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}