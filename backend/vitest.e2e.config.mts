import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/**/*.e2e-spec.ts'],
    globals: true,
    root: './',
    testTimeout: 30_000,
    hookTimeout: 60_000,
    // The suite shares one database, so parallel files would fight over it.
    fileParallelism: false,
    setupFiles: ['./test/setup-e2e.ts'],
  },
  plugins: [
    // Nest's dependency injection reads decorator metadata at runtime, which
    // esbuild does not emit. swc does.
    swc.vite({ module: { type: 'es6' } }),
  ],
});
