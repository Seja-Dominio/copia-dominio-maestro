import { useState, useEffect } from "react";

export default function TestPages() {
  const [out, setOut] = useState("Running...");

  useEffect(() => {
    const r = [];
    const t = async (n, f) => {
      try { await f(); r.push(n + " ✅"); } 
      catch(e) { r.push(n + " ❌ " + e.message.slice(0,80)); }
      setOut(r.join("\n"));
    };

    (async () => {
      r.push("═══ REMAINING PAGES ═══\n");
      await t("Jobs", () => import("./Jobs.jsx"));
      await t("Projects", () => import("./Projects.jsx"));
      await t("Agenda", () => import("./Agenda.jsx"));
      await t("ClientPortfolio", () => import("./ClientPortfolio.jsx"));
      await t("Proposals", () => import("./Proposals.jsx"));
      await t("Reports", () => import("./Reports.jsx"));
      await t("Records", () => import("./Records.jsx"));
      await t("Configuracoes", () => import("./Configuracoes.jsx"));
      await t("Templates", () => import("./Templates.jsx"));
      await t("Documentos", () => import("./Documentos.jsx"));
      await t("Conversations", () => import("./Conversations.jsx"));
      await t("Media", () => import("./Media.jsx"));
      await t("Production", () => import("./Production.jsx"));
      await t("Settings", () => import("./Settings.jsx"));
      await t("JobApproval", () => import("./JobApproval.jsx"));

      const ok = r.filter(l => l.includes("✅")).length;
      const fail = r.filter(l => l.includes("❌")).length;
      r.push(`\n══ ${ok} OK | ${fail} FAIL ══`);
      setOut(r.join("\n"));
    })();
  }, []);

  return <pre style={{padding:20,fontSize:13,fontFamily:"monospace",whiteSpace:"pre-wrap",lineHeight:1.6}}>{out}</pre>;
}