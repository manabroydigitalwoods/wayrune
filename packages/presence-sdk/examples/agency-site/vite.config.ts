import { fileURLToPath, URL } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
      '@site': fileURLToPath(new URL('./site', import.meta.url)),
    },
  },
  server: {
    port: 5179,
    open: false,
  },
  publicDir: false,
  build: {
    outDir: 'preview-dist',
    emptyOutDir: true,
  },
});
