import { useState } from "react";
import { FileText, Users, Briefcase, ChevronRight, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import GenerateProposalModal from "./GenerateProposalModal";
import GenerateClientContractModal from "./GenerateClientContractModal";
import GenerateCollaboratorContractModal from "./GenerateCollaboratorContractModal";

const DOC_TYPES = [
  {
    id: "proposta",
    label: "Proposta Comercial",
    description: "Gerar proposta comercial personalizada para o cliente",
    icon: FileText,
    color: "bg-blue-50 text-blue-600 border-blue-200",
    iconBg: "bg-blue-100",
  },
  {
    id: "contrato_cliente",
    label: "Contrato do Cliente",
    description: "Gerar contrato de prestação de serviços",
    icon: Briefcase,
    color: "bg-emerald-50 text-emerald-600 border-emerald-200",
    iconBg: "bg-emerald-100",
  },
  {
    id: "contrato_colaborador",
    label: "Contrato de Colaborador",
    description: "Gerar contrato de prestação de serviço do colaborador",
    icon: Users,
    color: "bg-purple-50 text-purple-600 border-purple-200",
    iconBg: "bg-purple-100",
  },
];

export default function DocumentGeneratorSection() {
  const [activeModal, setActiveModal] = useState(null);

  return (
    <>
      <div className="glass-card p-5">
        <h2 className="text-sm font-bold text-foreground mb-1">Gerar Documentos</h2>
        <p className="text-xs text-muted-foreground mb-4">Selecione o tipo de documento que deseja gerar</p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {DOC_TYPES.map(doc => (
            <button
              key={doc.id}
              onClick={() => setActiveModal(doc.id)}
              className={`flex items-center gap-3 p-4 rounded-xl border transition-all hover:shadow-md text-left ${doc.color}`}
            >
              <div className={`w-10 h-10 rounded-lg ${doc.iconBg} flex items-center justify-center flex-shrink-0`}>
                <doc.icon className="w-5 h-5" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold">{doc.label}</p>
                <p className="text-[10px] opacity-70 mt-0.5">{doc.description}</p>
              </div>
              <ChevronRight className="w-4 h-4 opacity-40 flex-shrink-0" />
            </button>
          ))}
        </div>
      </div>

      {activeModal === "proposta" && (
        <GenerateProposalModal onClose={() => setActiveModal(null)} />
      )}
      {activeModal === "contrato_cliente" && (
        <GenerateClientContractModal onClose={() => setActiveModal(null)} />
      )}
      {activeModal === "contrato_colaborador" && (
        <GenerateCollaboratorContractModal onClose={() => setActiveModal(null)} />
      )}
    </>
  );
}