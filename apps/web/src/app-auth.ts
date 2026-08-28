import {
	createAppAuthController,
	createSessionRecovery,
	sessionLostDestination,
} from '@simmer-mosquito/auth/browser';
import { setSessionRecovery } from '@simmer-mosquito/sync/session-fetch';
import { getAuthMe } from './auth';

/**
 * The routes a reader can be on without a session.
 *
 * Here rather than in the root route because two things now read it: the route
 * guard, which is where it was, and the session recovery below, which must not
 * bounce a reader off the very page that would sign them back in.
 */
export const publicPaths: ReadonlySet<string> = new Set([
	'/landing',
	'/sign-in',
	'/sign-up',
	'/forgot-password',
	'/reset-password',
	'/accept-invitation',
]);

/**
 * This app's session snapshot. The controller itself lives in
 * `@simmer-mosquito/auth/browser` — the operator console keeps the same one over
 * its own `/auth/me` — so what stays here is the binding and the fact that there
 * is exactly one of it.
 */
export const appAuthController = createAppAuthController({ getAuthMe });

/**
 * What every synced collection does when the server refuses it.
 *
 * Renew once through `/auth/me` and let the refused request be asked again; if
 * the session is really gone, land on the same screen the route guard sends an
 * unauthenticated visitor to. Before this, a refused shape reached the shell as
 * a ready collection with no rows and the workspace threw (#299).
 *
 * A full navigation rather than a router one, on purpose. Every collection in
 * memory belongs to the session that just ended, and the cheapest way to be sure
 * none of it is still on screen under the next sign-in is to load the page
 * again.
 */
const recoverSession = createSessionRecovery({
	controller: appAuthController,
	onSessionLost: () => {
		const destination = sessionLostDestination({
			signInPath: '/landing',
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
