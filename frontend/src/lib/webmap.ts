import { serverWebmapUrl, type ServerMeta } from '@smto/mc-contracts';

export interface WebmapEntry {
  server: ServerMeta;
  url: string;
}

/**
 * The servers that have a web map, each with the address to send somebody to.
 *
 * One place decides what counts, so the menu entry and the page cannot
 * disagree: the entry is shown when this is not empty, and the page lists
 * exactly this. The order is the one the server list already arrives in, which
 * is the admin's own. Archived servers are included: an old world's map is
 * worth keeping reachable, and it is the admin who decides by leaving the
 * address in or taking it out.
 */
export function webmapEntries(servers: ServerMeta[]): WebmapEntry[] {
  return servers.flatMap((server) => {
    const url = serverWebmapUrl(server.extra);
    return url === null ? [] : [{ server, url }];
  });
}
