import { Component } from "react";

export default class LazyErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error) {
    const isLazyError =
      error?.message?.includes("dynamically imported module") ||
      error?.message?.includes("Failed to fetch") ||
      error?.message?.includes("Loading chunk") ||
      error?.message?.includes("Loading CSS chunk");

    if (isLazyError) {
      const key = "lazy_reload_" + window.location.pathname;
      const lastReload = sessionStorage.getItem(key);
      const now = Date.now();
      // Allow reload once every 15 seconds to avoid infinite loops
      if (!lastReload || now - Number(lastReload) > 15000) {
        sessionStorage.setItem(key, String(now));
        // Force hard reload bypassing cache
        window.location.href = window.location.pathname + "?_cb=" + now;
        return;
      }
    }
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="fixed inset-0 flex flex-col items-center justify-center bg-background gap-4">
          <p className="text-sm text-muted-foreground">Erro ao carregar a página.</p>
          <button
            onClick={() => window.location.reload()}
            className="px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium"
          >
            Recarregar
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}