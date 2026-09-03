import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Settings as SettingsIcon, Trash2, AlertTriangle, Loader2 } from "lucide-react";

export default function Settings() {
  const [user, setUser] = useState(null);
  const [deleteStep, setDeleteStep] = useState(0);
  const [confirmText, setConfirmText] = useState("");
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteResult, setDeleteResult] = useState(null);

  useEffect(() => {
    base44.auth.me().then(setUser).catch(() => {});
  }, []);

  const handleDeleteAccount = async () => {
    setIsDeleting(true);
    setDeleteResult(null);

    const response = await base44.functions.invoke("deleteAccount", {});

    if (response.data?.success) {
      setDeleteResult("success");
      // Wait 2s to show success, then logout
      setTimeout(() => {
        sessionStorage.removeItem("collaborator");
        sessionStorage.removeItem("lastRoute");
        localStorage.clear();
        base44.auth.logout();
      }, 2000);
    } else {
      setDeleteResult("error");
      setIsDeleting(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto p-6 space-y-6">
      <div className="flex items-center gap-2 mb-4">
        <SettingsIcon className="w-5 h-5 text-muted-foreground" />
        <h1 className="text-xl font-bold">Minha Conta</h1>
      </div>

      {user && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
              Conta
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <p className="text-sm"><span className="font-medium">Nome:</span> {user.full_name}</p>
            <p className="text-sm"><span className="font-medium">Email:</span> {user.email}</p>
          </CardContent>
        </Card>
      )}

      {/* Danger Zone */}
      <Card className="border-destructive/50">
        <CardHeader>
          <CardTitle className="text-sm font-medium text-destructive uppercase tracking-wide flex items-center gap-2">
            <AlertTriangle className="w-4 h-4" />
            Zona de Perigo
          </CardTitle>
        </CardHeader>
        <CardContent>
          {deleteResult === "success" ? (
            <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg p-4">
              <p className="text-sm font-semibold text-green-700 dark:text-green-400">
                Conta excluída com sucesso. Você será desconectado em instantes...
              </p>
            </div>
          ) : deleteStep === 0 ? (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">
                Excluir sua conta removerá permanentemente todos os seus dados. Esta ação não pode ser desfeita.
              </p>
              <Button variant="destructive" size="sm" onClick={() => setDeleteStep(1)}>
                <Trash2 className="w-4 h-4 mr-2" />
                Excluir Conta
              </Button>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="bg-destructive/10 border border-destructive/30 rounded-lg p-4 space-y-2">
                <p className="text-sm font-semibold text-destructive">Atenção: Esta ação é irreversível</p>
                <ul className="text-sm text-muted-foreground space-y-1 list-disc list-inside">
                  <li>Todos os seus dados serão removidos permanentemente</li>
                  <li>Você receberá um e-mail de confirmação da exclusão</li>
                  <li>Você perderá acesso imediatamente</li>
                  <li>Não é possível recuperar a conta após exclusão</li>
                </ul>
              </div>
              <div className="space-y-2">
                <p className="text-sm font-medium">
                  Digite <span className="font-mono bg-muted px-1 rounded">EXCLUIR</span> para confirmar:
                </p>
                <input
                  type="text"
                  value={confirmText}
                  onChange={(e) => setConfirmText(e.target.value)}
                  className="w-full border border-input rounded-md px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-ring"
                  placeholder="EXCLUIR"
                />
              </div>
              {deleteResult === "error" && (
                <p className="text-sm text-destructive font-medium">
                  Erro ao excluir conta. Tente novamente.
                </p>
              )}
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={() => { setDeleteStep(0); setConfirmText(""); setDeleteResult(null); }}>
                  Cancelar
                </Button>
                <Button
                  variant="destructive"
                  size="sm"
                  disabled={confirmText !== "EXCLUIR" || isDeleting}
                  onClick={handleDeleteAccount}
                >
                  {isDeleting ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Excluindo...
                    </>
                  ) : "Confirmar Exclusão"}
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}