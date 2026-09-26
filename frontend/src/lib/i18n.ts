import { m } from './paraglide/messages.js';
import type { Language } from './language';

/**
 * Every message call needs a locale, and every request already knows its own
 * (locals.lang, set once in hooks.server.ts from the cookie or Accept-Language).
 * Passing that value on every single m.xxx() call would work but bury the copy
 * in repetition, so this binds it once and hands back something that reads like
 * m itself.
 *
 * There is deliberately no ambient "current locale": SvelteKit's request
 * handling is concurrent, and a shared mutable locale would let one request's
 * language leak into another's response.
 */
export function translate(locale: Language): typeof m {
  return new Proxy(m, {
    get(target, property, receiver) {
      const value = Reflect.get(target, property, receiver);
      if (typeof value !== 'function') {
        return value;
      }
      return (inputs?: Record<string, unknown>) => value(inputs, { locale });
    },
  });
}

/**
 * Backend errors arrive as machine-readable codes, not prose, so the wording
 * for each one lives in the message files under `error_<code>`. A code this
 * build has no copy for falls back to a generic line rather than rendering an
 * identifier at somebody.
 */
export function errorMessage(t: ReturnType<typeof translate>, code: string): string {
  const message = t[`error_${code}` as keyof typeof t];
  return typeof message === 'function' ? (message as () => string)() : t.error_generic();
}
