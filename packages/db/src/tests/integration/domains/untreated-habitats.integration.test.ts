import { expect, it } from 'vitest';
import { MAP_SURFACES } from '../../../domains/map-surface-register.js';
import type { DbExecutor } from '../../../index.js';
import { sql } from '../../../index.js';
import { describeDbIntegration, withTestDb } from '../../../test-support/db-integration.js';
import {
	createApplication,
	createBiocontrolAction,
	createHabitat,
	createInsecticide,
	createInspection,
	createOrganization,
	createRequestedControlAction,
	createSourceReduction,
	createSourceReductionMethod,
	createUnit,
} from '../../../test-support/row-fixtures.js';

// --- the habitats explorer's untreated filter --------------------------------
//
// `untreatedHabitatSql` reads four tables beside `inspections`, so the
// rule is seeded and read back rather than pinned as text. Each habitat below is
// one state the rule names, and the answer is the set of ids that qualify, so a
// predicate that stopped reading one table changes the set.
//
// These are the cases the Dashboard banner carried until #1211 removed it,
// moved onto the one reader left, plus the shapes a query starting from the
// inspections in the window could get wrong (#1212): both edges of the window,
// a later reading dated after today, two readings on one day, a deleted action
// and another organization's rows.
//
// Dates are relative to today in the organization's zone, because the window
// ends on `now()` and nothing can move it.

/** A zone five hours behind UTC in September, so a UTC/local disagreement shows up. */
const ORGANIZATION_TIME_ZONE = 'America/New_York';

/** A box around every fixture geometry, so the paged read returns the whole set. */
const FIXTURE_BOUNDS = { west: -90.6, south: 35.4, east: -90.4, north: 35.6 };

/** Today as the organization sees it. */
function todayInZone(): string {
	// `en-CA` for the year-month-day shape, the way `todayInTimeZone` on the web pins it.
	return new Intl.DateTimeFormat('en-CA', {
		timeZone: ORGANIZATION_TIME_ZONE,
		year: 'numeric',
		month: '2-digit',
		day: '2-digit',
	}).format(new Date());
}

/** `days` before today in the organization's zone, as `YYYY-MM-DD`; negative is after. */
function daysAgo(days: number): string {
	const instant = new Date(`${todayInZone()}T00:00:00Z`);
	instant.setUTCDate(instant.getUTCDate() - days);
	return instant.toISOString().slice(0, 10);
}

/** A `date` column's value, as SQL, so the driver cannot shift it a day. */
function dateOf(date: string) {
	return sql<Date>`${date}::date`;
}

describeDbIntegration('untreated habitats', () => {
	it('filters habitats to the untreated rule and nothing wider', async () => {
		await withTestDb(async ({ db }) => {
			const world = await seedUntreatedWorld(db);

			const result = await MAP_SURFACES.habitats.listByBounds(db, {
				organizationId: world.organizationId,
				timeZone: ORGANIZATION_TIME_ZONE,
				bounds: FIXTURE_BOUNDS,
				filters: { untreatedOnly: true },
				limit: 100,
				offset: 0,
			});

			expect(new Set(result.rows.map((row) => row.id))).toEqual(new Set(world.untreated));
			expect(result.total).toBe(world.untreated.length);
		});
	});
});

/** One habitat per clause of the rule, and the ids of those the rule keeps. */
async function seedUntreatedWorld(db: DbExecutor): Promise<{
	readonly organizationId: string;
	readonly untreated: readonly string[];
}> {
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
		owner: string = organizationId,
	) => {
		const habitatId = await createHabitat(db, owner, habitat);
		const inspectionId = await createInspection(db, owner, {
			habitat_id: habitatId,
			inspection_date: dateOf(daysAgo(readingDaysAgo)),
			density,
		});
		return { habitatId, inspectionId };
	};

	// In: the plain case, and the one behind a locked gate.
	const plain = await habitatWithReading(3, 'heavy');
	const inaccessible = await habitatWithReading(1, 'very_heavy', { is_inaccessible: true });
	// In: read heavy today, the last day of the window.
	const readToday = await habitatWithReading(0, 'heavy');
	// In: read heavy six days ago, the first day of the window.
	const firstDayOfWindow = await habitatWithReading(6, 'heavy');

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
	// In: the action after the reading was deleted.
	const actionDeleted = await habitatWithReading(3, 'heavy');
	await createApplication(
		db,
		organizationId,
		{ insecticideId, unitId },
		{
			habitat_id: actionDeleted.habitatId,
			application_date: dateOf(daysAgo(1)),
			deleted_at: sql`now()`,
		},
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
	await habitatWithReading(7, 'heavy');
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
	// Out: the latest live reading is dated tomorrow, so it is not in the window
	// and the heavy one before it is not the latest.
	const readTomorrow = await habitatWithReading(2, 'heavy');
	await createInspection(db, organizationId, {
		habitat_id: readTomorrow.habitatId,
		inspection_date: dateOf(daysAgo(-1)),
		density: 'light',
	});
	// Out: two readings on one day, and the one entered last is light.
	const sameDayCleared = await habitatWithReading(2, 'heavy');
	await createInspection(db, organizationId, {
		habitat_id: sameDayCleared.habitatId,
		inspection_date: dateOf(daysAgo(2)),
		density: 'light',
		created_at: sql`now() + interval '1 minute'`,
	});
	// In: two readings on one day, and the one entered last is heavy.
	const sameDayHeavy = await habitatWithReading(2, 'light');
	await createInspection(db, organizationId, {
		habitat_id: sameDayHeavy.habitatId,
		inspection_date: dateOf(daysAgo(2)),
		density: 'heavy',
		created_at: sql`now() + interval '1 minute'`,
	});
	// Out: another organization's habitat, untreated by the same rule.
	await habitatWithReading(1, 'heavy', {}, await createOrganization(db));

	return {
		organizationId,
		untreated: [
			plain.habitatId,
			inaccessible.habitatId,
			readToday.habitatId,
			firstDayOfWindow.habitatId,
			actionBefore.habitatId,
			actionDeleted.habitatId,
			requestResolved.habitatId,
			sameDayHeavy.habitatId,
		],
	};
}
