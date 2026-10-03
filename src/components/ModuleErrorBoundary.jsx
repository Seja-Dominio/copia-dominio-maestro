import React from 'react';

class SafeBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error) {
    console.error('[SafeBoundary] caught:', error?.message);
  }

  render() {
    if (!this.state.hasError) return this.props.children;

    return (
      <div className="flex flex-col items-center justify-center min-h-[50vh] gap-4 p-8">
        <p role="alert" className="text-destructive font-semibold">Erro ao carregar</p>
        <p className="text-sm text-muted-foreground text-center max-w-md">{this.state.error?.message}</p>
        <button
          onClick={() => {
            this.setState({ hasError: false, error: null });
            window.location.replace(`${window.location.pathname}?_cb=${Date.now()}`);
          }}
          className="px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium"
        >
          Recarregar
        </button>
      </div>
    );
  }
}

export default function ModuleErrorBoundary({ moduleName, children }) {
  return <SafeBoundary key={moduleName}>{children}</SafeBoundary>;
}
