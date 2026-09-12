import { useState } from "react";
import { hashCollaboratorPassword, maestro } from "@/api/maestroClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { AlertCircle, Copy, RotateCw, Eye, EyeOff } from "lucide-react";
import { getTabPermissions, isAdminLevel, SYSTEM_TAB_PERMISSIONS } from "@/lib/accessControl";

export default function AccessCredentialsModal({
  collaborator,
  isOpen,
  onClose,
  onSaved,
}) {
  const [formData, setFormData] = useState(() => ({
    login: collaborator?.login || "",
    password_hash: collaborator?.password_hash || "",
    access_level: collaborator?.access_level || "collaborator",
    permissions: { tabs: getTabPermissions(collaborator) },
  }));
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [copiedField, setCopiedField] = useState(null);

  const generateRandomPassword = () => {
    const chars =
      "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%";
    let pwd = "";
    for (let i = 0; i < 12; i++) {
      pwd += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    setFormData((prev) => ({ ...prev, password_hash: pwd }));
  };

  const handleCopy = (field) => {
    navigator.clipboard.writeText(formData[field]);
    setCopiedField(field);
    setTimeout(() => setCopiedField(null), 2000);
  };

  const handleSave = async () => {
    if (!formData.login || (!collaborator?.id && !formData.password_hash)) {
      alert(collaborator?.id ? "Preencha o login" : "Preencha login e senha");
      return;
    }

    setLoading(true);
    try {
      if (collaborator?.id) {
        if (formData.password_hash) {
          // Salvar credenciais com senha hasheada via backend
          await hashCollaboratorPassword({
            collaboratorId: collaborator.id,
            password: formData.password_hash,
            login: formData.login,
            access_level: formData.access_level,
            permissions: formData.permissions,
          });
        } else {
          // Permite ajustar somente as permissões sem obrigar a redefinir a senha.
          await maestro.entities.Collaborator.update(collaborator.id, {
            login: formData.login,
            access_level: formData.access_level,
            permissions: formData.permissions,
          });
        }
      }
      onSaved?.();
      onClose();
    } catch (err) {
      alert("Erro ao salvar credenciais: " + err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Credenciais de Acesso</DialogTitle>
          <DialogDescription>
            {collaborator?.id
              ? `Gerenciar credenciais de ${collaborator.name}`
              : "Defina as credenciais de acesso"}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Login */}
          <div>
            <label className="block text-xs font-semibold text-foreground mb-2 uppercase tracking-wide">
              Usuário (Login)
            </label>
            <Input
              type="text"
              placeholder="ex: joao.silva"
              value={formData.login}
              onChange={(e) =>
                setFormData((prev) => ({ ...prev, login: e.target.value }))
              }
              disabled={loading}
            />
          </div>

          {/* Senha */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="block text-xs font-semibold text-foreground uppercase tracking-wide">
                Nova senha
              </label>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={generateRandomPassword}
                disabled={loading}
                className="text-xs"
              >
                <RotateCw className="w-3 h-3 mr-1" /> Gerar
              </Button>
            </div>
            <div className="flex gap-2">
              <Input
                type={showPassword ? "text" : "password"}
                placeholder={collaborator?.id ? "Deixe em branco para manter" : "Digite uma senha segura"}
                value={formData.password_hash}
                onChange={(e) =>
                  setFormData((prev) => ({ ...prev, password_hash: e.target.value }))
                }
                disabled={loading}
              />
              <Button
                type="button"
                variant="outline"
                size="icon"
                onClick={() => setShowPassword(!showPassword)}
                disabled={loading}
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </Button>
              <Button
                type="button"
                variant="outline"
                size="icon"
                onClick={() => handleCopy("password_hash")}
                disabled={!formData.password_hash}
              >
                <Copy className="w-4 h-4" />
              </Button>
            </div>
            {copiedField === "password_hash" && (
              <p className="text-xs text-green-600 mt-1">✓ Copiado</p>
            )}
          </div>

          {/* Nível de Acesso */}
          <div>
            <label className="block text-xs font-semibold text-foreground mb-2 uppercase tracking-wide">
              Nível de Acesso
            </label>
            <Select
              value={formData.access_level}
              onValueChange={(value) => setFormData((prev) => ({
                ...prev,
                access_level: value,
                permissions: {
                  ...prev.permissions,
                  tabs: {
                    ...prev.permissions.tabs,
                    Financial: ["gestor", "master"].includes(value) && prev.permissions.tabs.Financial === true,
                  },
                },
              }))}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="collaborator">
                  <div>
                    <p className="font-semibold">Colaborador</p>
                    <p className="text-xs text-muted-foreground">
                      Acesso limitado a jobs, projetos e agenda
                    </p>
                  </div>
                </SelectItem>
                <SelectItem value="gestor">
                  <div>
                    <p className="font-semibold">Gestor</p>
                    <p className="text-xs text-muted-foreground">
                      Admin sem financeiro, exclusões e exports (solicita ao Master)
                    </p>
                  </div>
                </SelectItem>
                <SelectItem value="master">
                  <div>
                    <p className="font-semibold">Master</p>
                    <p className="text-xs text-muted-foreground">
                      Acesso total ao sistema (financeiro, exclusões, exports)
                    </p>
                  </div>
                </SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="rounded-xl border border-border bg-muted/30 p-4">
            <div className="mb-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-foreground">Permissões por aba</p>
              <p className="mt-1 text-xs text-muted-foreground">Marque as áreas que este colaborador poderá visualizar.</p>
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              {SYSTEM_TAB_PERMISSIONS.map((tab) => {
                const financeBlocked = tab.page === "Financial" && !isAdminLevel({ access_level: formData.access_level });
                const checked = formData.permissions.tabs[tab.page] === true;
                return (
                  <label key={tab.page} className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-sm transition-colors ${financeBlocked ? "cursor-not-allowed border-border bg-muted/60 opacity-60" : "cursor-pointer border-border bg-background hover:border-primary/50"}`}>
                    <input
                      type="checkbox"
                      checked={checked}
                      disabled={loading || financeBlocked}
                      onChange={() => setFormData((prev) => ({
                        ...prev,
                        permissions: {
                          ...prev.permissions,
                          tabs: { ...prev.permissions.tabs, [tab.page]: !checked },
                        },
                      }))}
                      className="h-4 w-4 rounded border-input accent-primary"
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium text-foreground">{tab.label}</span>
                      {financeBlocked && <span className="block text-[10px] text-muted-foreground">Disponível apenas para Gestor ou Master</span>}
                    </span>
                  </label>
                );
              })}
            </div>
          </div>

          {/* Info */}
          <div className="p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
            <div className="flex gap-2">
              <AlertCircle className="w-4 h-4 text-blue-600 mt-0.5 flex-shrink-0" />
              <p className="text-xs text-blue-700 dark:text-blue-400">
                Compartilhe login e senha com o colaborador de forma segura. Ele poderá fazer login após essas credenciais serem salvas.
              </p>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={loading}>
            Cancelar
          </Button>
          <Button
            onClick={handleSave}
            disabled={loading || !formData.login || (!collaborator?.id && !formData.password_hash)}
            className="bg-primary hover:bg-primary/90"
          >
            {loading ? "Salvando..." : "Salvar Credenciais"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
