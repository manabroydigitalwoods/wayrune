import { defineConfig } from 'vite';

/** Builds an IIFE that sets window.PresenceMount for Presence package upload. */
export default defineConfig({
  build: {
    lib: {
      entry: 'src/main.ts',
      name: 'PresenceComponent',
      formats: ['iife'],
      fileName: () => 'index.js',
    },
    outDir: 'dist',
    emptyOutDir: true,
    rollupOptions: {
      output: {
        inlineDynamicImports: true,
      },
    },
  },
});
