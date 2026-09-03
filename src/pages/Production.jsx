import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Plus, Film, Package } from "lucide-react";

export default function Production() {
  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Produção</h1>
          <p className="text-sm text-muted-foreground mt-1">Gestão de documentos de produção e fornecedores</p>
        </div>
        <Button className="gap-2">
          <Plus className="w-4 h-4" /> Novo Documento
        </Button>
      </div>
      <div className="text-center py-24">
        <div className="w-16 h-16 bg-primary/10 rounded-2xl flex items-center justify-center mx-auto mb-4">
          <Film className="w-8 h-8 text-primary" />
        </div>
        <h2 className="text-xl font-bold text-foreground mb-2">Módulo de Produção</h2>
        <p className="text-muted-foreground max-w-md mx-auto text-sm leading-relaxed">
          Gerencie documentos de produção, associe fornecedores, calcule comissões e gere lançamentos financeiros de receita e despesa.
        </p>
        <Button className="mt-6 gap-2">
          <Plus className="w-4 h-4" /> Criar primeiro documento
        </Button>
      </div>
    </div>
  );
}