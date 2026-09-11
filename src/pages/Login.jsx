import React, { useState } from "react";
import { loginCollaborator } from "@/api/maestroClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Lock, Mail, ArrowRight, Eye, EyeOff } from "lucide-react";

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await loginCollaborator({ login: email, password });
      window.location.href = "/";
    } catch (err) {
      setError(err.message || "E-mail ou senha incorretos");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#0d3b6e] via-[#1a5fa8] to-[#0d3b6e] flex items-center justify-center p-6">
      <div className="w-full max-w-sm">
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

        <div className="bg-card px-6 py-6 rounded-2xl shadow-2xl border border-border">
          <h2 className="text-lg font-bold text-foreground mb-1">Faça Login</h2>
          <p className="text-xs text-muted-foreground mb-5">
            Insira suas credenciais de acesso
          </p>

          {error && (
            <div role="alert" className="mb-4 p-3 bg-destructive/10 border border-destructive/30 rounded-xl flex items-start gap-2.5">
              <p className="text-sm text-destructive">{error}</p>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label htmlFor="login-email" className="block text-xs font-semibold text-foreground mb-1 uppercase tracking-wide">
                E-mail
              </label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  id="login-email"
                  type="email"
                  autoComplete="email"
                  autoFocus
                  placeholder="seu@email.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="pl-10"
                  required
                />
              </div>
            </div>
            <div>
              <label htmlFor="login-password" className="block text-xs font-semibold text-foreground mb-1 uppercase tracking-wide">
                Senha
              </label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  id="login-password"
                  type={showPassword ? "text" : "password"}
                  autoComplete="current-password"
                  placeholder="Digite sua senha"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="pl-10 pr-10"
                  required
                />
                <button
                  type="button"
                  aria-label={showPassword ? "Ocultar senha" : "Mostrar senha"}
                  title={showPassword ? "Ocultar senha" : "Mostrar senha"}
                  onClick={() => setShowPassword((visible) => !visible)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>
            <Button
              type="submit"
              disabled={loading || !email || !password}
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
    </div>
  );
}
