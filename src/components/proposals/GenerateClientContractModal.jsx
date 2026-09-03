import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { X, Briefcase, Download, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { format } from "date-fns";

export default function GenerateClientContractModal({ onClose }) {
  const [clients, setClients] = useState([]);
  const [contracts, setContracts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [generatedHtml, setGeneratedHtml] = useState(null);

  const [form, setForm] = useState({
    client_id: "",
    client_name: "",
    company_name: "",
    cnpj: "",
    address: "",
    responsible: "",
    services: "",
    monthly_value: "",
    contract_duration: "12",
    start_date: format(new Date(), "yyyy-MM-dd"),
    billing_day: "10",
    payment_method: "Boleto bancário",
    termination_notice: "30",
    observations: "",
  });

  useEffect(() => {
    Promise.all([
      base44.entities.Client.list("name", 200),
      base44.entities.FeeContract.filter({ status: "active" }, "-created_date", 200),
    ]).then(([c, fc]) => { setClients(c); setContracts(fc); setLoading(false); });
  }, []);

  function selectClient(clientId) {
    const c = clients.find(cl => cl.id === clientId);
    if (!c) return;
    const fc = contracts.find(ct => ct.client_id === clientId);
    setForm(f => ({
      ...f,
      client_id: c.id,
      client_name: c.name || "",
      company_name: c.company_name || "",
      cnpj: c.cnpj || "",
      address: c.address || "",
      responsible: c.responsible || "",
      services: (c.services || []).join(", "),
      monthly_value: fc?.monthly_value?.toString() || f.monthly_value,
      billing_day: fc?.billing_day?.toString() || f.billing_day,
    }));
  }

  async function generate() {
    setGenerating(true);
    const prompt = `Gere um contrato de prestação de serviços profissional em HTML estilizado (inline CSS, fonte Arial, cores corporativas azul #1e5a99 e cinza escuro) para a agência de marketing "Domínio Performance". Dados:

CONTRATANTE:
- Nome Fantasia: ${form.client_name}
- Razão Social: ${form.company_name || "Não informada"}
- CNPJ: ${form.cnpj || "Não informado"}
- Endereço: ${form.address || "Não informado"}
- Representante: ${form.responsible || "Não informado"}

CONTRATADA:
- Domínio Performance (agência de marketing digital)

TERMOS:
- Serviços contratados: ${form.services || "Gestão de redes sociais e marketing digital"}
- Valor mensal: R$ ${form.monthly_value || "A definir"}
- Vigência: ${form.contract_duration} meses a partir de ${form.start_date ? format(new Date(form.start_date + "T12:00:00"), "dd/MM/yyyy") : "A definir"}
- Dia de faturamento: todo dia ${form.billing_day}
- Forma de pagamento: ${form.payment_method}
- Aviso prévio para rescisão: ${form.termination_notice} dias
- Observações: ${form.observations || "Nenhuma"}

O contrato deve conter as seguintes cláusulas:
1. OBJETO DO CONTRATO
2. OBRIGAÇÕES DA CONTRATADA
3. OBRIGAÇÕES DO CONTRATANTE
4. VALOR E FORMA DE PAGAMENTO
5. PRAZO E VIGÊNCIA
6. RESCISÃO CONTRATUAL
7. CONFIDENCIALIDADE
8. PROPRIEDADE INTELECTUAL
9. DISPOSIÇÕES GERAIS
10. FORO

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
    a.download = `Contrato_${form.client_name || "cliente"}.html`;
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
            <Briefcase className="w-5 h-5 text-emerald-600" />
            <h2 className="text-sm font-bold text-foreground">Gerar Contrato do Cliente</h2>
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
                <label className="text-xs font-semibold text-muted-foreground uppercase block mb-1">Cliente</label>
                <select className="w-full h-9 rounded-lg border border-input bg-background px-3 text-sm" value={form.client_id} onChange={e => selectClient(e.target.value)}>
                  <option value="">Selecione um cliente...</option>
                  {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-muted-foreground uppercase block mb-1">Razão Social</label>
                  <Input className="h-9 text-sm" value={form.company_name} onChange={e => setForm(f => ({ ...f, company_name: e.target.value }))} />
                </div>
                <div>
                  <label className="text-xs font-semibold text-muted-foreground uppercase block mb-1">CNPJ</label>
                  <Input className="h-9 text-sm" value={form.cnpj} onChange={e => setForm(f => ({ ...f, cnpj: e.target.value }))} />
                </div>
              </div>

              <div>
                <label className="text-xs font-semibold text-muted-foreground uppercase block mb-1">Endereço</label>
                <Input className="h-9 text-sm" value={form.address} onChange={e => setForm(f => ({ ...f, address: e.target.value }))} />
              </div>

              <div>
                <label className="text-xs font-semibold text-muted-foreground uppercase block mb-1">Serviços contratados</label>
                <Input className="h-9 text-sm" value={form.services} onChange={e => setForm(f => ({ ...f, services: e.target.value }))} />
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="text-xs font-semibold text-muted-foreground uppercase block mb-1">Valor Mensal (R$)</label>
                  <Input className="h-9 text-sm" type="number" value={form.monthly_value} onChange={e => setForm(f => ({ ...f, monthly_value: e.target.value }))} />
                </div>
                <div>
                  <label className="text-xs font-semibold text-muted-foreground uppercase block mb-1">Vigência (meses)</label>
                  <Input className="h-9 text-sm" type="number" value={form.contract_duration} onChange={e => setForm(f => ({ ...f, contract_duration: e.target.value }))} />
                </div>
                <div>
                  <label className="text-xs font-semibold text-muted-foreground uppercase block mb-1">Dia faturamento</label>
                  <Input className="h-9 text-sm" type="number" value={form.billing_day} onChange={e => setForm(f => ({ ...f, billing_day: e.target.value }))} />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-muted-foreground uppercase block mb-1">Forma de Pagamento</label>
                  <Input className="h-9 text-sm" value={form.payment_method} onChange={e => setForm(f => ({ ...f, payment_method: e.target.value }))} />
                </div>
                <div>
                  <label className="text-xs font-semibold text-muted-foreground uppercase block mb-1">Data de Início</label>
                  <Input className="h-9 text-sm" type="date" value={form.start_date} onChange={e => setForm(f => ({ ...f, start_date: e.target.value }))} />
                </div>
              </div>

              <div>
                <label className="text-xs font-semibold text-muted-foreground uppercase block mb-1">Aviso prévio rescisão (dias)</label>
                <Input className="h-9 text-sm" type="number" value={form.termination_notice} onChange={e => setForm(f => ({ ...f, termination_notice: e.target.value }))} />
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
            <Button onClick={generate} disabled={generating || !form.client_name} className="gap-2">
              {generating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Briefcase className="w-4 h-4" />}
              {generating ? "Gerando..." : "Gerar Contrato"}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}