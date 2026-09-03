import { Button } from "@/components/ui/button";
import { Plus, TrendingUp } from "lucide-react";

export default function Media() {
  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Mídia</h1>
          <p className="text-sm text-muted-foreground mt-1">Gestão de campanhas de mídia paga e veículos</p>
        </div>
        <Button className="gap-2">
          <Plus className="w-4 h-4" /> Nova Campanha
        </Button>
      </div>
      <div className="text-center py-24">
        <div className="w-16 h-16 bg-primary/10 rounded-2xl flex items-center justify-center mx-auto mb-4">
          <TrendingUp className="w-8 h-8 text-primary" />
        </div>
        <h2 className="text-xl font-bold text-foreground mb-2">Módulo de Mídia</h2>
        <p className="text-muted-foreground max-w-md mx-auto text-sm leading-relaxed">
          Cadastre campanhas por cliente e período, associe veículos de mídia e controle o investimento com integração financeira.
        </p>
        <Button className="mt-6 gap-2">
          <Plus className="w-4 h-4" /> Criar primeira campanha
        </Button>
      </div>
    </div>
  );
}