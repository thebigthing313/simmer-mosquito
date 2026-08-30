import {
	type DeleteImpactEntry,
	isDeletableRecordType,
	type Kysely,
	type RecordDeleteBlockedError,
	readDeleteImpact,
	type SimmerDatabase,
} from '@simmer-mosquito/db';
import type { Acknowledgement } from '@simmer-mosquito/domain';
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
 * The refusal a write gets when it withheld a confirmation.
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
 *
 * ## What an empty `consequences` means
 *
 * That the condition counts no rows. "This request is closed" is a fact about
 * one row, not a list of rows about to go, so `message` carries the whole
 * answer and the list is empty rather than absent. The client keys its wording
 * off `flag`, which it already has to do — two counted refusals under one code
 * need two different sentences — so one shape serves both and a form does not
 * have to branch on whether a field is there.
 *
 * `flag` is the whole acknowledgement vocabulary, not the fourteen names the
 * delete registry knows, because three mechanisms now raise this body.
 */
export interface AcknowledgementRequiredBody {
	readonly error: 'acknowledgement_required';
	readonly message: string;
	readonly flag: Acknowledgement;
	readonly consequences: readonly DeleteImpactEntry[];
}

/**
 * Structural rather than typed to one error class, because three raise it: the
 * delete registry's, the clearance check's, and the state guard's. Each names an
 * acknowledgement from the vocabulary, so the parameter asks for that and no
 * cast is needed at any of the three call sites.
 */
export function acknowledgementRequiredBody(error: {
	readonly message: string;
	readonly acknowledgement: Acknowledgement;
	/** Absent on a state refusal, which counts nothing. */
	readonly consequences?: readonly DeleteImpactEntry[];
}): AcknowledgementRequiredBody {
	return {
		error: 'acknowledgement_required',
		message: error.message,
		flag: error.acknowledgement,
		consequences: error.consequences ?? [],
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
