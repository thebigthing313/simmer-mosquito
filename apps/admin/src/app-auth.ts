import {
	createAppAuthController,
	createSessionRecovery,
	sessionLostDestination,
} from '@simmer-mosquito/auth/browser';
import { setSessionRecovery } from '@simmer-mosquito/sync/session-fetch';
import { getAuthMe } from './api';

/**
 * The one route a reader can be on without a session.
 *
 * Read by the route guard and by the recovery below, which must not bounce a
 * reader off the page that signs them back in.
 */
export const publicPaths: ReadonlySet<string> = new Set(['/sign-in']);

/**
 * The operator session, as one module-level value the router and the shell both
 * read. The controller itself lives in `@simmer-mosquito/auth/browser`, shared
 * with the agency workspace; this is the console's binding of it.
 */
export const appAuthController = createAppAuthController({ getAuthMe });

/**
 * The console's answer to a refused collection, which is the workspace's answer
 * with its own front door.
 *
 * It needs one for the same reason: the shape routes verify the session and
 * leave renewing it to `/auth/me` (#298), so the global taxonomy collections
 * meet an expired access token as a 401 and have to renew rather than give up.
 */
const recoverSession = createSessionRecovery({
	controller: appAuthController,
	onSessionLost: () => {
		const destination = sessionLostDestination({
			signInPath: '/sign-in',
			publicPaths,
			location: window.location,
		});

		if (destination !== null) {
			window.location.assign(destination);
		}
	},
});

// Installed here, beside the thing it installs, because every surface needs it
// and only some of them touch a collection. Installing it from the collection
// options left the console's `/organizations/*` pages, which import no
// collection at all, with no renewal on any request they make.
//
// The subpath import is what keeps this off the entry chunk's weight: the
// package barrel re-exports all fifty-four collection modules and their row
// schemas, and `main.tsx` imports this module.
setSessionRecovery(recoverSession);
