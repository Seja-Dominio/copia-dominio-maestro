import { useEffect, useState } from "react";
import { loginCollaborator } from "@/api/maestroClient";
import { supabase } from "@/api/supabaseClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AlertCircle, ArrowRight, Eye, EyeOff, Lock, MessageCircle, User } from "lucide-react";

export default function CollaboratorLoginPanel({ onLoginSuccess }) {
  const [login, setLogin] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [isLoginHovered, setIsLoginHovered] = useState(false);
  const [isLoginExpanded, setIsLoginExpanded] = useState(false);

  const whatsappNumber = String(import.meta.env.VITE_SUPPORT_WHATSAPP_NUMBER || "92984523753").replace(/\D/g, "");
  const whatsappMessage = encodeURIComponent("Olá! Preciso de ajuda para recuperar meu acesso ao Domínio Maestro.");
  const whatsappHref = `https://wa.me/55${whatsappNumber}?text=${whatsappMessage}`;
  const hasEnteredData = Boolean(login || password);
  const isLoginVisible = isLoginExpanded || isLoginHovered || hasEnteredData || Boolean(error);
  const wallpaperInteractionOverlay = isLoginVisible
    ? "bg-slate-950/[0.80]"
    : "";
  const loginCardStyle = {
    backgroundColor: isLoginVisible ? "rgba(255, 255, 255, 0.9)" : "rgba(255, 255, 255, 0.01)",
    borderColor: isLoginVisible ? "rgba(255, 255, 255, 0.42)" : "rgba(255, 255, 255, 0.01)",
  };
  const loginCardBlur = isLoginVisible ? "backdrop-blur-[2px]" : "backdrop-blur-none";
  const loginDetailsVisibility = isLoginVisible
    ? "pointer-events-auto opacity-100"
    : "pointer-events-none opacity-0";

  useEffect(() => {
    if (!login && !password && !isLoginHovered) {
      setIsLoginExpanded(false);
      setShowPassword(false);
      setError("");
    }
  }, [login, password, isLoginHovered]);

  const handleLogin = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      // Native Supabase Auth accounts can sign in with an email address.
      // Keep the collaborator endpoint for the existing username-based users.
      if (supabase && login.includes("@")) {
        const { data, error } = await supabase.auth.signInWithPassword({
          email: login.trim(),
          password,
        });
        if (!error && data.user) {
          onLoginSuccess?.(data.user);
          return;
        }
        if (error?.message?.toLowerCase().includes("email not confirmed")) {
          setError("Confirme seu e-mail antes de entrar.");
          return;
        }
      }
      const response = await loginCollaborator({ login, password });
      const data = response.data;

      if (!data.success) {
        setError(data.error || "Usuário ou senha incorretos");
        return;
      }

      const collaborator = data.collaborator;

      // Salvar dados do colaborador na sessão
      sessionStorage.setItem("collaborator", JSON.stringify(collaborator));
      if (data.session_token) {
        sessionStorage.setItem("collaborator_session_token", data.session_token);
      }

      onLoginSuccess?.(collaborator);
    } catch (err) {
      const msg = err?.message || err?.response?.data?.error || "Erro ao autenticar. Tente novamente.";
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="group relative flex min-h-screen items-center justify-center overflow-hidden bg-slate-950 p-4 sm:p-6">
      <div className="pointer-events-none absolute inset-0 bg-cover bg-center" style={{ backgroundImage: "url('/assets/login-wallpaper.webp')" }} aria-hidden="true" />
      <div className="pointer-events-none absolute inset-0 bg-slate-950/[0.05]" aria-hidden="true" />
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-slate-950/5 via-transparent to-slate-950/25" aria-hidden="true" />
      <div className={`pointer-events-none absolute inset-0 transition-colors duration-300 ${wallpaperInteractionOverlay}`} aria-hidden="true" />
      <div className="relative w-full max-w-[320px]">

        {/* Card de login */}
        <div
          className={`group rounded-2xl border px-4 py-3 shadow-2xl shadow-black/30 transition-[background-color,border-color,backdrop-filter] duration-300 sm:px-5 sm:py-4 ${loginCardBlur}`}
          style={loginCardStyle}
          onPointerEnter={() => setIsLoginHovered(true)}
          onPointerLeave={() => setIsLoginHovered(false)}
          onPointerDown={() => setIsLoginExpanded(true)}
          onClick={() => setIsLoginExpanded(true)}
          onFocusCapture={() => setIsLoginExpanded(true)}
        >
          <form onSubmit={handleLogin} autoComplete="off">
          <div className={`overflow-hidden transition-opacity duration-300 ${loginDetailsVisibility}`}>
            <div className="mb-3 flex items-center gap-2.5">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white shadow-md">
              <img
                src="https://media.base44.com/images/public/69b0ac7e08d578f9756170a0/735dfef5a_VERTICALCOMFUNDO.png"
                alt="Domínio Performance"
                className="h-7 w-auto object-contain"
              />
            </div>
            <div>
              <h1 className="text-sm font-bold tracking-tight text-foreground">Domínio Maestro</h1>
              <p className="mt-0.5 text-[10px] leading-3.5 text-muted-foreground">Credenciais fornecidas pelo administrador</p>
            </div>
          </div>

            {error && (
              <div role="alert" aria-live="assertive" className="mb-4 flex items-start gap-2.5 rounded-xl border border-destructive/30 bg-destructive/10 p-3">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" aria-hidden="true" />
              <p className="text-sm text-destructive">{error}</p>
              </div>
            )}

            <div className="space-y-2.5">
            {/* Login */}
            <div>
              <label htmlFor="collaborator-login" className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-foreground">
                Usuário
              </label>
              <div className="relative">
                <User className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
                <Input
                  id="collaborator-login"
                  name="account-login"
                  type="text"
                  autoComplete="off"
                  data-lpignore="true"
                  data-1p-ignore="true"
                  placeholder="Digite seu usuário"
                  value={login}
                  onChange={(e) => setLogin(e.target.value.toLowerCase())}
                  disabled={loading}
                  className="h-8 pl-8 text-xs"
                  required
                />
              </div>
            </div>

            {/* Senha */}
            <div>
              <div className="mb-1 flex items-center justify-between gap-3">
                <label htmlFor="collaborator-password" className="block text-[10px] font-semibold uppercase tracking-wide text-foreground">Senha</label>
              </div>
              <div className="relative">
                <Lock className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
                <Input
                  id="collaborator-password"
                  name="account-secret"
                  type={showPassword ? "text" : "password"}
                  autoComplete="new-password"
                  data-lpignore="true"
                  data-1p-ignore="true"
                  placeholder="Digite sua senha"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  disabled={loading}
                  className="h-8 pl-8 pr-9 text-xs"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((visible) => !visible)}
                  aria-label={showPassword ? "Ocultar senha" : "Mostrar senha"}
                  title={showPassword ? "Ocultar senha" : "Mostrar senha"}
                  className="absolute right-1 top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                >
                  {showPassword ? <EyeOff className="h-3.5 w-3.5" aria-hidden="true" /> : <Eye className="h-3.5 w-3.5" aria-hidden="true" />}
                </button>
              </div>
            </div>
            </div>
          </div>

          {/* Botão sempre visível para indicar a região de acesso */}
          <Button
            type="submit"
            disabled={loading}
            aria-busy={loading}
            onClick={(event) => {
              if (!login || !password) {
                event.preventDefault();
                setIsLoginExpanded(true);
              }
            }}
            className="flex h-8 w-full items-center justify-center gap-1.5 bg-primary text-xs font-semibold text-primary-foreground opacity-50 transition-colors hover:bg-primary/90 hover:opacity-70"
          >
            {loading ? "Autenticando..." : (
              <>Entrar <ArrowRight className="h-3.5 w-3.5" /></>
            )}
          </Button>

          <div className={`overflow-hidden transition-opacity duration-300 ${loginDetailsVisibility}`}>
            <a href={whatsappHref} target="_blank" rel="noreferrer" className="mt-2 flex h-8 w-full items-center justify-center gap-1.5 rounded-lg border border-primary/25 bg-primary/5 text-xs font-semibold text-primary transition-colors hover:bg-primary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2">
              <MessageCircle className="h-3.5 w-3.5" aria-hidden="true" />
              Esqueci minha senha
            </a>
          </div>
          </form>
        </div>
      </div>
    </main>);

}
