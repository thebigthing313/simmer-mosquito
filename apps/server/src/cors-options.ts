/**
 * Which cross-origin methods each route prefix admits.
 *
 * This is a hidden coupling and it is worth saying so plainly. `main.ts`
 * mounts CORS by path prefix; each of the 26 `register*Routes` modules chooses
 * its own paths internally. Nothing connects the two, so adding a route with a
 * verb its prefix does not admit fails only from a browser, only cross-origin,
 * and only in an environment where the SPA and the API are different origins —
 * which local `Caddyfile.local` is not, so it survives local testing.
 *
 * It had already gone wrong once when this table was written by hand: `/map/*`
 * admitted `GET` only while `map-tiles.ts` registered
 * `POST /map/habitats/by-ids`. And `/sync/*` needed its `POST` added by a
 * failing request rather than by a check, when the subset transport landed.
 *
 * `cors-options.test.ts` is the check. It calls `registerAllRoutes`, the same
 * function `main.ts` calls rather than a copy of its calls, and asserts each
 * registered `(method, path)` is admitted here. The copy is what this used to
 * be, and a copy does not fail when it is missing a module. Two modules had
 * never been walked, and `GET /search` shipped with no surface at all (#280).
 * Adding a module to `routes.ts` is what puts it in front of this table.
 */

export interface CorsSurface {
	/** A Hono path prefix, as passed to `app.use`. */
	readonly prefix: string;
	readonly methods: readonly string[];
}

/** Reads and writes over the same prefix — the command endpoints. */
const WRITE_METHODS = ['POST', 'PATCH', 'DELETE', 'OPTIONS'];
/** The map and record reads, and the geocoder. */
const READ_METHODS = ['GET', 'OPTIONS'];

export const ADMIN_CORS_ALLOW_METHODS = ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'];

export const CORS_SURFACES: readonly CorsSurface[] = [
	// One exact path. Railway's healthcheck is server to server and needs no
	// CORS, but a path no prefix claims is what `corsSurfaceFor` answers `null`
	// for, and the walk refuses that rather than guessing it was deliberate.
	{ prefix: '/health', methods: READ_METHODS },
	{ prefix: '/auth/*', methods: ['GET', 'POST', 'OPTIONS'] },
	{ prefix: '/admin/*', methods: ADMIN_CORS_ALLOW_METHODS },
	// POST carries Electric subset snapshot params in the body (on-demand
	// collections); the live shape-log stream still rides GET.
	{ prefix: '/sync/*', methods: ['GET', 'POST', 'OPTIONS'] },
	{ prefix: '/map/*', methods: READ_METHODS },
	{ prefix: '/geocoder/*', methods: READ_METHODS },
	{ prefix: '/records/*', methods: READ_METHODS },
	// One exact path, not a prefix: `/search` is the whole surface, and the
	// results page's filter and paging ride in the query string. It is
	// cross-origin in every environment — the SPA is a static host and the API is
	// its own origin — so without this the palette's fetch fails in the browser
	// and nowhere else.
	{ prefix: '/search', methods: READ_METHODS },
	// The per-table command surface. One prefix for all of it, agency tables and
	// operator tables alike — CORS is about which origin may ask, and the door a
	// table sits behind is decided by its middleware, not by its path.
	{ prefix: '/commands/*', methods: WRITE_METHODS },
	{ prefix: '/foundation/*', methods: WRITE_METHODS },
	{ prefix: '/control-methods/*', methods: WRITE_METHODS },
	{ prefix: '/control-assets/*', methods: WRITE_METHODS },
	{ prefix: '/control-products/*', methods: WRITE_METHODS },
	{ prefix: '/organization-settings/*', methods: ['PATCH', 'OPTIONS'] },
	{ prefix: '/public-engagement/*', methods: WRITE_METHODS },
	// GET as well as the writes: `sample-reads.ts` registers
	// `/larval-surveillance/samples/awaiting`, a cross-habitat rollup the larval
	// overview fetches. It is the only read under a command prefix, and the only
	// reason it works today is that a credentialed `fetch` with no custom header
	// is a *simple* request and skips the preflight entirely — one `accept`
	// header away from a refusal nobody would connect to this table.
	{ prefix: '/larval-surveillance/*', methods: ['GET', ...WRITE_METHODS] },
	{ prefix: '/adult-surveillance/*', methods: WRITE_METHODS },
	{ prefix: '/control-operations/*', methods: WRITE_METHODS },
	{ prefix: '/field-work/*', methods: WRITE_METHODS },
	{ prefix: '/mission-dispatch/*', methods: WRITE_METHODS },
	// DELETE joined when a membership became endable (ADR 0011's offboarding
	// lifecycle); it is the only delete under this prefix.
	{ prefix: '/organization/*', methods: ['POST', 'PATCH', 'DELETE', 'OPTIONS'] },
];

/**
 * The surface a path falls under, or `null` if no prefix claims it.
 *
 * Longest prefix wins, so `/organization-settings/*` is not shadowed by
 * `/organization/*` — which it would be under a first-match rule, and which is
 * the kind of thing that only shows up as a refused PATCH from one origin.
 *
 * The comparison strips the trailing `*` from both sides. It used to strip it
 * from one and subtract a character from the other, which agreed for every entry
 * ending in `/*` and would have been off by one for an exact path like
 * `/search`.
 */
export function corsSurfaceFor(path: string): CorsSurface | null {
	let best: CorsSurface | null = null;
	for (const surface of CORS_SURFACES) {
		const base = surface.prefix.replace(/\*$/, '');
		const bestBase = best === null ? '' : best.prefix.replace(/\*$/, '');
		if (path.startsWith(base) && base.length > bestBase.length) {
			best = surface;
		}
	}
	return best;
}
