import { useState, useEffect } from "react";
import AIAssistant from "@/components/AIAssistant";
import AdminChat from "@/components/admin/AdminChat";
import FloatingTodoList from "@/components/todo/FloatingTodoList";
import BottomNav from "@/components/BottomNav";
import MobileUserSheet from "@/components/MobileUserSheet";
import PageTransition from "@/components/PageTransition";
import { useNavigation } from "@/components/NavigationStack";
import { Link } from "react-router-dom";
import {
  LayoutDashboard, FolderKanban, Briefcase, FileText,
  TrendingUp, MessageSquare, Users, BarChart3, Calendar, Instagram,
  HelpCircle, ChevronDown, ChevronLeft,
  Sun, Moon, Settings, FileCheck } from "lucide-react";

import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import {
  Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import NotificationBell from "@/components/dashboard/NotificationBell";
import { useNavigate } from "react-router-dom";
import { createPageUrl } from "@/utils";

const ALL_NAV_ITEMS = [
  { label: "Dashboard", icon: LayoutDashboard, page: "Dashboard" },
  { label: "Projetos",  icon: FolderKanban,    page: "Projects" },
  { label: "Jobs",      icon: Briefcase,        page: "Jobs" },
  { label: "Propostas", icon: FileText,         page: "Proposals" },
  { label: "Documentos",icon: FileCheck,        page: "Documentos" },
  { label: "Agenda",    icon: Calendar,         page: "Agenda" },
  { label: "Carteira",  icon: Users,            page: "ClientPortfolio" },
  { label: "Financeiro",icon: TrendingUp,       page: "Financial" },
  { label: "Conversas", icon: MessageSquare,    page: "Conversations" },
  { label: "Insights",  icon: Instagram,        page: "Instagram" },
  { label: "Relatórios",icon: BarChart3,        page: "Reports" },
];

const COLLABORATOR_NAV_ITEMS = [
  { label: "Dashboard", icon: LayoutDashboard, page: "Dashboard" },
  { label: "Projects",  icon: FolderKanban,    page: "Projects" },
  { label: "Jobs",      icon: Briefcase,       page: "Jobs" },
  { label: "Agenda",    icon: Calendar,        page: "Agenda" },
  { label: "Carteira",  icon: Users,           page: "ClientPortfolio" },
];

const getNavItems = (accessLevel) =>
  (accessLevel === "admin" || accessLevel === "master" || accessLevel === "gestor") ? ALL_NAV_ITEMS : COLLABORATOR_NAV_ITEMS;

export default function Layout({ children, currentPageName }) {
  const [user, setUser] = useState(null);
  const [collaboratorData, setCollaboratorData] = useState(null);

  const [darkMode, setDarkMode] = useState(() => localStorage.getItem("darkMode") === "true");
  const { canGoBack } = useNavigation();
  const navigate = useNavigate();

  // Inatividade gerenciada pelo InactivityGuard (em App.jsx)    
  useEffect(() => {
    const loadUser = async () => {
      try {
        const u = await base44.auth.me();
        if (u) setUser(u);
      } catch {}
    };
    loadUser();
    const collabSession = sessionStorage.getItem("collaborator");
    if (collabSession) setCollaboratorData(JSON.parse(collabSession));
  }, []);

  // Rastrear última página visitada pelo colaborador
  useEffect(() => {
    if (!collaboratorData?.id || !currentPageName) return;
    const pageLabel = {
      Dashboard: "Dashboard", Projects: "Projetos", Jobs: "Jobs",
      Proposals: "Propostas", Agenda: "Agenda", ClientPortfolio: "Carteira",
      Financial: "Financeiro", Conversations: "Conversas", Reports: "Relatórios",
      Configuracoes: "Configurações", Settings: "Settings",
    }[currentPageName] || currentPageName;
    base44.entities.Collaborator.update(collaboratorData.id, {
      last_seen_page: pageLabel,
      last_seen_at: new Date().toISOString(),
    }).catch(() => {});
  }, [currentPageName, collaboratorData?.id]);

  useEffect(() => {
    if (darkMode) document.documentElement.classList.add("dark");
    else          document.documentElement.classList.remove("dark");
    localStorage.setItem("darkMode", darkMode);
  }, [darkMode]);

  const isActive = (page) => currentPageName === page;

  const breadcrumbMap = {
    Dashboard:       "Dashboard",
    Projects:        "Projetos",
    Jobs:            "Jobs",
    Proposals:       "Propostas / Comercial",
    ClientPortfolio: "Carteira de Clientes",
    Financial:       "Financeiro / Lançamentos",
    Conversations:   "Conversas",
    Records:         "Cadastros",
    Reports:         "Relatórios",
    Templates:       "Configurações / Templates",
    Settings:        "Recuperação / Settings",
    Configuracoes:   "Configurações",
  };

  const pageTitle = breadcrumbMap[currentPageName] || currentPageName;

  return (
    <TooltipProvider>
      <div className="min-h-screen bg-background flex flex-col font-inter">

        {/* ─── HEADER ─────────────────────────────────────────────────── */}
        <header className="h-14 bg-card border-b border-border flex items-center px-4 gap-3 sticky top-0 z-50 shadow-sm safe-top">

          {/* Mobile: back button only */}
          {/* Mobile back button — shown when there's history OR when not on a tab root */}
          <div className="md:hidden flex items-center">
            {canGoBack && (
              <Button variant="ghost" size="icon" onClick={() => navigate(-1)} aria-label="Voltar">
                <ChevronLeft className="w-5 h-5" />
              </Button>
            )}
          </div>

          {/* Logo — desktop only */}
          <Link to="/Dashboard"
            className="hidden md:flex items-center mr-4 flex-shrink-0 no-underline">
            <img
              src="https://media.base44.com/images/public/69b0ac7e08d578f9756170a0/bcb38b8d5_VERTICALSEMFUNDO.png"
              alt="Domínio Performance"
              className="h-9 w-auto object-contain"
            />
          </Link>

          {/* Mobile: centered page title */}
          <div className="flex-1 flex md:hidden justify-center">
            <span className="text-sm font-semibold text-foreground truncate max-w-[200px]">
              {pageTitle}
            </span>
          </div>

          {/* Desktop nav */}
          <nav className="hidden md:flex items-center gap-1 flex-1 overflow-x-auto">
            {getNavItems(collaboratorData?.access_level || "collaborator").map((item) => (
              <Link
                key={item.page}
                to={`/${item.page}`}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold whitespace-nowrap transition-all duration-150 no-underline ${
                  isActive(item.page)
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:text-foreground hover:bg-muted"
                }`}
              >
                <item.icon className="w-3.5 h-3.5" />
                {item.label}
              </Link>
            ))}
          </nav>

          {/* Utilities (notifications + user menu) */}
          <div className="flex items-center gap-1 ml-auto flex-shrink-0">
            <NotificationBell collaboratorId={collaboratorData?.id} />

            {/* Mobile: bottom sheet */}
            <div className="md:hidden">
              <MobileUserSheet
                user={user}
                darkMode={darkMode}
                onToggleDark={() => setDarkMode(d => !d)}
                isAdmin={collaboratorData?.access_level === "admin"}
                onLogout={() => {
                  sessionStorage.removeItem("collaborator");
                  base44.auth.logout();
                }}
              />
            </div>

            {/* Desktop: dropdown */}
            <div className="hidden md:block">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" className="gap-2 h-8 px-2">
                    <div className="w-7 h-7 rounded-full bg-primary flex items-center justify-center text-primary-foreground text-xs font-bold">
                      {(collaboratorData?.name || user?.full_name)?.[0]?.toUpperCase() || "U"}
                    </div>
                    <span className="text-xs font-medium max-w-24 truncate">
                      {collaboratorData?.name || user?.full_name || "Usuário"}
                    </span>
                    <ChevronDown className="w-3 h-3 text-muted-foreground" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56">
                  <div className="px-2 py-1.5">
                    <p className="text-sm font-medium">{collaboratorData?.name || user?.full_name || "Usuário"}</p>
                    <p className="text-xs text-muted-foreground">{collaboratorData?.email || user?.email}</p>
                  </div>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={() => setDarkMode((d) => !d)}>
                    {darkMode ? <Sun className="w-4 h-4 mr-2" /> : <Moon className="w-4 h-4 mr-2" />}
                    {darkMode ? "Modo Claro" : "Modo Escuro"}
                  </DropdownMenuItem>
                  <DropdownMenuItem>
                    <HelpCircle className="w-4 h-4 mr-2" /> Ajuda
                  </DropdownMenuItem>
                  {(collaboratorData?.access_level === "admin" || collaboratorData?.access_level === "master" || collaboratorData?.access_level === "gestor") && (
                    <Link to="/Configuracoes" className="no-underline">
                      <DropdownMenuItem>
                        <Settings className="w-4 h-4 mr-2" /> Configurações
                      </DropdownMenuItem>
                    </Link>
                  )}
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={() => {
                    sessionStorage.removeItem("collaborator");
                    base44.auth.logout();
                  }}>
                    Sair
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        </header>



        {/* Main content */}
        <main
          className="flex-1 overflow-auto"
          style={{
            WebkitOverflowScrolling: "touch",
            paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 64px)",
          }}
        >
          <PageTransition>
            {children}
          </PageTransition>
        </main>

        <AIAssistant currentPage={currentPageName} />
        {(collaboratorData?.access_level === "admin" || collaboratorData?.access_level === "master" || collaboratorData?.access_level === "gestor") && <AdminChat />}
        <FloatingTodoList />

        {/* Bottom Navigation — mobile only */}
        <BottomNav currentPageName={currentPageName} />


      </div>
    </TooltipProvider>
  );
}