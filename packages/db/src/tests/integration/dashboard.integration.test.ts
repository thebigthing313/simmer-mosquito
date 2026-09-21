import { expect, it } from 'vitest';
import type { DbExecutor } from '../../index.js';
import { readDashboard, sql } from '../../index.js';
import { describeDbIntegration, withTestDb } from '../../test-support/db-integration.js';
import {
	createApplication,
	createBiocontrolAction,
	createCollection,
	createCollectionMethod,
	createCollectionSpecies,
	createHabitat,
	createInsecticide,
	createInspection,
	createMission,
	createMissionItem,
	createOrganization,
	createRequestedControlAction,
	createSourceReduction,
	createSourceReductionMethod,
	createSpecies,
	createTrap,
	createUnit,
} from '../../test-support/row-fixtures.js';

// --- what the Dashboard's server half answers -------------------------------
//
// Every predicate here has a second table in it, which is why these are seeded
// and read back rather than pinned as text: a sample is awaiting until a species
// row names it, a request is unassigned until a stop on a live mission names it,
// a habitat is untreated until an action dated after its reading names it. Each
// case below is one row in one state the rule names, and the count is the sum
// of the states that qualify, so a predicate that stopped reading one table
// moves the number.
//
// Dates are relative to today in the organization's zone, because the untreated
// window ends on `now()` and nothing can move it.

/** A zone five hours behind UTC in September, so a UTC/local disagreement shows up. */
const ORGANIZATION_TIME_ZONE = 'America/New_York';

/** Today as the organization sees it, the same `YYYY-MM-DD` the reader returns. */
function todayInZone(): string {
	// `en-CA` for the year-month-day shape, the way `todayInTimeZone` on the web pins it.
	return new Intl.DateTimeFormat('en-CA', {
		timeZone: ORGANIZATION_TIME_ZONE,
		year: 'numeric',
		month: '2-digit',
		day: '2-digit',
	}).format(new Date());
}

function daysAgo(days: number): string {
	const instant = new Date(`${todayInZone()}T00:00:00Z`);
	instant.setUTCDate(instant.getUTCDate() - days);
	return instant.toISOString().slice(0, 10);
}

/** A `date` column's value, as SQL, so the driver cannot shift it a day. */
function dateOf(date: string) {
	return sql<Date>`${date}::date`;
}

/** Noon in the organization's zone on `date`, as a `timestamptz`. */
function noonOf(date: string) {
	return sql<Date>`${`${date} 16:00:00+00`}::timestamptz`;
}

describeDbIntegration('dashboard', () => {
	it('counts the two awaiting queues and the unassigned requests, oldest first', async () => {
		await withTestDb(async ({ db }) => {
			const world = await seedQueueWorld(db);

			const dashboard = await readDashboard(db, {
				organizationId: world.organizationId,
				timeZone: ORGANIZATION_TIME_ZONE,
			});

			expect(dashboard.today).toBe(todayInZone());
			// Three of eight samples: the two with nothing keyed out and the one
			// whose species row was taken off it. Identified, zero-larvae,
			// unidentifiable, deleted, and deleted-inspection samples are out.
			expect(dashboard.queues.samplesAwaiting).toEqual({ count: 3, oldest: daysAgo(30) });
			// Three of six collections: one on each timing mode and the one with a
			// problem, which still needs keying out. Pending, zero-result and
			// identified collections are out.
			expect(dashboard.queues.collectionsAwaiting).toEqual({ count: 3, oldest: daysAgo(10) });
			// Four of seven requests: the one nothing names, the two whose stop is on
			// a finished mission, and the one whose stop was deleted. A stop on a
			// scheduled or in-progress mission assigns the request, and a resolved
			// request is on no queue.
			expect(dashboard.queues.requestsUnassigned).toEqual({ count: 4, oldest: daysAgo(20) });
		});
	});

	it('flags a habitat as untreated on the rule and nothing wider', async () => {
		await withTestDb(async ({ db }) => {
			const world = await seedUntreatedWorld(db);

			const dashboard = await readDashboard(db, {
				organizationId: world.organizationId,
				timeZone: ORGANIZATION_TIME_ZONE,
			});

			// Four of twelve: the plain case, the inaccessible one, the one whose
			// only action predates its reading, and the one whose request was
			// resolved without an action. The oldest is the plain case's reading.
			expect(dashboard.untreatedHabitats).toEqual({ count: 4, oldest: daysAgo(3) });
		});
	});

	it('reads nothing for an organization with nothing', async () => {
		await withTestDb(async ({ db }) => {
			const organizationId = await createOrganization(db);

			const dashboard = await readDashboard(db, {
				organizationId,
				timeZone: ORGANIZATION_TIME_ZONE,
			});

			expect(dashboard.queues.samplesAwaiting).toEqual({ count: 0, oldest: null });
			expect(dashboard.queues.collectionsAwaiting).toEqual({ count: 0, oldest: null });
			expect(dashboard.queues.requestsUnassigned).toEqual({ count: 0, oldest: null });
			expect(dashboard.untreatedHabitats).toEqual({ count: 0, oldest: null });
		});
	});

	it('refuses a timezone that is not an IANA name', async () => {
		await withTestDb(async ({ db }) => {
			const organizationId = await createOrganization(db);
			await expect(
				readDashboard(db, { organizationId, timeZone: "x'; drop table habitats; --" }),
			).rejects.toThrow(/IANA/);
		});
	});
});

// --- seeds --------------------------------------------------------------------

interface SampleSeed {
	readonly inspectionDate: string;
	readonly isZeroLarvae?: boolean;
	readonly unidentifiableReason?: string;
	readonly identified?: 'live' | 'deleted';
	readonly deleted?: boolean;
	readonly inspectionDeleted?: boolean;
}

async function seedSample(
	db: DbExecutor,
	organizationId: string,
	speciesId: string,
	seed: SampleSeed,
): Promise<void> {
	const inspectionId = await createInspection(db, organizationId, {
		inspection_date: dateOf(seed.inspectionDate),
		deleted_at: seed.inspectionDeleted === true ? sql`now()` : null,
	});
	const sample = await db
		.insertInto('samples')
		.values({
			organization_id: organizationId,
			inspection_id: inspectionId,
			is_zero_larvae: seed.isZeroLarvae ?? false,
			unidentifiable_reason: seed.unidentifiableReason ?? null,
			deleted_at: seed.deleted === true ? sql`now()` : null,
		})
		.returning(['id'])
		.executeTakeFirstOrThrow();
	if (seed.identified !== undefined) {
		await db
			.insertInto('sample_species')
			.values({
				organization_id: organizationId,
				sample_id: sample.id,
				species_id: speciesId,
				identified_at: dateOf(seed.inspectionDate),
				larvae_count: 4,
				deleted_at: seed.identified === 'deleted' ? sql`now()` : null,
			})
			.execute();
	}
}

/** The two awaiting queues and the unassigned requests, one row per state. */
async function seedQueueWorld(db: DbExecutor): Promise<{ readonly organizationId: string }> {
	const organizationId = await createOrganization(db);
	const neighbourId = await createOrganization(db);
	const speciesId = await createSpecies(db);

	// Samples.
	await seedSample(db, organizationId, speciesId, { inspectionDate: daysAgo(30) });
	await seedSample(db, organizationId, speciesId, { inspectionDate: daysAgo(2) });
	await seedSample(db, organizationId, speciesId, {
		inspectionDate: daysAgo(3),
		identified: 'deleted',
	});
	await seedSample(db, organizationId, speciesId, {
		inspectionDate: daysAgo(4),
		identified: 'live',
	});
	await seedSample(db, organizationId, speciesId, {
		inspectionDate: daysAgo(5),
		isZeroLarvae: true,
	});
	await seedSample(db, organizationId, speciesId, {
		inspectionDate: daysAgo(6),
		unidentifiableReason: 'Dried out',
	});
	await seedSample(db, organizationId, speciesId, { inspectionDate: daysAgo(7), deleted: true });
	await seedSample(db, organizationId, speciesId, {
		inspectionDate: daysAgo(8),
		inspectionDeleted: true,
	});
	await seedSample(db, neighbourId, speciesId, { inspectionDate: daysAgo(40) });

	// Collections.
	const methodId = await createCollectionMethod(db, organizationId);
	const trapId = await createTrap(db, organizationId, methodId);
	const links = { trapId, collectionMethodId: methodId };
	const unitId = await createUnit(db);
	await createCollection(db, organizationId, links, {
		started_at: noonOf(daysAgo(11)),
		collected_at: noonOf(daysAgo(10)),
	});
	await createCollection(db, organizationId, links, {
		collection_timing_mode: 'collection_date_duration',
		started_at: null,
		collection_date: dateOf(daysAgo(1)),
		duration_amount: 1,
		duration_unit_id: unitId,
	});
	await createCollection(db, organizationId, links, {
		started_at: noonOf(daysAgo(2)),
		collected_at: noonOf(daysAgo(1)),
		has_problem: true,
	});
	// Still out: no `collected_at`, so undated and pending rather than awaiting.
	await createCollection(db, organizationId, links, { started_at: noonOf(daysAgo(1)) });
	await createCollection(db, organizationId, links, {
		started_at: noonOf(daysAgo(3)),
		collected_at: noonOf(daysAgo(2)),
		is_zero_result: true,
	});
	const identified = await createCollection(db, organizationId, links, {
		started_at: noonOf(daysAgo(3)),
		collected_at: noonOf(daysAgo(2)),
	});
	await createCollectionSpecies(db, organizationId, { collectionId: identified, speciesId });
	const neighbourMethod = await createCollectionMethod(db, neighbourId);
	await createCollection(
		db,
		neighbourId,
		{
			trapId: await createTrap(db, neighbourId, neighbourMethod),
			collectionMethodId: neighbourMethod,
		},
		{ started_at: noonOf(daysAgo(50)), collected_at: noonOf(daysAgo(49)) },
	);

	// Requests for control.
	const request = (requestedDaysAgo: number, resolved = false) =>
		createRequestedControlAction(db, organizationId, {
			requested_at: noonOf(daysAgo(requestedDaysAgo)),
			resolved_at: resolved ? sql`now()` : null,
		});
	await request(20);
	const onScheduled = await request(5);
	const onInProgress = await request(4);
	const onCompleted = await request(3);
	const onCancelled = await request(2);
	const deletedStop = await request(1);
	await request(19, true);
	const scheduled = await createMission(db, organizationId);
	const inProgress = await createMission(db, organizationId, { started_at: sql`now()` });
	const completed = await createMission(db, organizationId, {
		started_at: sql`now()`,
		completed_at: sql`now()`,
	});
	const cancelled = await createMission(db, organizationId, { cancelled_at: sql`now()` });
	await createMissionItem(db, organizationId, scheduled, {
		requested_control_action_id: onScheduled,
	});
	await createMissionItem(db, organizationId, inProgress, {
		requested_control_action_id: onInProgress,
	});
	await createMissionItem(db, organizationId, completed, {
		requested_control_action_id: onCompleted,
	});
	await createMissionItem(db, organizationId, cancelled, {
		requested_control_action_id: onCancelled,
	});
	await createMissionItem(db, organizationId, scheduled, {
		requested_control_action_id: deletedStop,
		position: 2,
		deleted_at: sql`now()`,
	});
	await createRequestedControlAction(db, neighbourId, { requested_at: noonOf(daysAgo(60)) });

	return { organizationId };
}

/** The untreated flag, one habitat per clause of the rule. */
async function seedUntreatedWorld(db: DbExecutor): Promise<{ readonly organizationId: string }> {
	const organizationId = await createOrganization(db);
	const unitId = await createUnit(db);
	const insecticideId = await createInsecticide(db, organizationId, unitId);
	const sourceReductionMethodId = await createSourceReductionMethod(db, organizationId);
	const biocontrolMethod = await db
		.insertInto('biocontrol_methods')
		.values({ organization_id: organizationId, name: 'Gambusia' })
		.returning(['id'])
		.executeTakeFirstOrThrow();

	const habitatWithReading = async (
		readingDaysAgo: number,
		density: 'heavy' | 'very_heavy' | 'light',
		habitat: Parameters<typeof createHabitat>[2] = {},
	) => {
		const habitatId = await createHabitat(db, organizationId, habitat);
		const inspectionId = await createInspection(db, organizationId, {
			habitat_id: habitatId,
			inspection_date: dateOf(daysAgo(readingDaysAgo)),
			density,
		});
		return { habitatId, inspectionId };
	};

	// In: the plain case, and the one behind a locked gate.
	await habitatWithReading(3, 'heavy');
	await habitatWithReading(1, 'very_heavy', { is_inaccessible: true });

	// Out: treated by an application dated after the reading, naming the habitat.
	const treatedByApplication = await habitatWithReading(4, 'heavy');
	await createApplication(
		db,
		organizationId,
		{ insecticideId, unitId },
		{ habitat_id: treatedByApplication.habitatId, application_date: dateOf(daysAgo(2)) },
	);
	// Out: treated the same day, and named by the inspection rather than the habitat.
	const treatedByInspectionLink = await habitatWithReading(4, 'heavy');
	await createSourceReduction(
		db,
		organizationId,
		{ methodId: sourceReductionMethodId, unitId },
		{
			inspection_id: treatedByInspectionLink.inspectionId,
			source_reduction_date: dateOf(daysAgo(4)),
		},
	);
	// Out: a release since the reading.
	const treatedByRelease = await habitatWithReading(2, 'heavy');
	await createBiocontrolAction(
		db,
		organizationId,
		{ methodId: biocontrolMethod.id, unitId },
		{ habitat_id: treatedByRelease.habitatId, biocontrol_date: dateOf(daysAgo(1)) },
	);
	// In: the only action predates the reading, so it treated an earlier one.
	const actionBefore = await habitatWithReading(2, 'heavy');
	await createApplication(
		db,
		organizationId,
		{ insecticideId, unitId },
		{ habitat_id: actionBefore.habitatId, application_date: dateOf(daysAgo(5)) },
	);
	// Out: an open request already counts it on the requests queue.
	const requested = await habitatWithReading(1, 'heavy');
	await createRequestedControlAction(db, organizationId, { habitat_id: requested.habitatId });
	// In: resolving the request treated nothing.
	const requestResolved = await habitatWithReading(1, 'heavy');
	await createRequestedControlAction(db, organizationId, {
		habitat_id: requestResolved.habitatId,
		resolved_at: sql`now()`,
	});
	// Out: older than the window.
	await habitatWithReading(8, 'heavy');
	// Out: the latest reading is light, whatever came before it.
	const cleared = await habitatWithReading(3, 'heavy');
	await createInspection(db, organizationId, {
		habitat_id: cleared.habitatId,
		inspection_date: dateOf(daysAgo(1)),
		density: 'light',
	});
	// Out: inactive.
	await habitatWithReading(1, 'heavy', { is_active: false });
	// Out: the heavy reading was deleted and the live one before it is light.
	const deletedReading = await habitatWithReading(3, 'light');
	await createInspection(db, organizationId, {
		habitat_id: deletedReading.habitatId,
		inspection_date: dateOf(daysAgo(1)),
		density: 'heavy',
		deleted_at: sql`now()`,
	});

	return { organizationId };
}
