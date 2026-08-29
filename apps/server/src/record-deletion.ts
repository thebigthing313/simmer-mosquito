import {
	type DeleteAcknowledgement,
	type DeleteAcknowledgementRequiredError,
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
 * The refusal a delete gets when it withheld a confirmation.
 *
 * Its own error rather than a `delete_blocked`, because the two ask the client
 * for different things. A blocked delete cannot proceed at all until the agency
 * deals with the referring records; this one proceeds the moment the same
 * request arrives with `flag` set. A form that could not tell them apart would
 * have to guess whether to offer a Confirm button.
 *
 * `consequences` carries the same entries as `/records/:type/:id/delete-impact`,
 * so the sentence is the client's to write and the counts are the server's.
 * One flag per refusal: the next withheld one arrives on the next attempt.
 */
export interface AcknowledgementRequiredBody {
	readonly error: 'acknowledgement_required';
	readonly message: string;
	readonly flag: DeleteAcknowledgement;
	readonly consequences: readonly DeleteImpactEntry[];
}

export function acknowledgementRequiredBody(
	error: DeleteAcknowledgementRequiredError,
): AcknowledgementRequiredBody {
	return {
		error: 'acknowledgement_required',
		message: error.message,
		flag: error.acknowledgement,
		consequences: error.consequences,
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
