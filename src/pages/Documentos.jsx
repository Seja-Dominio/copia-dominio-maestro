import { useState } from "react";
import { FileText } from "lucide-react";
import DocumentGeneratorSection from "@/components/proposals/DocumentGeneratorSection";

export default function Documentos() {
  return (
    <div className="p-4 sm:p-6 max-w-[1400px] mx-auto space-y-5">
      <div>
        <h1 className="text-xl font-bold text-foreground">Documentos</h1>
        <p className="text-sm text-muted-foreground mt-0.5">Gere contratos e propostas comerciais</p>
      </div>

      <DocumentGeneratorSection />
    </div>
  );
}