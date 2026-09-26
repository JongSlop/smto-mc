import type { ServerMeta, ServiceStatus } from '@smto/mc-contracts';

import { apiAuthed, apiPublic } from '$lib/server/api';
import type { LayoutServerLoad } from './$types';

/** Nothing on offer until the backend says otherwise. */
const NO_SERVICES: ServiceStatus = {
  launcher: null,
  uploader: { enabled: false },
  account: null,
};

/**
 * What the header needs: the server list for its dropdown, and which other
 * smto.dev services this deployment can hand somebody over to.
 *
 * Both live in the layout because the header renders on every page in this
 * group, and since there is no server index any more, the dropdown is the only
 * way to reach a server at all.
 *
 * Neither is fetched for a visitor who is not signed in: the nav is not
 * rendered for them, so the landing page would be paying for two calls nothing
 * reads. Both are navigation rather than content, so a backend hiccup costs
 * the menu and not the page somebody was on.
 */
export const load: LayoutServerLoad = async ({ locals, cookies }) => {
  if (!locals.account) {
    return { servers: [] as ServerMeta[], services: NO_SERVICES };
  }

  const [servers, services] = await Promise.all([
    apiPublic<ServerMeta[]>('/api/v1/public/servers').catch(() => [] as ServerMeta[]),
    apiAuthed<ServiceStatus>(cookies, '/api/v1/me/services').catch(() => NO_SERVICES),
  ]);

  return { servers, services };
};
