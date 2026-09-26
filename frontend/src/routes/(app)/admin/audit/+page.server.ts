import type { AuditPage } from '@smto/mc-contracts';

import { apiAuthed } from '$lib/server/api';
import type { PageServerLoad } from './$types';

/**
 * Cursor paging rather than page numbers, matching the API: rows arrive
 * constantly, and an offset would skip or repeat entries between one page and
 * the next.
 */
export const load: PageServerLoad = async ({ cookies, url }) => {
  const cursor = url.searchParams.get('cursor');
  const query = cursor ? `?cursor=${encodeURIComponent(cursor)}` : '';

  return { page: await apiAuthed<AuditPage>(cookies, `/api/v1/admin/audit${query}`) };
};
