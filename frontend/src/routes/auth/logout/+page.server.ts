import { redirect } from '@sveltejs/kit';

import { base } from '$app/paths';
import { endSession } from '$lib/server/api';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = () => {
  redirect(303, `${base}/`);
};

export const actions: Actions = {
  default: async ({ cookies }) => {
    const endSessionUrl = await endSession(cookies);

    // Sending the browser on to the account system's end session endpoint means
    // signing out here signs you out there too. Staying signed in to one and
    // not the other is the kind of surprise that gets somebody's account used
    // on a shared machine.
    redirect(303, endSessionUrl ?? `${base}/`);
  },
};
