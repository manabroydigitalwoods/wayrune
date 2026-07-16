import { defineConfig } from 'vitest/config';
import swc from 'unplugin-swc';
import { resolve } from 'path';

export default defineConfig({
  plugins: [
    swc.vite({
      jsc: {
        parser: { syntax: 'typescript', decorators: true },
        transform: { legacyDecorator: true, decoratorMetadata: true },
        target: 'es2022',
      },
      module: { type: 'es6' },
    }),
  ],
  test: {
    include: ['test/**/*.integration.spec.ts'],
    environment: 'node',
    testTimeout: 60000,
    hookTimeout: 60000,
    pool: 'forks',
    // Integration specs share a single database. Registering an org upserts the
    // whole permission catalog, so running files concurrently makes those upserts
    // (and other writes) deadlock. Run specs sequentially for a stable DB.
    fileParallelism: false,
    setupFiles: [resolve(__dirname, 'test/setup-env.ts')],
  },
});
