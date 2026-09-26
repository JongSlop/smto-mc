import type { ServerMeta } from '@smto/mc-contracts';

import { apiPublic } from '$lib/server/api';
import type { PageServerLoad } from './$types';

/**
 * The servers that have closed, as their own page.
 *
 * Fetched here rather than read off the layout: the layout only loads the list
 * for somebody signed in, because that is the only person the header nav is
 * rendered for, and this page is public the same way a single server page is.
 *
 * The filtering happens here and not in the API. `GET /public/servers` returns
 * every public server in one call, which the header needs anyway, so a second
 * state-filtered endpoint would be a round trip bought for nothing.
 */
export const load: PageServerLoad = async () => {
  const servers = await apiPublic<ServerMeta[]>('/api/v1/public/servers');

  return { servers: servers.filter((server) => server.state === 'ARCHIVED') };
};
