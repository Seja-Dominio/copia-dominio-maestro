import { lazy } from 'react';

function isChunkLoadError(error) {
  const message = String(error?.message || error || "");
  return message.includes("dynamically imported module")
    || message.includes("Failed to fetch")
    || message.includes("Loading chunk")
    || message.includes("Loading CSS chunk");
}

function reloadWithFreshAssets() {
  const key = `lazy_reload_${window.location.pathname}`;
  const now = Date.now();
  const lastReload = Number(sessionStorage.getItem(key) || 0);

  if (now - lastReload > 15000) {
    sessionStorage.setItem(key, String(now));
    const url = new URL(window.location.href);
    url.searchParams.set("_cb", String(now));
    window.location.replace(url.toString());
    return new Promise(() => {});
  }

  return null;
}

export default function lazyWithRetry(factory) {
  return lazy(async () => {
    try {
      return await factory();
    } catch (error) {
      if (isChunkLoadError(error)) {
        const recovery = reloadWithFreshAssets();
        if (recovery) return recovery;
      }

      await new Promise(resolve => setTimeout(resolve, 1500));
      return factory();
    }
  });
}
