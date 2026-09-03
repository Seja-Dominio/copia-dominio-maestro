import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Globe, Check } from "lucide-react";
import { useAppConfig } from "@/lib/AppConfigContext";

const TIMEZONES = [
  { value: "Pacific/Midway",       label: "GMT -11:00 — Midway" },
  { value: "Pacific/Honolulu",     label: "GMT -10:00 — Honolulu" },
  { value: "America/Anchorage",    label: "GMT -09:00 — Anchorage" },
  { value: "America/Los_Angeles",  label: "GMT -08:00 — Los Angeles" },
  { value: "America/Denver",       label: "GMT -07:00 — Denver" },
  { value: "America/Chicago",      label: "GMT -06:00 — Chicago" },
  { value: "America/New_York",     label: "GMT -05:00 — New York" },
  { value: "America/Manaus",       label: "GMT -04:00 — Manaus" },
  { value: "America/Sao_Paulo",    label: "GMT -03:00 — São Paulo / Brasília" },
  { value: "America/Noronha",      label: "GMT -02:00 — Fernando de Noronha" },
  { value: "Atlantic/Azores",      label: "GMT -01:00 — Açores" },
  { value: "Europe/London",        label: "GMT +00:00 — Londres" },
  { value: "Europe/Paris",         label: "GMT +01:00 — Paris / Berlim" },
  { value: "Europe/Helsinki",      label: "GMT +02:00 — Helsinki / Cairo" },
  { value: "Europe/Moscow",        label: "GMT +03:00 — Moscou" },
  { value: "Asia/Dubai",           label: "GMT +04:00 — Dubai" },
  { value: "Asia/Karachi",         label: "GMT +05:00 — Karachi" },
  { value: "Asia/Kolkata",         label: "GMT +05:30 — Índia" },
  { value: "Asia/Dhaka",           label: "GMT +06:00 — Dhaka" },
  { value: "Asia/Bangkok",         label: "GMT +07:00 — Bangkok" },
  { value: "Asia/Shanghai",        label: "GMT +08:00 — Pequim / Singapura" },
  { value: "Asia/Tokyo",           label: "GMT +09:00 — Tóquio" },
  { value: "Australia/Sydney",     label: "GMT +10:00 — Sydney" },
  { value: "Pacific/Noumea",       label: "GMT +11:00 — Nouméa" },
  { value: "Pacific/Auckland",     label: "GMT +12:00 — Auckland" },
];

export default function TimezoneConfig() {
  const { timezone, refreshTimezone } = useAppConfig();
  const [selected, setSelected] = useState(timezone || "America/Manaus");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    setSelected(timezone || "America/Manaus");
  }, [timezone]);

  const handleSave = async () => {
    setSaving(true);
    const existing = await base44.entities.AppConfig.filter({ key: "system_timezone" });
    if (existing.length > 0) {
      await base44.entities.AppConfig.update(existing[0].id, { value: { timezone: selected } });
    } else {
      await base44.entities.AppConfig.create({ key: "system_timezone", value: { timezone: selected } });
    }
    await refreshTimezone();
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  return (
    <div className="p-6 max-w-lg">
      <div className="flex items-center gap-3 mb-6">
        <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
          <Globe className="w-5 h-5 text-primary" />
        </div>
        <div>
          <h3 className="text-base font-semibold text-foreground">Fuso Horário do Sistema</h3>
          <p className="text-sm text-muted-foreground">Define o horário base para todo o sistema</p>
        </div>
      </div>

      <div className="space-y-4">
        <Select value={selected} onValueChange={setSelected}>
          <SelectTrigger className="w-full">
            <SelectValue placeholder="Selecione o fuso horário" />
          </SelectTrigger>
          <SelectContent>
            {TIMEZONES.map(tz => (
              <SelectItem key={tz.value} value={tz.value}>
                {tz.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Button onClick={handleSave} disabled={saving || selected === timezone} className="gap-2">
          {saved ? <Check className="w-4 h-4" /> : null}
          {saving ? "Salvando..." : saved ? "Salvo!" : "Salvar"}
        </Button>
      </div>
    </div>
  );
}