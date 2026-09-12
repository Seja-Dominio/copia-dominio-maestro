import { useState } from "react";
import { base44 } from "@/api/base44Client";
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

export default function AccessCredentialsModal({
  collaborator,
  isOpen,
  onClose,
  onSaved,
}) {
  const [formData, setFormData] = useState({
    login: collaborator?.login || "",
    password_hash: collaborator?.password_hash || "",
    access_level: collaborator?.access_level || "collaborator",
  });
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
    if (!formData.login || !formData.password_hash) {
      alert("Preencha login e senha");
      return;
    }

    setLoading(true);
    try {
      if (collaborator?.id) {
        // Salvar credenciais com senha hasheada via backend
        await base44.functions.invoke('hashCollaboratorPassword', {
          collaboratorId: collaborator.id,
          password: formData.password_hash,
          login: formData.login,
          access_level: formData.access_level,
        });
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
                Senha
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
                placeholder="Digite uma senha segura"
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
              onValueChange={(value) =>
                setFormData((prev) => ({ ...prev, access_level: value }))
              }
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
            disabled={loading || !formData.login || !formData.password_hash}
            className="bg-primary hover:bg-primary/90"
          >
            {loading ? "Salvando..." : "Salvar Credenciais"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}