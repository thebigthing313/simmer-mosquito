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

import { alwaysVisibleRuntime, type SyncCollectionClientOptions } from '@simmer-mosquito/sync';
import { getServerUrl } from '../../auth';

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
