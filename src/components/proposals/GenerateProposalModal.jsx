import { useState, useEffect, useRef } from "react";
import { base44 } from "@/api/base44Client";
import { X, FileText, Download, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { format } from "date-fns";

export default function GenerateProposalModal({ onClose }) {
  const [clients, setClients] = useState([]);
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
    setup_value: "",
    valid_days: "15",
    payment_terms: "Boleto bancário com vencimento todo dia 10",
    start_date: format(new Date(), "yyyy-MM-dd"),
    observations: "",
  });

  useEffect(() => {
    base44.entities.Client.list("name", 200).then(c => { setClients(c); setLoading(false); });
  }, []);

  function selectClient(clientId) {
    const c = clients.find(cl => cl.id === clientId);
    if (!c) return;
    setForm(f => ({
      ...f,
      client_id: c.id,
      client_name: c.name || "",
      company_name: c.company_name || "",
      cnpj: c.cnpj || "",
      address: c.address || "",
      responsible: c.responsible || "",
      services: (c.services || []).join(", "),
    }));
  }

  async function generate() {
    setGenerating(true);
    const prompt = `Gere uma proposta comercial profissional em HTML estilizado (inline CSS, fonte Arial, cores corporativas azul #1e5a99 e cinza) para a agência de marketing "Domínio Performance". Dados:
- Cliente: ${form.client_name}
- Razão Social: ${form.company_name || "Não informada"}
- CNPJ: ${form.cnpj || "Não informado"}
- Endereço: ${form.address || "Não informado"}
- Responsável comercial: ${form.responsible || "Não informado"}
- Serviços propostos: ${form.services || "Gestão de redes sociais"}
- Valor mensal: R$ ${form.monthly_value || "A definir"}
- Valor de setup: R$ ${form.setup_value || "Isento"}
- Condições de pagamento: ${form.payment_terms}
- Validade da proposta: ${form.valid_days} dias
- Data de início prevista: ${form.start_date ? format(new Date(form.start_date + "T12:00:00"), "dd/MM/yyyy") : "A definir"}
- Observações: ${form.observations || "Nenhuma"}

A proposta deve conter:
1. Cabeçalho com logo placeholder e dados da agência
2. Dados do cliente
3. Escopo dos serviços detalhado
4. Investimento (tabela com valores)
5. Condições de pagamento
6. Prazo de validade
7. Assinatura de ambas as partes
8. Retorne APENAS o HTML, sem markdown, sem blocos de código.`;

    const result = await base44.integrations.Core.InvokeLLM({ prompt, model: "gemini_3_flash" });
    let html = result;
    if (typeof html === "object") html = html.text || html.content || JSON.stringify(html);
    // Strip markdown code blocks if present
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
    a.download = `Proposta_${form.client_name || "comercial"}.html`;
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
            <FileText className="w-5 h-5 text-blue-600" />
            <h2 className="text-sm font-bold text-foreground">Gerar Proposta Comercial</h2>
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
                <iframe srcDoc={generatedHtml} className="w-full" style={{ height: 600, border: "none" }} title="Proposta" />
              </div>
            </div>
          ) : (
            <>
              {/* Client selector */}
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
                <label className="text-xs font-semibold text-muted-foreground uppercase block mb-1">Serviços propostos</label>
                <Input className="h-9 text-sm" placeholder="Gestão de redes sociais, Tráfego pago..." value={form.services} onChange={e => setForm(f => ({ ...f, services: e.target.value }))} />
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="text-xs font-semibold text-muted-foreground uppercase block mb-1">Valor Mensal (R$)</label>
                  <Input className="h-9 text-sm" type="number" value={form.monthly_value} onChange={e => setForm(f => ({ ...f, monthly_value: e.target.value }))} />
                </div>
                <div>
                  <label className="text-xs font-semibold text-muted-foreground uppercase block mb-1">Setup (R$)</label>
                  <Input className="h-9 text-sm" type="number" value={form.setup_value} onChange={e => setForm(f => ({ ...f, setup_value: e.target.value }))} />
                </div>
                <div>
                  <label className="text-xs font-semibold text-muted-foreground uppercase block mb-1">Validade (dias)</label>
                  <Input className="h-9 text-sm" type="number" value={form.valid_days} onChange={e => setForm(f => ({ ...f, valid_days: e.target.value }))} />
                </div>
              </div>

              <div>
                <label className="text-xs font-semibold text-muted-foreground uppercase block mb-1">Condições de Pagamento</label>
                <Input className="h-9 text-sm" value={form.payment_terms} onChange={e => setForm(f => ({ ...f, payment_terms: e.target.value }))} />
              </div>

              <div>
                <label className="text-xs font-semibold text-muted-foreground uppercase block mb-1">Data de Início</label>
                <Input className="h-9 text-sm" type="date" value={form.start_date} onChange={e => setForm(f => ({ ...f, start_date: e.target.value }))} />
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
              {generating ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileText className="w-4 h-4" />}
              {generating ? "Gerando..." : "Gerar Proposta"}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}