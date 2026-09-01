/**
 * What every collection in this app passes, in one object.
 *
 * `serverUrl` is the same call in all fifty of them, and the hidden-tab
 * visibility adapter has to be the same in all fifty or the one file that missed
 * it keeps hanging while the rest work. So both live here and each collection
 * spreads this rather than assembling its own.
 *
 * What is *not* here: `syncMode` and `mutations`. Those are decisions about a
 * particular table on a particular surface, and each collection module states its
 * own with the reasoning beside it.
 *
 * ## Why the adapter, and where it is on
 *
 * Electric pauses a shape stream while the tab reports hidden, and a stream born
 * hidden issues no HTTP requests at all, not slow ones but none, until the tab
 * becomes visible. The Claude Code Browser pane reports `hidden` for its tab even
 * when that tab is fronted, so browser verification of this app hung on a loading
 * skeleton with nothing in the network tab to explain it. `alwaysVisibleRuntime`
 * is Electric's supported opt-out: hand it a lifecycle and it stops reading
 * `document.hidden`.
 *
 * It is on in local development and on staging, and off in production. Staging
 * exists to be driven by an agent against a clone of real data, so a deployed
 * staging build that paused in a hidden tab would reproduce that same hang for
 * the one environment built to be checked that way. Production keeps pausing,
 * which is what should happen there: otherwise a backgrounded tab holds a
 * connection open for every shape.
 *
 * Both halves of the condition are replaced at build time, so a production
 * bundle drops the adapter and its import. `import.meta.env.DEV` is false in any
 * `vite build`, staging included, which is why staging needs the second half:
 * `VITE_SIMMER_ENVIRONMENT` is the same variable the environment banner reads,
 * compared against a literal so an unset or empty `ARG` (#85) is production.
 *
 * To reproduce production visibility behaviour while chasing a genuine visibility
 * bug, run a build (`pnpm --filter @simmer-mosquito/web build` and preview it)
 * rather than editing this.
 */

import { alwaysVisibleRuntime, type SyncCollectionClientOptions } from '@simmer-mosquito/sync';
import { isStagingEnvironment } from '@simmer-mosquito/ui-web/lib/environment';
import { getServerUrl } from '../../auth';

/**
 * Whether this build keeps syncing while the tab reports hidden.
 *
 * Exported so the three cases can be asserted rather than reasoned about, and
 * because a wrong answer here is invisible until a shape hangs.
 */
export const syncsWhileHidden =
	import.meta.env.DEV || isStagingEnvironment(import.meta.env.VITE_SIMMER_ENVIRONMENT);

export const syncClientOptions: Pick<
	SyncCollectionClientOptions,
	'serverUrl' | 'runtimeVisibility'
> = {
	serverUrl: getServerUrl(),

	// Spread rather than assigned so the key is absent in a build rather than
	// present and holding `undefined`, which is what `exactOptionalPropertyTypes`
	// means and what `syncCollectionConfig` checks.
	...(syncsWhileHidden ? { runtimeVisibility: alwaysVisibleRuntime } : {}),
};
