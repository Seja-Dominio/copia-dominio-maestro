import { useState, useEffect, useRef, useCallback } from "react";
import { base44 } from "@/api/base44Client";
import { Check, X } from "lucide-react";

const spellCache = new Map();
const globalDismissed = new Set();

export default function SpellCheckTextarea({
  value,
  onChange,
  onBlur,
  autoFocus,
  placeholder,
  rows = 4,
  className = "",
  spellCheckEnabled = true,
}) {
  const [errors, setErrors] = useState([]);
  const [checking, setChecking] = useState(false);
  const [showPanel, setShowPanel] = useState(false);
  const textareaRef = useRef(null);
  const debounceRef = useRef(null);
  const lastCheckedRef = useRef("");
  const panelRef = useRef(null);

  const checkSpelling = useCallback(async (text) => {
    if (!text || text.trim().length < 10 || !spellCheckEnabled) {
      setErrors([]);
      return;
    }
    if (lastCheckedRef.current === text) return;
    if (spellCache.has(text)) {
      setErrors(spellCache.get(text));
      lastCheckedRef.current = text;
      return;
    }

    setChecking(true);
    try {
      const result = await base44.integrations.Core.InvokeLLM({
        prompt: `Analise o seguinte texto em português e encontre APENAS erros ortográficos e gramaticais claros. Não sugira mudanças de estilo. Retorne um array de erros encontrados.

Texto: "${text}"

Para cada erro, retorne:
- "wrong": a palavra/trecho exato como está no texto
- "suggestion": a correção sugerida
- "reason": breve explicação (máximo 5 palavras)

Se não houver erros, retorne um array vazio.`,
        response_json_schema: {
          type: "object",
          properties: {
            errors: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  wrong: { type: "string" },
                  suggestion: { type: "string" },
                  reason: { type: "string" },
                },
              },
            },
          },
        },
      });

      const foundErrors = result?.errors || [];
      const mappedErrors = [];
      for (const err of foundErrors) {
        const idx = text.toLowerCase().indexOf(err.wrong.toLowerCase());
        if (idx !== -1) {
          mappedErrors.push({
            id: `${idx}-${err.wrong}`,
            start: idx,
            end: idx + err.wrong.length,
            wrong: text.substring(idx, idx + err.wrong.length),
            suggestion: err.suggestion,
            reason: err.reason,
          });
        }
      }

      const filtered = mappedErrors.filter(e => !globalDismissed.has(`${e.wrong.toLowerCase()}|${e.suggestion.toLowerCase()}`));
      spellCache.set(text, filtered);
      lastCheckedRef.current = text;
      setErrors(filtered);
      if (filtered.length > 0) setShowPanel(true);
    } catch {
      // silently fail
    } finally {
      setChecking(false);
    }
  }, [spellCheckEnabled]);

  useEffect(() => {
    if (!spellCheckEnabled) { setErrors([]); return; }
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => checkSpelling(value), 2000);
    return () => clearTimeout(debounceRef.current);
  }, [value, checkSpelling, spellCheckEnabled]);

  // Close panel on outside click
  useEffect(() => {
    if (!showPanel) return;
    const handler = (e) => {
      if (panelRef.current && !panelRef.current.contains(e.target)) {
        setShowPanel(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [showPanel]);

  const handleApply = (error) => {
    if (!onChange) return;
    const before = value.substring(0, error.start);
    const after = value.substring(error.end);
    const newText = before + error.suggestion + after;
    onChange({ target: { value: newText } });
    setErrors((prev) => prev.filter((e) => e.id !== error.id));
    spellCache.delete(value);
    lastCheckedRef.current = "";
    if (errors.length <= 1) setShowPanel(false);
  };

  const handleDismiss = (error) => {
    globalDismissed.add(`${error.wrong.toLowerCase()}|${error.suggestion.toLowerCase()}`);
    setErrors((prev) => prev.filter((e) => e.id !== error.id));
    if (errors.length <= 1) setShowPanel(false);
  };

  const handleDismissAll = () => {
    setErrors([]);
    setShowPanel(false);
  };

  return (
    <div className="relative">
      <textarea
        ref={textareaRef}
        className={`w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring resize-none text-foreground overflow-y-auto ${className}`}
        rows={rows}
        placeholder={placeholder}
        value={value || ""}
        onChange={onChange}
        onBlur={onBlur}
        autoFocus={autoFocus}
      />

      {/* Checking indicator */}
      {checking && (
        <div className="absolute top-1.5 right-2 flex items-center gap-1">
          <div className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
          <span className="text-[9px] text-muted-foreground">Verificando...</span>
        </div>
      )}

      {/* Error count badge — clickable to open panel */}
      {errors.length > 0 && !checking && (
        <button
          type="button"
          onClick={() => setShowPanel((v) => !v)}
          className="absolute top-1.5 right-2 flex items-center gap-1 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-full px-2 py-0.5 hover:bg-red-100 dark:hover:bg-red-900/30 transition-colors"
        >
          <div className="w-1.5 h-1.5 rounded-full bg-red-500" />
          <span className="text-[9px] text-red-500 font-semibold">
            {errors.length} {errors.length === 1 ? "erro" : "erros"}
          </span>
        </button>
      )}

      {/* Corrections panel — compact inline */}
      {showPanel && errors.length > 0 && (
        <div ref={panelRef} className="mt-1 w-full z-[9999]">
          <div className="flex flex-wrap gap-1.5 items-center">
            {errors.map((err) => (
              <div key={err.id} className="inline-flex items-center gap-1 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-full px-2 py-0.5 text-[10px]">
                <span className="line-through text-red-400">{err.wrong}</span>
                <span className="text-muted-foreground">→</span>
                <button type="button" onClick={() => handleApply(err)} className="font-bold text-green-600 hover:underline">{err.suggestion}</button>
                <button type="button" onClick={() => handleDismiss(err)} className="text-muted-foreground hover:text-foreground ml-0.5"><X className="w-2.5 h-2.5" /></button>
              </div>
            ))}
            <button type="button" onClick={handleDismissAll} className="text-[9px] text-muted-foreground hover:text-foreground font-semibold px-1">Ignorar todas</button>
          </div>
        </div>
      )}
    </div>
  );
}