import type { Account } from '@smto/mc-contracts';

import type { Language } from '$lib/language';

declare global {
  namespace App {
    interface Locals {
      lang: Language;
      /** The signed-in account, or null. Resolved once per request in hooks. */
      account: Account | null;
    }

    interface PageData {
      lang: Language;
      account: Account | null;
    }
  }
}

export {};
