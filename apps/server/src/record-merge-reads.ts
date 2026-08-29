import {
	type DuplicateGroup,
	isMergeableRecordType,
	type Kysely,
	type MergeMoveEntry,
	mergeableRecordLabel,
	readDuplicateCandidates,
	readMergeImpact,
	type SimmerDatabase,
} from '@simmer-mosquito/db';
import type { Hono, MiddlewareHandler } from 'hono';
import type { AuthVariables } from './auth-middleware.js';

/** What a cleanup page asks for: the duplicate sets this agency's records suggest. */
interface DuplicateCandidatesBody {
	readonly recordType: string;
	readonly groups: readonly DuplicateGroup[];
}

/** What a merge would move, for the confirmation in front of it. */
interface MergeImpactBody {
	readonly recordType: string;
	readonly targetId: string;
	readonly sourceIds: readonly string[];
	readonly moves: readonly MergeMoveEntry[];
}

/**
 * Anything that looks like a uuid the driver will accept.
 *
 * Loose on version and variant on purpose. The point is to keep a value that
 * cannot be cast out of a `::uuid[]`, not to police which generator made it, and
 * Postgres itself accepts any hex in this shape.
 */
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * The two reads in front of a merge.
 *
 * A merge has no undo, so both exist to make the commit answerable before it
 * happens: one proposes which records look like the same thing, the other counts
 * what folding a chosen set together would actually move. The counts come from
 * the same registry the write uses, so the number a user agrees to is the number
 * that moves.
 *
 * Both live here rather than under a domain, for the reason
 * `/records/:type/:id/delete-impact` does: the policy is registry data in
 * `@simmer-mosquito/db` covering three record types, so a per-domain endpoint
 * would be the same call three times under different paths.
 *
 * Neither is gated above the session. They read the caller's own agency and
 * nothing else, matching `delete-impact`; the manager floor these lead to is on
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

	app.get(
		'/records/:recordType/:recordId/merge-impact',
		options.authContextMiddleware,
		async (context) => {
			const recordType = context.req.param('recordType');
			if (!isMergeableRecordType(recordType)) {
				return context.json(unknownRecordType(recordType), 404);
			}

			const targetId = context.req.param('recordId');
			const sourceIds = readSourceIds(context.req.queries('source') ?? [], targetId);
			if (!UUID_PATTERN.test(targetId) || sourceIds === null) {
				return context.json(
					{
						error: 'invalid_source_ids',
						message: `A ${mergeableRecordLabel(recordType)} merge needs a target and at least one other record to fold into it.`,
					},
					400,
				);
			}

			const moves = await readMergeImpact(options.db, {
				recordType,
				targetId,
				sourceIds,
				organizationId: context.get('authContext').organization.id,
				actorProfileId: null,
			});

			return context.json({
				recordType,
				targetId,
				sourceIds,
				moves,
			} satisfies MergeImpactBody);
		},
	);
}

function unknownRecordType(recordType: string) {
	return { error: 'unknown_record_type', reason: `${recordType} cannot be merged.` } as const;
}

/**
 * The sources a merge-impact request names, or null when they are unusable.
 *
 * Repeats collapse, because two of the same id would count that record's rows
 * twice and report a merge as moving more than it will. The target is refused
 * rather than dropped: a request naming the survivor among the records to retire
 * is a form that has the asymmetry backwards, and answering it with a smaller
 * number would hide that until the write went through.
 */
function readSourceIds(raw: readonly string[], targetId: string): readonly string[] | null {
	const sourceIds = [...new Set(raw)];
	if (sourceIds.length === 0) {
		return null;
	}
	if (sourceIds.some((id) => !UUID_PATTERN.test(id) || id === targetId)) {
		return null;
	}
	return sourceIds;
}
