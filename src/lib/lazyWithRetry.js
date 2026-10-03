import { lazy } from 'react';

const CHUNK_RETRY_DELAY_MS = 1500;

export function lazyWithRetry(factory) {
  return lazy(async () => {
    try {
      return await factory();
    } catch {
      await new Promise((resolve) => setTimeout(resolve, CHUNK_RETRY_DELAY_MS));
      return factory();
    }
  });
}
