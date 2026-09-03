/**
 * Utilitários de data centralizados — fuso configurável via AppConfig
 * Fallback: America/Manaus (GMT-4)
 */
import { getGlobalTimezone } from "@/lib/AppConfigContext";

function getTZ() {
  // Fuso fixo GMT-4 Manaus para todos os usuários do sistema
  return "America/Manaus";
}

/**
 * Retorna a data/hora atual no fuso do sistema como objeto Date ajustado.
 */
export function nowManaus() {
  return new Date(new Date().toLocaleString("en-US", { timeZone: getTZ() }));
}

/**
 * Retorna a string "yyyy-MM-dd" de hoje no fuso do sistema.
 */
export function todayStr() {
  const d = nowManaus();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/**
 * Retorna a string "yyyy-MM" do mês atual no fuso do sistema.
 */
export function currentMonthStr() {
  const d = nowManaus();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

/**
 * Formata uma data para exibição usando o fuso do sistema.
 * @param {Date|string} date
 * @param {object} options - Intl.DateTimeFormat options
 */
export function formatManaus(date, options = {}) {
  const d = typeof date === "string" ? new Date(date) : date;
  return d.toLocaleString("pt-BR", { timeZone: getTZ(), ...options });
}

/** Alias para compatibilidade */
export function TZ() { return getTZ(); }