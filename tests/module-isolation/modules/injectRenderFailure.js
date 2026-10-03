export function throwInjectedRenderError(moduleName) {
  if (new URLSearchParams(window.location.search).get('crash') === moduleName) {
    throw new Error(`Falha de renderização injetada em ${moduleName}`);
  }
}
