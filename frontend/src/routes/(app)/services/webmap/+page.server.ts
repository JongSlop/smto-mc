import type { ServerMeta } from '@smto/mc-contracts';

import { apiPublic } from '$lib/server/api';
import { webmapEntries } from '$lib/webmap';
import type { PageServerLoad } from './$types';

/**
 * Every server that has a web map, for somebody to choose between.
 *
 * Public, like the server pages it sits beside: the list is public server
 * metadata and the maps are whatever the admin chose to link. The menu entry
 * that points here only shows for a signed in visitor with something to open,
 * but the page does not depend on either, and says so if it is empty.
 */
export const load: PageServerLoad = async () => {
  const servers = await apiPublic<ServerMeta[]>('/api/v1/public/servers');

  return { maps: webmapEntries(servers) };
};
