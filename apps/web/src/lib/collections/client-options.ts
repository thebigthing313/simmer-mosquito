/**
 * What every collection in this app passes, in one object.
 *
 * `serverUrl` is the same call in all fifty of them, and the development-only
 * visibility adapter has to be the same in all fifty or the one file that missed
 * it keeps hanging while the rest work. So both live here and each collection
 * spreads this rather than assembling its own.
 *
 * What is *not* here: `syncMode` and `mutations`. Those are decisions about a
 * particular table on a particular surface, and each collection module states its
 * own with the reasoning beside it.
 *
 * ## Why the adapter, and why only in development
 *
 * Electric pauses a shape stream while the tab reports hidden, and a stream born
 * hidden issues no HTTP requests at all, not slow ones but none, until the tab
 * becomes visible. The Claude Code Browser pane reports `hidden` for its tab even
 * when that tab is fronted, so browser verification of this app hung on a loading
 * skeleton with nothing in the network tab to explain it. `alwaysVisibleRuntime`
 * is Electric's supported opt-out: hand it a lifecycle and it stops reading
 * `document.hidden`.
 *
 * `import.meta.env.DEV` is replaced at build time, so both the adapter and its
 * import drop out of a production bundle. A deployed tab keeps pausing when it
 * goes hidden, which is what should happen there: otherwise a backgrounded tab
 * holds a connection open for every shape. There is nothing to configure and
 * nothing to remember before a browser check works.
 *
 * To reproduce production visibility behaviour while chasing a genuine visibility
 * bug, run a build (`pnpm --filter @simmer-mosquito/web build` and preview it)
 * rather than editing this.
 */

import {
	alwaysVisibleRuntime,
	type SyncCollectionClientOptions,
	setSessionRecovery,
} from '@simmer-mosquito/sync';
import { recoverSession } from '../../app-auth';
import { getServerUrl } from '../../auth';

// What a refused request means, for every shape stream and every command write
// this app makes. The routes verify the session and leave renewing it to
// `/auth/me` (#298), so a 401 is usually an access token that aged out and is
// cured by renewing once and asking again. When it cannot be cured, this is what
// sends the reader to sign in rather than leaving the page to break (#299).
//
// Installed here because every collection module imports this one, so it is in
// place before any of them can issue a request.
setSessionRecovery(recoverSession);

export const syncClientOptions: Pick<
	SyncCollectionClientOptions,
	'serverUrl' | 'runtimeVisibility'
> = {
	serverUrl: getServerUrl(),

	// Spread rather than assigned so the key is absent in a build rather than
	// present and holding `undefined`, which is what `exactOptionalPropertyTypes`
	// means and what `syncCollectionConfig` checks.
	...(import.meta.env.DEV ? { runtimeVisibility: alwaysVisibleRuntime } : {}),
};
