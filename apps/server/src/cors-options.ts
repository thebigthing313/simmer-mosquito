/**
 * Which cross-origin methods each route prefix admits.
 *
 * This is a hidden coupling and it is worth saying so plainly. `main.ts`
 * mounts CORS by path prefix; each of the 23 `register*Routes` modules chooses
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
 * `cors-options.test.ts` is the check. It stands up every route module and
 * asserts each registered `(method, path)` is admitted here, so the pair can
 * only disagree by someone deleting the test.
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
	{ prefix: '/auth/*', methods: ['GET', 'POST', 'OPTIONS'] },
	{ prefix: '/admin/*', methods: ADMIN_CORS_ALLOW_METHODS },
	// POST carries Electric subset snapshot params in the body (on-demand
	// collections); the live shape-log stream still rides GET.
	{ prefix: '/sync/*', methods: ['GET', 'POST', 'OPTIONS'] },
	{ prefix: '/map/*', methods: READ_METHODS },
	{ prefix: '/geocoder/*', methods: READ_METHODS },
	{ prefix: '/records/*', methods: READ_METHODS },
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
	{ prefix: '/organization/*', methods: ['POST', 'PATCH', 'OPTIONS'] },
];

/**
 * The surface a path falls under, or `null` if no prefix claims it.
 *
 * Longest prefix wins, so `/organization-settings/*` is not shadowed by
 * `/organization/*` — which it would be under a first-match rule, and which is
 * the kind of thing that only shows up as a refused PATCH from one origin.
 */
export function corsSurfaceFor(path: string): CorsSurface | null {
	let best: CorsSurface | null = null;
	for (const surface of CORS_SURFACES) {
		const base = surface.prefix.replace(/\*$/, '');
		if (path.startsWith(base) && (best === null || base.length > best.prefix.length - 1)) {
			best = surface;
		}
	}
	return best;
}
