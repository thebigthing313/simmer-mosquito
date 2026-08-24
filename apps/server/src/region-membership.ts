import {
	isRegionMembershipRecordType,
	type Kysely,
	readRecordRegions,
	type SimmerDatabase,
} from '@simmer-mosquito/db';
import type { Hono, MiddlewareHandler } from 'hono';
import type { AuthVariables } from './auth-middleware.js';

/**
 * Which regions contain a record, for the band under its map card.
 *
 * The sibling of `/records/:recordType/:recordId/delete-impact`, and built to
 * read as one with it: one route for every geom-bearing record type, whitelisted
 * in `@simmer-mosquito/db`, scoped to the caller's agency, and answering
 * `found: false` rather than 404 for a record that is missing, another agency's,
 * or soft-deleted, so the three are indistinguishable and the endpoint cannot be
 * used to probe for ids.
 *
 * Not on `/map/*`, which is tilesets and one record's boundary. This returns
 * names and no geometry. Both prefixes get identical treatment in
 * `cache-headers.ts`, `cors-options.ts` and `response-compression.ts`, so the
 * choice is about meaning rather than plumbing.
 *
 * `authContextMiddleware` and no role floor, matching `delete-impact` and
 * `/map/service-requests/:id/nearby`. Region and folder names already reach every
 * member through sync, so a floor here would gate a fact the client can assemble
 * for itself.
 */
export function registerRegionMembershipRoutes(
	app: Hono<{ Variables: AuthVariables }>,
	options: {
		readonly db: Kysely<SimmerDatabase>;
		readonly authContextMiddleware: MiddlewareHandler<{ Variables: AuthVariables }>;
	},
): void {
	app.get(
		'/records/:recordType/:recordId/regions',
		options.authContextMiddleware,
		async (context) => {
			const recordType = context.req.param('recordType');
			if (!isRegionMembershipRecordType(recordType)) {
				// The type list is not secret, so an unknown one is a 404 rather than
				// the `found: false` a real type gets.
				return context.json(
					{ error: 'unknown_record_type', reason: `${recordType} carries no geometry.` },
					404,
				);
			}

			const regions = await readRecordRegions(options.db, {
				recordType,
				recordId: context.req.param('recordId'),
				organizationId: context.get('authContext').organization.id,
			});

			return context.json(regions);
		},
	);
}
