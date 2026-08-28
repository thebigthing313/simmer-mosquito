/**
 * Renewing the session for the one fetch this app does not make itself.
 *
 * Every other credentialed request goes through `sessionFetch`, which answers a
 * 401 by renewing once through `/auth/me` and asking again. Mapbox GL fetches
 * MVT tiles from its own worker: the app supplies a `transformRequest` that
 * hands back a URL and credentials, and there is no seam in that to observe a
 * refusal or retry it.
 *
 * Since #298 the tile routes verify the access token rather than renewing it, so
 * a token that ages out mid-session refuses the next tile. The shape streams
 * long-poll on a twenty second cadence and cure the session within that, but the
 * tile that was refused stays refused in GL's cache until something makes the map
 * ask again. Pan at the wrong moment and the record layers draw nothing (#300).
 *
 * The map already emits what is needed. GL fires an `error` event per failed
 * tile carrying the HTTP status and URL, and `use-tile-layer.ts` already forces a
 * refetch by re-pointing a source at the URLs it already has. This joins the two.
 */

/** How long before a refusal that outlived its renewal may trigger another. */
const RETRY_COOLDOWN_MS = 30_000;

/** What this reads off a GL error event. Its own shape, so a test needs no GL. */
export interface MapErrorLike {
	readonly error?: unknown;
}

/**
 * What this reads off a GL map. Satisfied structurally by a real `Map`.
 *
 * `getSource` is typed as returning `unknown` and probed below rather than
 * declared to return something with an optional `setTiles`. GL's own return is a
 * union over every source kind and only the vector one has that method, so a
 * type of nothing but optional properties is a weak type: `CanvasSource` shares
 * no property with it and TypeScript rejects the whole map as an argument.
 */
export interface TileSourceMapLike {
	getStyle: () => { readonly sources?: Record<string, unknown> } | undefined;
	getSource: (id: string) => unknown;
}

/**
 * Whether this error is one of our tiles being refused for want of a session.
 *
 * 401 only, and only from our own origin. Mapbox's style, sprite, glyph and
 * basemap requests come through the same event and never carried our session, so
 * renewing over one of those would sign a reader out for somebody else's outage.
 * A 403 is a decided answer rather than an expiry, the same line `sessionFetch`
 * draws.
 */
export function isRefusedServerTile(event: MapErrorLike, serverOrigin: string | null): boolean {
	if (serverOrigin === null) {
		return false;
	}

	const error = event.error;
	if (typeof error !== 'object' || error === null) {
		return false;
	}

	const { status, url } = error as { readonly status?: unknown; readonly url?: unknown };
	return status === 401 && typeof url === 'string' && url.startsWith(serverOrigin);
}

/**
 * Make the map ask for our tiles again, and report how many sources were asked.
 *
 * Re-pointing a vector source at the URLs it already holds is what discards GL's
 * cached failures for it; `use-tile-layer.ts` uses the same call to push a filter
 * change. Only our own sources are touched, because only ours were refused.
 *
 * The ids come from the style, which is the only place that lists them, but the
 * URLs are read off the live source first. A source's serialised form is GL's to
 * choose and a vector source can describe itself with a TileJSON `url` instead of
 * a `tiles` array; reading the live object means this does not go quietly inert
 * if that ever changes. `setTiles` is the test for a vector tile source, since it
 * is the only kind that has it.
 *
 * Wrapped because this runs from an error handler, which can fire while the map
 * is being torn down, and reading the style of a removed map throws.
 */
export function refetchServerTileSources(
	map: TileSourceMapLike,
	serverOrigin: string | null,
): number {
	if (serverOrigin === null) {
		return 0;
	}

	function ourTiles(value: unknown): string[] | null {
		if (!Array.isArray(value) || !value.every((tile) => typeof tile === 'string')) {
			return null;
		}
		return value.some((tile) => tile.startsWith(serverOrigin as string)) ? value : null;
	}

	try {
		const sources = map.getStyle()?.sources ?? {};
		let refetched = 0;

		for (const [id, spec] of Object.entries(sources)) {
			const source = map.getSource(id) as
				| { readonly tiles?: unknown; readonly setTiles?: (tiles: string[]) => void }
				| undefined;
			if (typeof source?.setTiles !== 'function') {
				continue;
			}

			const tiles =
				ourTiles(source.tiles) ?? ourTiles((spec as { readonly tiles?: unknown }).tiles);
			if (tiles === null) {
				continue;
			}

			source.setTiles(tiles);
			refetched += 1;
		}

		return refetched;
	} catch {
		// Map already removed; there is nothing left to refetch.
		return 0;
	}
}

/**
 * Build the error handler one map surface renews through.
 *
 * Two things are collapsed here. A viewport is a dozen tiles and GL emits an
 * error event for each, so the in-flight promise is shared and one expiry costs
 * one renewal and one refetch rather than twelve of each.
 *
 * And a refusal that outlives its renewal is not retried again for
 * {@link RETRY_COOLDOWN_MS}. A tile refused for a reason a session cannot fix
 * would otherwise renew, refetch, be refused, and repeat at network speed for as
 * long as the map is open. That should not happen — after a live renewal the
 * tile routes answer 401 only when there is no session at all — but "should not
 * happen" plus an unbounded loop is how a page starts hammering the API.
 */
export function createTileSessionRecovery(options: {
	/** The app's shared renewal. `false` means the session is gone. */
	readonly recoverSession: () => Promise<boolean>;
	readonly refetch: () => number;
	readonly serverOrigin: string | null;
	readonly now?: () => number;
}): (event: MapErrorLike) => Promise<void> {
	const now = options.now ?? (() => Date.now());
	let pending: Promise<void> | null = null;
	let lastAttemptAt: number | null = null;

	return async (event) => {
		if (!isRefusedServerTile(event, options.serverOrigin)) {
			return;
		}

		if (pending !== null) {
			await pending;
			return;
		}

		if (lastAttemptAt !== null && now() - lastAttemptAt < RETRY_COOLDOWN_MS) {
			return;
		}

		lastAttemptAt = now();
		pending = (async () => {
			// A false answer means the app is signing the reader out. Asking for the
			// tiles again would race that and be refused again.
			if (await options.recoverSession()) {
				options.refetch();
			}
		})().finally(() => {
			pending = null;
		});

		await pending;
	};
}
