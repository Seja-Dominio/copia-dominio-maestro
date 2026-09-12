import { Link, useLocation } from "react-router-dom";
import { LayoutDashboard, FolderKanban, Briefcase, Calendar, Users, Brain, MessageSquare } from "lucide-react";
import { useEffect } from "react";
import { canAccessPage } from "@/lib/accessControl";

const NAV_ITEMS = [
  { label: "Dashboard", icon: LayoutDashboard, page: "Dashboard" },
  { label: "Projetos",  icon: FolderKanban,    page: "Projects" },
  { label: "Jobs",      icon: Briefcase,        page: "Jobs" },
  { label: "Agenda",    icon: Calendar,         page: "Agenda" },
  { label: "Carteira",  icon: Users,            page: "ClientPortfolio" },
  { label: "Conversas", icon: MessageSquare,    page: "Conversations" },
  { label: "Ads Brain", icon: Brain,             page: "AdsBrain" },
];

// Save scroll position for the current page before navigating away
function useScrollPreservation() {
  const { pathname } = useLocation();

  useEffect(() => {
    // Restore scroll position when page mounts
    const saved = sessionStorage.getItem(`scroll:${pathname}`);
    if (saved) {
      const mainEl = document.querySelector("main");
      if (mainEl) mainEl.scrollTop = parseInt(saved, 10);
    }

    // Save scroll position when page unmounts
    return () => {
      const mainEl = document.querySelector("main");
      if (mainEl) {
        sessionStorage.setItem(`scroll:${pathname}`, String(mainEl.scrollTop));
      }
    };
  }, [pathname]);
}

export default function BottomNav({ currentPageName, collaborator }) {
  useScrollPreservation();
  const visibleItems = NAV_ITEMS.filter((item) => canAccessPage(collaborator, item.page));

  return (
    <nav
      aria-label="Navegação principal móvel"
      className="fixed bottom-0 left-0 right-0 z-50 md:hidden bg-card border-t border-border safe-bottom"
    >
      <div className="flex items-stretch">
        {visibleItems.map((item) => {
          const isActive = currentPageName === item.page;
          return (
            <Link
              key={item.page}
              to={`/${item.page}`}
              aria-label={`Ir para ${item.label}`}
              aria-current={isActive ? "page" : undefined}
              title={item.label}
              className={`flex-1 flex flex-col items-center justify-center gap-1 py-2 no-underline transition-colors min-h-[56px] focus-visible:z-10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-inset
                ${isActive ? "text-primary" : "text-muted-foreground hover:text-foreground"}`}
            >
              <span className={`flex h-7 w-10 items-center justify-center rounded-lg transition-colors ${isActive ? "bg-primary/10" : ""}`}>
                <item.icon className="w-5 h-5" />
              </span>
              <span className="text-[10px] font-semibold leading-none">{item.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
