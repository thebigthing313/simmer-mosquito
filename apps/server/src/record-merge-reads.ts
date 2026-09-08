import {
	type DuplicateGroup,
	type DuplicateRecord,
	getOrganizationSettingsRaw,
	isDuplicateRecordType,
	type Kysely,
	NEARBY_MAX_METRES,
	type NearbyHabitat,
	readDuplicateCandidates,
	readNearbyHabitats,
	type SimmerDatabase,
} from '@simmer-mosquito/db';
import {
	distanceToMeters,
	proximitySearchUnit,
	resolveOrganizationSettings,
} from '@simmer-mosquito/domain';
import type { Hono, MiddlewareHandler } from 'hono';
import type { AuthVariables } from './auth-middleware.js';
import { parseOptionalPositiveNumber, uuidPattern } from './map-tiles.js';

/** What a cleanup page asks for: the duplicate sets this organization's records suggest. */
interface DuplicateCandidatesBody {
	readonly recordType: string;
	readonly groups: readonly DuplicateGroup[];
}

/** What a habitat merge page asks for: the habitat kept, and what stands near it. */
interface NearbyHabitatsBody {
	readonly target: DuplicateRecord;
	readonly candidates: readonly NearbyHabitat[];
}

/**
 * The reads in front of a merge: which records might be the same record.
 *
 * A merge has no undo, so both exist to make the commit answerable before it
 * happens. Neither decides anything.
 *
 * `/duplicates` proposes sets from shared values and says what grouped each one.
 * It answers for addresses and contacts, which is fewer types than a merge can
 * fold: a duplicate habitat is a place a crew found and named twice, so the two
 * records agree about nothing except where they are.
 *
 * `/records/habitat/:id/nearby` is how those are found instead. It starts from a
 * habitat the user already chose to keep and answers what stands within a radius
 * of it, so the question is "is this the same basin" rather than "which of these
 * pairs is real". The radius is the caller's, because how far apart two records
 * for one place land depends on how each was filed.
 *
 * A third route here counted what a chosen set would move, table by table. It is
 * gone: whichever number came back, everything that named a retired record ends
 * up naming the survivor, and the confirmation says so in the sentence the user
 * ticks.
 *
 * These live here rather than under a domain, for the reason
 * `/records/:type/:id/delete-impact` does: the policy is registry data in
 * `@simmer-mosquito/db` covering several record types, so a per-domain endpoint
 * would be the same call three times under different paths.
 *
 * Neither is gated above the session. They read the caller's own organization
 * and nothing else, matching `delete-impact`; the manager floor they lead to is
 * on the merge commands themselves, in `command-permissions.ts`.
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
		if (!isDuplicateRecordType(recordType)) {
			return context.json(unknownRecordType(recordType), 404);
		}

		const groups = await readDuplicateCandidates(options.db, {
			recordType,
			organizationId: context.get('authContext').organization.id,
		});

		return context.json({ recordType, groups } satisfies DuplicateCandidatesBody);
	});

	app.get('/records/habitat/:habitatId/nearby', options.authContextMiddleware, async (context) => {
		const habitatId = context.req.param('habitatId');
		// Every by-id route under `/records` and `/map` refuses a non-uuid here. The
		// id reaches a `where id = $1` on a uuid column, and a malformed one is a
		// driver error, which arrives as a 500 with nothing in it to act on.
		if (!uuidPattern.test(habitatId)) {
			return context.json({ error: 'invalid_id', reason: 'Habitat id must be a UUID.' }, 400);
		}

		const radius = parseOptionalPositiveNumber(
			new URL(context.req.url).searchParams,
			'radiusMetres',
		);
		if (!radius.ok) {
			return context.json({ error: 'invalid_query', reason: radius.reason }, 400);
		}
		// Capped rather than clamped. A radius nobody meant to send is a search
		// over the whole organization, and answering it with a quietly different
		// one hides that the control on the page is broken.
		if (radius.value !== undefined && radius.value > NEARBY_MAX_METRES) {
			return context.json(
				{ error: 'invalid_query', reason: `radiusMetres must be ${NEARBY_MAX_METRES} or less.` },
				400,
			);
		}

		const organizationId = context.get('authContext').organization.id;
		const result = await readNearbyHabitats(options.db, {
			habitatId,
			organizationId,
			radiusMetres: radius.value ?? (await defaultRadiusMetres(options.db, organizationId)),
		});
		if (result === undefined) {
			return context.json({ error: 'not_found', reason: 'Habitat not found.' }, 404);
		}

		return context.json(result satisfies NearbyHabitatsBody);
	});
}

/**
 * The radius a search runs at when the caller names none.
 *
 * From the organization's own default distance unit, so an organization that
 * works in feet gets the first imperial step rather than a round number of
 * metres that reads back as 328 ft. The page sends an explicit radius once it
 * has a control on screen; this is what the endpoint answers before that, and
 * what any other caller gets.
 */
async function defaultRadiusMetres(
	db: Kysely<SimmerDatabase>,
	organizationId: string,
): Promise<number> {
	const settings = resolveOrganizationSettings(
		await getOrganizationSettingsRaw(db, { organizationId }),
	).settings;
	const unit = proximitySearchUnit(settings.unitDefaults.distance);
	return distanceToMeters(unit.steps[0] ?? 100, unit.unitCode);
}

function unknownRecordType(recordType: string) {
	return { error: 'unknown_record_type', reason: `${recordType} cannot be merged.` } as const;
}
