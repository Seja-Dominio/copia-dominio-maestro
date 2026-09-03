import { Link, useLocation } from "react-router-dom";
import { LayoutDashboard, FolderKanban, Briefcase, Calendar, Users } from "lucide-react";
import { useEffect } from "react";

const NAV_ITEMS = [
  { label: "Dashboard", icon: LayoutDashboard, page: "Dashboard" },
  { label: "Projetos",  icon: FolderKanban,    page: "Projects" },
  { label: "Jobs",      icon: Briefcase,        page: "Jobs" },
  { label: "Agenda",    icon: Calendar,         page: "Agenda" },
  { label: "Carteira",  icon: Users,            page: "ClientPortfolio" },
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

export default function BottomNav({ currentPageName }) {
  useScrollPreservation();

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-50 md:hidden bg-card border-t border-border safe-bottom"
    >
      <div className="flex items-stretch">
        {NAV_ITEMS.map((item) => {
          const isActive = currentPageName === item.page;
          return (
            <Link
              key={item.page}
              to={`/${item.page}`}
              aria-label={`Ir para ${item.label}`}
              aria-current={isActive ? "page" : undefined}
              className={`flex-1 flex flex-col items-center justify-center gap-1 py-2 no-underline transition-colors min-h-[56px]
                ${isActive ? "text-primary" : "text-muted-foreground"}`}
            >
              <item.icon className="w-5 h-5" />
              <span className="text-[10px] font-semibold leading-none">{item.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}