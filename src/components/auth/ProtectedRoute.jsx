import { useAuth } from "@/components/AuthContext";
import { Shield } from "lucide-react";
import { isAdminLevel, canAccessFinancial, canAccessPage, SYSTEM_TAB_PERMISSIONS } from "@/lib/accessControl";

// Páginas exclusivas para admin-level (master ou gestor)
const ADMIN_LEVEL_PAGES = ["Reports", "Records", "Templates", "Settings"];

// Financeiro exige perfil Gestor/Master e permissão explícita.
const MASTER_ONLY_PAGES = ["Financial"];

export default function ProtectedRoute({ pageName, children }) {
  const { user } = useAuth();

  if (!user) return null;

  const isAdmin = isAdminLevel(user);

  // Financial requires an explicit tab permission for Gestor/Master.
  if (MASTER_ONLY_PAGES.includes(pageName)) {
    if (!canAccessFinancial(user)) {
      return (
        <div className="min-h-[60vh] flex flex-col items-center justify-center p-8 text-center">
          <div className="w-20 h-20 rounded-full bg-destructive/10 flex items-center justify-center mb-6">
            <Shield className="w-10 h-10 text-destructive" />
          </div>
          <h2 className="text-2xl font-bold text-foreground mb-2">Acesso Restrito</h2>
          <p className="text-muted-foreground max-w-sm">
            O Financeiro exige um perfil Gestor ou Master com essa aba habilitada.
          </p>
        </div>
      );
    }
  }

  const legacyReportsPermission = pageName === "Reports" && ["full", "view"].includes(user.permissions?.reports);
  if (SYSTEM_TAB_PERMISSIONS.some((tab) => tab.page === pageName) && !canAccessPage(user, pageName) && !legacyReportsPermission) {
    return (
      <div className="min-h-[60vh] flex flex-col items-center justify-center p-8 text-center">
        <div className="w-20 h-20 rounded-full bg-destructive/10 flex items-center justify-center mb-6">
          <Shield className="w-10 h-10 text-destructive" />
        </div>
        <h2 className="text-2xl font-bold text-foreground mb-2">Acesso Restrito</h2>
        <p className="text-muted-foreground max-w-sm">
          Esta aba não está habilitada para o seu usuário. Entre em contato com o administrador.
        </p>
      </div>
    );
  }

  // Admin-level pages (master or gestor)
  if (ADMIN_LEVEL_PAGES.includes(pageName) && !isAdmin) {
    // Check specific permissions for Reports
    if (pageName === "Reports") {
      const reportsPermission = user.permissions?.reports;
      if (canAccessPage(user, pageName) || reportsPermission === "full" || reportsPermission === "view") {
        return children;
      }
    }

    return (
      <div className="min-h-[60vh] flex flex-col items-center justify-center p-8 text-center">
        <div className="w-20 h-20 rounded-full bg-destructive/10 flex items-center justify-center mb-6">
          <Shield className="w-10 h-10 text-destructive" />
        </div>
        <h2 className="text-2xl font-bold text-foreground mb-2">Acesso Restrito</h2>
        <p className="text-muted-foreground max-w-sm">
          Você não tem permissão para acessar esta página. Entre em contato com o administrador.
        </p>
      </div>
    );
  }

  return children;
}
