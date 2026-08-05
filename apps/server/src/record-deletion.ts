import {
	type DeleteImpactEntry,
	isDeletableRecordType,
	type Kysely,
	type RecordDeleteBlockedError,
	readDeleteImpact,
	type SimmerDatabase,
} from '@simmer-mosquito/db';
import type { Hono, MiddlewareHandler } from 'hono';
import type { AuthVariables } from './auth-middleware.js';

/**
 * The refusal a blocked delete returns.
 *
 * `blockers` carries the same entries the detail page already read from
 * `/records/:type/:id/delete-impact`, so a client that raced the check — the
 * last referencing record landed between the page load and the button press —
 * can name what stopped it without a second round-trip.
 */
export interface DeleteBlockedBody {
	readonly error: 'delete_blocked';
	readonly message: string;
	readonly blockers: readonly DeleteImpactEntry[];
}

export function deleteBlockedBody(error: RecordDeleteBlockedError): DeleteBlockedBody {
	return {
		error: 'delete_blocked',
		message: error.message,
		blockers: error.blockers,
	};
}

/**
 * What a delete would cost, read before anyone commits to it.
 *
 * The detail page's danger zone asks this on open so it can name the records
 * that would go with this one and refuse the delete outright when something
 * still depends on it. One route for every record type: the consequences are
 * registry data in `@simmer-mosquito/db`, so a per-domain endpoint would only
 * be the same call under a different path.
 *
 * A record the caller's agency does not own answers `found: false` rather than
 * 404 — same as one that never existed, so the endpoint cannot be used to probe
 * for another agency's ids.
 */
export function registerRecordDeletionRoutes(
	app: Hono<{ Variables: AuthVariables }>,
	options: {
		readonly db: Kysely<SimmerDatabase>;
		readonly authContextMiddleware: MiddlewareHandler<{ Variables: AuthVariables }>;
	},
): void {
	app.get(
		'/records/:recordType/:recordId/delete-impact',
		options.authContextMiddleware,
		async (context) => {
			const recordType = context.req.param('recordType');
			if (!isDeletableRecordType(recordType)) {
				return context.json(
					{ error: 'unknown_record_type', reason: `${recordType} cannot be deleted.` },
					404,
				);
			}

			const impact = await readDeleteImpact(options.db, {
				recordType,
				recordId: context.req.param('recordId'),
				organizationId: context.get('authContext').organization.id,
			});

			return context.json(impact);
		},
	);
}
