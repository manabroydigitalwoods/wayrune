import { defineConfig } from 'vite';

/** IIFE build for PresenceMount → dist/index.js (package upload). */
export default defineConfig({
  build: {
    lib: {
      entry: 'src/mount.ts',
      name: 'PresenceComponent',
      formats: ['iife'],
      fileName: () => 'index.js',
    },
    outDir: 'dist',
    emptyOutDir: false,
    rollupOptions: {
      output: {
        inlineDynamicImports: true,
      },
    },
  },
});
