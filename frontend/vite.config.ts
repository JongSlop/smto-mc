import { paraglideVitePlugin } from '@inlang/paraglide-js';
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';

// Same variable the SvelteKit server reads to reach the backend, so a run on
// non-default ports only has to set it once.
const backend = process.env.BACKEND_INTERNAL_URL ?? 'http://127.0.0.1:3011';

export default defineConfig({
  plugins: [
    sveltekit(),
    paraglideVitePlugin({
      project: './project.inlang',
      outdir: './src/lib/paraglide',
      // Without this the generated .js carries its types as JSDoc only, and
      // svelte-check does not resolve those across a plain JS import.
      emitTsDeclarations: true,
      // Locale detection is our own: hooks.server.ts picks a language from the
      // cookie or Accept-Language and puts it on locals.lang, and every message
      // call passes that in explicitly (see lib/i18n.ts). Paraglide's own
      // strategy never runs, and this fallback only matters if a call forgets.
      strategy: ['baseLocale'],
    }),
  ],
  server: {
    port: 3010,
    strictPort: true,
    // Stands in for nginx during development, with the same rule as
    // docs/nginx-snippet.conf: the API prefix is stripped, because the backend
    // serves it from clean internal paths.
    //
    // With this in place a local PUBLIC_ORIGIN of http://localhost:3010/mc/link
    // drives a complete authorization flow without a proxy in front.
    proxy: {
      '/mc/link/api': {
        target: backend,
        rewrite: (path) => path.replace(/^\/mc\/link/, ''),
      },
    },
  },
});
