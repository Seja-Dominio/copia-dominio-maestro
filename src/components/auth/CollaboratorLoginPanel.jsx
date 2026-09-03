import { useState } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Lock, User, AlertCircle, Zap, ArrowRight } from "lucide-react";

export default function CollaboratorLoginPanel({ onLoginSuccess }) {
  const [login, setLogin] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleLogin = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const response = await base44.functions.invoke('collaboratorLogin', { login, password });
      const data = response.data;

      if (!data.success) {
        setError(data.error || "Usuário ou senha incorretos");
        return;
      }

      const collaborator = data.collaborator;

      // Salvar dados do colaborador na sessão
      sessionStorage.setItem("collaborator", JSON.stringify(collaborator));

      onLoginSuccess?.(collaborator);
    } catch (err) {
      const msg = err?.response?.data?.error || "Erro ao autenticar. Tente novamente.";
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#0d3b6e] via-[#1a5fa8] to-[#0d3b6e] flex items-center justify-center p-6">
      <div className="w-full max-w-sm">
        {/* Logo e header */}
        <div className="text-center mb-8">
          <div className="bg-white mx-auto w-28 h-28 rounded-2xl flex items-center justify-center shadow-lg mb-4">
            <img
              src="https://media.base44.com/images/public/69b0ac7e08d578f9756170a0/735dfef5a_VERTICALCOMFUNDO.png"
              alt="Domínio Performance"
              className="h-24 w-auto object-contain"
            />
          </div>
          <h1 className="text-white text-2xl font-bold mb-1">Dominio Maestro</h1>
          <p className="text-white/70 text-sm">Gerenciamento de Projetos e Colaboradores</p>
        </div>

        {/* Card de login */}
        <div className="bg-card px-6 py-6 rounded-2xl shadow-2xl border border-border">
          <h2 className="text-lg font-bold text-foreground mb-1">Faça Login</h2>
          <p className="text-xs text-muted-foreground mb-5">
            Insira suas credenciais fornecidas pelo administrador
          </p>

          {error && (
            <div className="mb-4 p-3 bg-destructive/10 border border-destructive/30 rounded-xl flex items-start gap-2.5">
              <AlertCircle className="w-4 h-4 text-destructive mt-0.5 flex-shrink-0" />
              <p className="text-sm text-destructive">{error}</p>
            </div>
          )}

          <form onSubmit={handleLogin} className="space-y-4">
            {/* Login */}
            <div>
              <label className="block text-xs font-semibold text-foreground mb-1.5 uppercase tracking-wide">
                Usuário
              </label>
              <div className="relative">
                <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  type="text"
                  placeholder="Digite seu usuário"
                  value={login}
                  onChange={(e) => setLogin(e.target.value.toLowerCase())}
                  disabled={loading}
                  className="pl-10"
                  required
                />
              </div>
            </div>

            {/* Senha */}
            <div>
              <label className="block text-xs font-semibold text-foreground mb-1.5 uppercase tracking-wide">
                Senha
              </label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  type="password"
                  placeholder="Digite sua senha"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  disabled={loading}
                  className="pl-10"
                  required
                />
              </div>
            </div>

            {/* Botão */}
            <Button
              type="submit"
              disabled={loading || !login || !password}
              className="w-full bg-primary hover:bg-primary/90 text-primary-foreground font-semibold h-10 flex items-center justify-center gap-2"
            >
              {loading ? "Autenticando..." : (
                <>Entrar <ArrowRight className="w-4 h-4" /></>
              )}
            </Button>
          </form>

          <p className="text-[11px] text-muted-foreground text-center mt-5">
            Contate o administrador para obter suas credenciais de acesso.
          </p>
        </div>
      </div>
    </div>);

}