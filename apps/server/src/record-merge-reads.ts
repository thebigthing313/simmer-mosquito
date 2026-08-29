import {
	type DuplicateGroup,
	isMergeableRecordType,
	type Kysely,
	readDuplicateCandidates,
	type SimmerDatabase,
} from '@simmer-mosquito/db';
import type { Hono, MiddlewareHandler } from 'hono';
import type { AuthVariables } from './auth-middleware.js';

/** What a cleanup page asks for: the duplicate sets this agency's records suggest. */
interface DuplicateCandidatesBody {
	readonly recordType: string;
	readonly groups: readonly DuplicateGroup[];
}

/**
 * The read in front of a merge: which records look like the same thing.
 *
 * A merge has no undo, so this exists to make the commit answerable before it
 * happens. It proposes sets and says what grouped each one, and a person decides.
 *
 * A second route here counted what a chosen set would move, table by table. It
 * is gone: whichever number came back, everything that named a retired record
 * ends up naming the survivor, and the confirmation says so in the sentence the
 * user ticks.
 *
 * This lives here rather than under a domain, for the reason
 * `/records/:type/:id/delete-impact` does: the policy is registry data in
 * `@simmer-mosquito/db` covering three record types, so a per-domain endpoint
 * would be the same call three times under different paths.
 *
 * It is not gated above the session. It reads the caller's own agency and
 * nothing else, matching `delete-impact`; the manager floor it leads to is on
 * the merge commands themselves, in `command-permissions.ts`.
 */
export function registerRecordMergeReadRoutes(
	app: Hono<{ Variables: AuthVariables }>,
	options: {
		readonly db: Kysely<SimmerDatabase>;
		readonly authContextMiddleware: MiddlewareHandler<{ Variables: AuthVariables }>;
	},
): void {
	app.get('/records/:recordType/duplicates', options.authContextMiddleware, async (context) => {
		const recordType = context.req.param('recordType');
		if (!isMergeableRecordType(recordType)) {
			return context.json(unknownRecordType(recordType), 404);
		}

		const groups = await readDuplicateCandidates(options.db, {
			recordType,
			organizationId: context.get('authContext').organization.id,
		});

		return context.json({ recordType, groups } satisfies DuplicateCandidatesBody);
	});
}

function unknownRecordType(recordType: string) {
	return { error: 'unknown_record_type', reason: `${recordType} cannot be merged.` } as const;
}
