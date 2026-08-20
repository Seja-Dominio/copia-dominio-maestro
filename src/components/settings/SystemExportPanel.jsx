import { useState, useMemo } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { FileDown, FileCode, Loader2 } from "lucide-react";
import { format } from "date-fns";
import { isMaster, isGestor } from "@/lib/accessControl";
import RequestMasterApproval from "@/components/RequestMasterApproval";

export default function SystemExportPanel() {
  const [loadingReport, setLoadingReport] = useState(false);
  const [loadingBlueprint, setLoadingBlueprint] = useState(false);

  const collaborator = useMemo(() => {
    try { return JSON.parse(sessionStorage.getItem("collaborator") || "null"); } catch { return null; }
  }, []);

  const userIsMaster = isMaster(collaborator);
  const userIsGestor = isGestor(collaborator);

  const downloadMd = (markdown, filename) => {
    const blob = new Blob([markdown], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleReport = async () => {
    setLoadingReport(true);
    try {
      const res = await base44.functions.invoke("generateSystemReport", {});
      const { markdown, filename } = res.data;
      downloadMd(markdown, filename || `relatorio-sistema-${format(new Date(), "yyyy-MM-dd")}.md`);
    } catch (err) {
      console.error("Erro ao gerar relatório:", err);
      alert("Erro ao gerar relatório. Tente novamente.");
    } finally {
      setLoadingReport(false);
    }
  };

  const handleBlueprint = async () => {
    setLoadingBlueprint(true);
    try {
      const res = await base44.functions.invoke("exportSystemBlueprint", {});
      const { markdown, filename } = res.data;
      downloadMd(markdown, filename || `dominio-maestro-blueprint-${format(new Date(), "yyyy-MM-dd")}.md`);
    } catch (err) {
      console.error("Erro ao gerar blueprint:", err);
      alert("Erro ao gerar blueprint. Tente novamente.");
    } finally {
      setLoadingBlueprint(false);
    }
  };

  return (
    <div className="p-6 max-w-2xl space-y-6">
      <div className="flex items-center gap-3 mb-2">
        <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
          <FileCode className="w-5 h-5 text-primary" />
        </div>
        <div>
          <h3 className="text-base font-semibold text-foreground">Exportação do Sistema</h3>
          <p className="text-sm text-muted-foreground">Baixe relatórios e documentação técnica completa</p>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        {/* Relatório operacional */}
        <div className="border border-border rounded-xl p-4 space-y-3">
          <div className="flex items-center gap-2">
            <FileDown className="w-5 h-5 text-primary" />
            <h4 className="text-sm font-semibold">Relatório Operacional</h4>
          </div>
          <p className="text-xs text-muted-foreground leading-relaxed">
            Estado atual do sistema: clientes, projetos, jobs ativos, atrasados, carga por colaborador, subtarefas pendentes.
          </p>
          {userIsMaster ? (
            <Button onClick={handleReport} disabled={loadingReport} className="w-full gap-2" size="sm">
              {loadingReport ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileDown className="w-4 h-4" />}
              {loadingReport ? "Gerando..." : "Baixar Relatório .md"}
            </Button>
          ) : userIsGestor ? (
            <RequestMasterApproval
              actionType="download_report"
              description="Baixar relatório operacional (.md)"
              label="Solicitar download ao Master"
              className="w-full"
            />
          ) : null}
        </div>

        {/* Blueprint completo */}
        <div className="border border-primary/30 rounded-xl p-4 space-y-3 bg-primary/5">
          <div className="flex items-center gap-2">
            <FileCode className="w-5 h-5 text-primary" />
            <h4 className="text-sm font-semibold">Blueprint Completo (Rebuild)</h4>
          </div>
          <p className="text-xs text-muted-foreground leading-relaxed">
            Documentação completa: schemas, tecnologias, fluxos, templates, configs, colaboradores, aconselhamento para rebuild 100% fiel.
          </p>
          {userIsMaster ? (
            <Button onClick={handleBlueprint} disabled={loadingBlueprint} variant="default" className="w-full gap-2" size="sm">
              {loadingBlueprint ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileCode className="w-4 h-4" />}
              {loadingBlueprint ? "Gerando..." : "Baixar Sistema .md"}
            </Button>
          ) : userIsGestor ? (
            <RequestMasterApproval
              actionType="download_blueprint"
              description="Baixar blueprint do sistema (.md)"
              label="Solicitar download ao Master"
              className="w-full"
            />
          ) : null}
        </div>
      </div>
    </div>
  );
}