import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { fileURLToPath } from 'url'
import { dirname, resolve } from 'path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const legacyApiTarget = process.env.VITE_BASE44_APP_BASE_URL

// https://vite.dev/config/
export default defineConfig({
  logLevel: 'error', // Suppress warnings, only show errors
  plugins: [react()],
  server: legacyApiTarget ? {
    proxy: {
      '/api': {
        target: legacyApiTarget,
        changeOrigin: true,
        secure: true,
      },
    },
  } : undefined,
  resolve: {
    alias: {
      '@': resolve(__dirname, './src'),
    },
    dedupe: ['react', 'react-dom'],
  },
});
