import { defineConfig } from 'vitest/config';
import { resolve } from 'path';

// Logic-only unit tests (RBAC registry + role matrix). No DOM required, so we run
// in a plain node environment and skip the app's vite/react plugin stack.
export default defineConfig({
  resolve: {
    alias: {
      // Resolve the shared RBAC core from source so tests need no build step.
      '@wayrune/rbac': resolve(__dirname, '../../packages/rbac/src/index.ts'),
    },
  },
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
  },
});
