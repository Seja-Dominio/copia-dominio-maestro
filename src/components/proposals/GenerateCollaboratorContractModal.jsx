import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { X, Users, Download, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { format } from "date-fns";

export default function GenerateCollaboratorContractModal({ onClose }) {
  const [collaborators, setCollaborators] = useState([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [generatedHtml, setGeneratedHtml] = useState(null);

  const [form, setForm] = useState({
    collaborator_id: "",
    collaborator_name: "",
    collaborator_email: "",
    collaborator_role: "",
    collaborator_phone: "",
    monthly_salary: "",
    hourly_rate: "",
    contract_type: "PJ",
    contract_duration: "12",
    start_date: format(new Date(), "yyyy-MM-dd"),
    end_date: "",
    work_hours: "40",
    payment_day: "5",
    payment_method: "Transferência bancária (PIX)",
    confidentiality: true,
    non_compete: true,
    observations: "",
  });

  useEffect(() => {
    base44.entities.Collaborator.list("name", 200).then(c => { setCollaborators(c); setLoading(false); });
  }, []);

  function selectCollaborator(collabId) {
    const c = collaborators.find(cl => cl.id === collabId);
    if (!c) return;
    setForm(f => ({
      ...f,
      collaborator_id: c.id,
      collaborator_name: c.name || "",
      collaborator_email: c.email || "",
      collaborator_role: c.role || "",
      collaborator_phone: c.phone || "",
      monthly_salary: c.monthly_salary?.toString() || "",
      hourly_rate: c.hourly_rate?.toString() || "",
      end_date: c.contract_end_date || "",
    }));
  }

  async function generate() {
    setGenerating(true);
    const prompt = `Gere um contrato de prestação de serviços para colaborador (PJ/Freelancer) profissional em HTML estilizado (inline CSS, fonte Arial, cores corporativas azul #1e5a99 e cinza escuro) para a agência de marketing "Domínio Performance". Dados:

CONTRATANTE:
- Domínio Performance (agência de marketing digital)

CONTRATADO(A):
- Nome: ${form.collaborator_name}
- E-mail: ${form.collaborator_email || "Não informado"}
- Telefone: ${form.collaborator_phone || "Não informado"}
- Cargo/Função: ${form.collaborator_role || "Não informado"}

TERMOS:
- Tipo de contrato: ${form.contract_type}
- Remuneração mensal: R$ ${form.monthly_salary || "A definir"}
- Valor hora: R$ ${form.hourly_rate || "A definir"}
- Vigência: ${form.contract_duration} meses
- Data de início: ${form.start_date ? format(new Date(form.start_date + "T12:00:00"), "dd/MM/yyyy") : "A definir"}
${form.end_date ? `- Data de término: ${format(new Date(form.end_date + "T12:00:00"), "dd/MM/yyyy")}` : ""}
- Carga horária semanal: ${form.work_hours}h
- Dia de pagamento: todo dia ${form.payment_day}
- Forma de pagamento: ${form.payment_method}
- Cláusula de confidencialidade: ${form.confidentiality ? "Sim" : "Não"}
- Cláusula de não-concorrência: ${form.non_compete ? "Sim" : "Não"}
- Observações: ${form.observations || "Nenhuma"}

O contrato deve conter as seguintes cláusulas:
1. OBJETO DO CONTRATO
2. OBRIGAÇÕES DO CONTRATADO
3. OBRIGAÇÕES DO CONTRATANTE
4. REMUNERAÇÃO E FORMA DE PAGAMENTO
5. PRAZO E VIGÊNCIA
6. JORNADA DE TRABALHO
7. RESCISÃO CONTRATUAL
8. CONFIDENCIALIDADE E SIGILO
9. PROPRIEDADE INTELECTUAL
10. NÃO-CONCORRÊNCIA (se aplicável)
11. DISPOSIÇÕES GERAIS
12. FORO

Inclua campos de assinatura para ambas as partes com local e data.
Retorne APENAS o HTML, sem markdown, sem blocos de código.`;

    const result = await base44.integrations.Core.InvokeLLM({ prompt, model: "gemini_3_flash" });
    let html = result;
    if (typeof html === "object") html = html.text || html.content || JSON.stringify(html);
    html = html.replace(/```html?\n?/gi, "").replace(/```\n?/gi, "").trim();
    setGeneratedHtml(html);
    setGenerating(false);
  }

  function downloadHtml() {
    if (!generatedHtml) return;
    const blob = new Blob([generatedHtml], { type: "text/html" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `Contrato_Colaborador_${form.collaborator_name || "colaborador"}.html`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function printDoc() {
    if (!generatedHtml) return;
    const win = window.open("", "_blank");
    win.document.write(generatedHtml);
    win.document.close();
    setTimeout(() => win.print(), 500);
  }

  return (
    <div className="fixed inset-0 z-[100] bg-black/40 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-card rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-3 border-b border-border">
          <div className="flex items-center gap-2">
            <Users className="w-5 h-5 text-purple-600" />
            <h2 className="text-sm font-bold text-foreground">Gerar Contrato de Colaborador</h2>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-lg hover:bg-muted flex items-center justify-center"><X className="w-4 h-4" /></button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {generatedHtml ? (
            <div>
              <div className="flex gap-2 mb-4">
                <Button onClick={downloadHtml} className="gap-2" size="sm"><Download className="w-4 h-4" /> Baixar HTML</Button>
                <Button onClick={printDoc} variant="outline" size="sm">Imprimir / PDF</Button>
                <Button onClick={() => setGeneratedHtml(null)} variant="ghost" size="sm">← Voltar</Button>
              </div>
              <div className="border border-border rounded-xl overflow-hidden bg-white">
                <iframe srcDoc={generatedHtml} className="w-full" style={{ height: 600, border: "none" }} title="Contrato" />
              </div>
            </div>
          ) : (
            <>
              <div>
                <label className="text-xs font-semibold text-muted-foreground uppercase block mb-1">Colaborador</label>
                <select className="w-full h-9 rounded-lg border border-input bg-background px-3 text-sm" value={form.collaborator_id} onChange={e => selectCollaborator(e.target.value)}>
                  <option value="">Selecione um colaborador...</option>
                  {collaborators.map(c => <option key={c.id} value={c.id}>{c.name} — {c.role || "Sem cargo"}</option>)}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-muted-foreground uppercase block mb-1">Nome completo</label>
                  <Input className="h-9 text-sm" value={form.collaborator_name} onChange={e => setForm(f => ({ ...f, collaborator_name: e.target.value }))} />
                </div>
                <div>
                  <label className="text-xs font-semibold text-muted-foreground uppercase block mb-1">Cargo / Função</label>
                  <Input className="h-9 text-sm" value={form.collaborator_role} onChange={e => setForm(f => ({ ...f, collaborator_role: e.target.value }))} />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-muted-foreground uppercase block mb-1">E-mail</label>
                  <Input className="h-9 text-sm" value={form.collaborator_email} onChange={e => setForm(f => ({ ...f, collaborator_email: e.target.value }))} />
                </div>
                <div>
                  <label className="text-xs font-semibold text-muted-foreground uppercase block mb-1">Telefone</label>
                  <Input className="h-9 text-sm" value={form.collaborator_phone} onChange={e => setForm(f => ({ ...f, collaborator_phone: e.target.value }))} />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="text-xs font-semibold text-muted-foreground uppercase block mb-1">Tipo Contrato</label>
                  <select className="w-full h-9 rounded-lg border border-input bg-background px-3 text-sm" value={form.contract_type} onChange={e => setForm(f => ({ ...f, contract_type: e.target.value }))}>
                    <option value="PJ">PJ (Pessoa Jurídica)</option>
                    <option value="Freelancer">Freelancer</option>
                    <option value="Estagiario">Estagiário</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs font-semibold text-muted-foreground uppercase block mb-1">Salário Mensal (R$)</label>
                  <Input className="h-9 text-sm" type="number" value={form.monthly_salary} onChange={e => setForm(f => ({ ...f, monthly_salary: e.target.value }))} />
                </div>
                <div>
                  <label className="text-xs font-semibold text-muted-foreground uppercase block mb-1">Valor Hora (R$)</label>
                  <Input className="h-9 text-sm" type="number" value={form.hourly_rate} onChange={e => setForm(f => ({ ...f, hourly_rate: e.target.value }))} />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="text-xs font-semibold text-muted-foreground uppercase block mb-1">Vigência (meses)</label>
                  <Input className="h-9 text-sm" type="number" value={form.contract_duration} onChange={e => setForm(f => ({ ...f, contract_duration: e.target.value }))} />
                </div>
                <div>
                  <label className="text-xs font-semibold text-muted-foreground uppercase block mb-1">Data Início</label>
                  <Input className="h-9 text-sm" type="date" value={form.start_date} onChange={e => setForm(f => ({ ...f, start_date: e.target.value }))} />
                </div>
                <div>
                  <label className="text-xs font-semibold text-muted-foreground uppercase block mb-1">Data Término</label>
                  <Input className="h-9 text-sm" type="date" value={form.end_date} onChange={e => setForm(f => ({ ...f, end_date: e.target.value }))} />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="text-xs font-semibold text-muted-foreground uppercase block mb-1">Carga horária/sem</label>
                  <Input className="h-9 text-sm" type="number" value={form.work_hours} onChange={e => setForm(f => ({ ...f, work_hours: e.target.value }))} />
                </div>
                <div>
                  <label className="text-xs font-semibold text-muted-foreground uppercase block mb-1">Dia Pagamento</label>
                  <Input className="h-9 text-sm" type="number" value={form.payment_day} onChange={e => setForm(f => ({ ...f, payment_day: e.target.value }))} />
                </div>
                <div>
                  <label className="text-xs font-semibold text-muted-foreground uppercase block mb-1">Forma Pagamento</label>
                  <Input className="h-9 text-sm" value={form.payment_method} onChange={e => setForm(f => ({ ...f, payment_method: e.target.value }))} />
                </div>
              </div>

              <div className="flex items-center gap-6">
                <label className="flex items-center gap-2 text-xs font-semibold text-foreground cursor-pointer">
                  <input type="checkbox" className="rounded" checked={form.confidentiality} onChange={e => setForm(f => ({ ...f, confidentiality: e.target.checked }))} />
                  Cláusula de Confidencialidade
                </label>
                <label className="flex items-center gap-2 text-xs font-semibold text-foreground cursor-pointer">
                  <input type="checkbox" className="rounded" checked={form.non_compete} onChange={e => setForm(f => ({ ...f, non_compete: e.target.checked }))} />
                  Cláusula de Não-Concorrência
                </label>
              </div>

              <div>
                <label className="text-xs font-semibold text-muted-foreground uppercase block mb-1">Observações</label>
                <textarea className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none resize-none" rows={3}
                  value={form.observations} onChange={e => setForm(f => ({ ...f, observations: e.target.value }))} />
              </div>
            </>
          )}
        </div>

        {!generatedHtml && (
          <div className="px-5 py-3 border-t border-border flex justify-end gap-2">
            <Button variant="outline" onClick={onClose}>Cancelar</Button>
            <Button onClick={generate} disabled={generating || !form.collaborator_name} className="gap-2">
              {generating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Users className="w-4 h-4" />}
              {generating ? "Gerando..." : "Gerar Contrato"}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}