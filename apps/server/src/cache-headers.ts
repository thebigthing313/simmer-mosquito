/**
 * The two response headers every cookie-authorized read has to carry.
 *
 * `sync-shapes.ts` already argues this at length for the Electric proxy, and
 * every word of it applies to the map reads:
 *
 * > `public` is wrong because these routes sit behind the session cookie and
 * > the server *forces* the org-scoped `where` … Two operators hit
 * > byte-identical URLs and must not receive each other's rows, so a response
 * > that any shared cache may store is a tenancy leak waiting on a proxy nobody
 * > remembered was there.
 *
 * `/map/tiles/habitats/13/1310/3166.mvt` carries no organization id. The scope
 * comes from `authContext.organization.id`, read out of the session inside the
 * handler. ADR 0005 lets one login belong to several agencies and `apps/web`
 * switches organization without changing that URL, so the same browser, on the
 * same URL, is entitled to two different tenants' geometry.
 *
 * The tile route sent no `cache-control` at all, which is not the same mistake
 * the sync proxy made — a response with no freshness header, no `ETag` and no
 * `Last-Modified` gets a heuristic freshness of zero in a conforming cache — but
 * it leaves the same gap, and it leaves the decision to `mapbox-gl`, which keeps
 * its own URL-keyed tile cache and honours whatever it is told.
 *
 * If tile caching is wanted later, and it is a reasonable thing to want because
 * tiles are expensive, the way to get it is to put the organization id in the
 * path. Not to relax this header.
 */

import type { MiddlewareHandler } from 'hono';

/**
 * Prefixes whose responses are organization-scoped reads on tenant-identical
 * URLs.
 *
 * `/sync/*` is deliberately absent: `proxyElectricShape` forces the same two
 * headers itself, because it has to *replace* Electric's
 * `public, max-age=604800` rather than add to nothing.
 *
 * `/search` is here for the same reason `/map/*` is, and one more: the response
 * varies by which agency the caller is currently in, and one login can belong to
 * several. The organization id is nowhere in the URL, so two agencies hit
 * byte-identical URLs. Freshness across keystrokes is client memory, not an HTTP
 * cache.
 *
 * It is `'/search'` and not `'/search*'`. Hono treats `*` as a wildcard only
 * where it is a whole path segment or a trailing `/*`; anywhere else it is
 * escaped to a literal asterisk, so `'/search*'` registers middleware that
 * matches nothing and never runs. A prefix that silently covers no route is the
 * worst shape this list can take, which is why `cache-headers.test.ts` now
 * drives a request at every entry rather than only asserting the array.
 */
export const PRIVATE_READ_PREFIXES = ['/map/*', '/records/*', '/search'] as const;

export const privateNoStore: MiddlewareHandler = async (context, next) => {
	await next();
	context.res.headers.set('cache-control', 'private, no-store');
	context.res.headers.set('vary', 'cookie');
};
