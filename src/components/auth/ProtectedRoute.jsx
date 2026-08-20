import { useAuth } from "@/components/AuthContext";
import { Shield } from "lucide-react";
import { getAccessLevel, isAdminLevel, canAccessFinancial } from "@/lib/accessControl";

// Páginas exclusivas para admin-level (master ou gestor)
const ADMIN_LEVEL_PAGES = ["Reports", "Records", "Templates", "Settings"];

// Páginas somente para master (financeiro)
const MASTER_ONLY_PAGES = ["Financial"];

export default function ProtectedRoute({ pageName, children }) {
  const { user } = useAuth();

  if (!user) return null;

  const level = getAccessLevel(user);
  const isAdmin = isAdminLevel(user);

  // Master-only pages (Financial)
  if (MASTER_ONLY_PAGES.includes(pageName)) {
    if (!canAccessFinancial(user)) {
      // Gestor with financial permission from the old system can still view
      if (level === "gestor") {
        return (
          <div className="min-h-[60vh] flex flex-col items-center justify-center p-8 text-center">
            <div className="w-20 h-20 rounded-full bg-destructive/10 flex items-center justify-center mb-6">
              <Shield className="w-10 h-10 text-destructive" />
            </div>
            <h2 className="text-2xl font-bold text-foreground mb-2">Acesso Restrito</h2>
            <p className="text-muted-foreground max-w-sm">
              O módulo financeiro é exclusivo do Master. Entre em contato com o administrador master do sistema.
            </p>
          </div>
        );
      }
      return (
        <div className="min-h-[60vh] flex flex-col items-center justify-center p-8 text-center">
          <div className="w-20 h-20 rounded-full bg-destructive/10 flex items-center justify-center mb-6">
            <Shield className="w-10 h-10 text-destructive" />
          </div>
          <h2 className="text-2xl font-bold text-foreground mb-2">Acesso Restrito</h2>
          <p className="text-muted-foreground max-w-sm">
            Você não tem permissão para acessar esta página.
          </p>
        </div>
      );
    }
  }

  // Admin-level pages (master or gestor)
  if (ADMIN_LEVEL_PAGES.includes(pageName) && !isAdmin) {
    // Check specific permissions for Reports
    if (pageName === "Reports") {
      const reportsPermission = user.permissions?.reports;
      if (reportsPermission === "full" || reportsPermission === "view") {
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