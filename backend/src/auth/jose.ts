type Jose = typeof import('jose', { with: { 'resolution-mode': 'import' } });

export type { JWTVerifyGetKey } from 'jose' with { 'resolution-mode': 'import' };

/**
 * jose is ESM only and this backend compiles to CommonJS, so it is pulled in
 * with a dynamic import rather than a top level one. TypeScript keeps `import()`
 * intact under module: Node16, so this survives the CommonJS emit instead of
 * being rewritten into a require. The account system does the same thing for
 * oidc-provider.
 *
 * Memoised, because both the discovery service and the client reach for it and
 * the module does real work on first load.
 */
let loading: Promise<Jose> | null = null;

export function jose(): Promise<Jose> {
  loading ??= import('jose');
  return loading;
}
