import { defineConfig } from 'vite';

/** Optional theme JS (IIFE). Most themes only need CSS + tokens. */
export default defineConfig({
  build: {
    lib: {
      entry: 'src/theme.ts',
      name: 'PresenceTheme',
      formats: ['iife'],
      fileName: () => 'theme.js',
    },
    outDir: 'dist',
    emptyOutDir: true,
    rollupOptions: {
      output: { inlineDynamicImports: true },
    },
  },
});
