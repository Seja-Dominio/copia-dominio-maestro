import { Button } from "@/components/ui/button";
import { AlertCircle } from "lucide-react";

export default function PageNotFound() {
  const handleGoHome = () => {
    window.location.href = "/Dashboard";
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="text-center max-w-md">
        <div className="w-16 h-16 bg-destructive/10 rounded-2xl flex items-center justify-center mx-auto mb-4">
          <AlertCircle className="w-8 h-8 text-destructive" />
        </div>
        <h1 className="text-3xl font-bold text-foreground mb-2">Página não encontrada</h1>
        <p className="text-muted-foreground mb-6">
          A página que você está tentando acessar não existe ou você não tem permissão para acessá-la.
        </p>
        <Button
          onClick={handleGoHome}
          className="bg-primary hover:bg-primary/90 text-primary-foreground"
        >
          Voltar ao Dashboard
        </Button>
      </div>
    </div>
  );
}