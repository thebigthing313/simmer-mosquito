import { expect, it } from 'vitest';
import type { DbExecutor } from '../../index.js';
import { OverviewPeriodInvalidError, readOverview, sql } from '../../index.js';
import { describeDbIntegration, withTestDb } from '../../test-support/db-integration.js';
import {
	createAddress,
	createApplication,
	createCollection,
	createCollectionMethod,
	createCollectionSpecies,
	createContact,
	createInsecticide,
	createInspection,
	createOrganization,
	createOutreachAction,
	createServiceRequest,
	createSourceReduction,
	createSourceReductionMethod,
	createSpecies,
	createTrap,
	createUnit,
} from '../../test-support/row-fixtures.js';

// --- what `GET /overview/:grain` counts ------------------------------------
//
// The cut arithmetic has its own suite in `packages/domain` over daily rows;
// what is seeded and read back here is the predicates, which each have a
// second table or a second column in them. One Organization, June 2025, with
// a row in every state the reader names: a positive, a dry and a negative
// inspection, a sample on a live inspection and one on a deleted inspection,
// a collection in each of the six states, a stray row in a prior year that
// qualifies it for the average, and a neighbour Organization's rows on the
// same dates that never count.
//
// The period is fixed in the past rather than relative to today, because a
// complete month compares whole against whole and the assertions can be
// written down; the domain suite covers the partial case.

/** A zone five hours behind UTC in June, so a UTC/local disagreement shows up. */
const ORGANIZATION_TIME_ZONE = 'America/New_York';

function dateOf(date: string) {
	return sql<Date>`${date}::date`;
}

function instant(value: string) {
	return sql<Date>`${value}::timestamptz`;
}

describeDbIntegration('overview', () => {
	it('groups each type by the Organization’s day and reads the two ratios off the same rows', async () => {
		await withTestDb(async ({ db }) => {
			const organizationId = await seedJune2025(db);

			const month = await readOverview(db, {
				organizationId,
				timeZone: ORGANIZATION_TIME_ZONE,
				grain: 'month',
				period: '2025-06',
			});

			expect(month.period).toBe('2025-06');
			expect(month.cutThrough).toBeNull();
			expect(month.earliest).toBe('2021-03-01');
			expect(month.columns).toEqual([
				{ key: 'period', from: '2025-06-01', to: '2025-06-30' },
				{ key: 'previous', from: '2025-05-01', to: '2025-05-31' },
				{ key: 'lastYear', from: '2024-06-01', to: '2024-06-30' },
				{ key: 'average', years: { from: 2020, to: 2024 } },
			]);

			const values = Object.fromEntries(
				month.types.map((row) => [row.type, [row.recordedEver, row.values, row.averageYears]]),
			);
			expect(values).toEqual({
				// Four live inspections in June; the deleted one, the neighbour's and
				// the two on the boundary days are out. 2021 qualifies on its stray
				// March row and contributes a zero June.
				inspections: [true, [4, 1, 0, 0], 1],
				// One live sample on a live inspection, dated by that inspection.
				samples: [true, [1, 0, 0, null], 0],
				// Six of seven: the pending one has no effective date. The trap
				// emptied at 23:30 New York on June 30 files under June, not July.
				collections: [true, [6, 0, 0, null], 0],
				applications: [true, [2, 2, 0, null], 0],
				sourceReductions: [true, [1, 0, 0, null], 0],
				releases: [false, [0, 0, 0, null], 0],
				serviceRequests: [true, [1, 0, 0, null], 0],
				outreachActions: [true, [1, 0, 0, null], 0],
			});

			// Positive is wet with breeding: the `heavy` band and the wet inspection
			// carrying a larvae count and no band. Dry and `none` are not, and the
			// denominator is every live inspection, dry included.
			expect(month.ratios[0]).toMatchObject({
				ratio: 'positiveInspections',
				numerators: [2, 0, 0, 0],
				denominators: [4, 1, 0, 0],
				averageYears: 1,
			});
			// Counted: the identified, the zero result, the date-mode one and the
			// late-night one, 15 + 0 + 4 + 6 mosquitoes. The problem collection's
			// species row and the awaiting collection are in neither half.
			expect(month.ratios[1]).toMatchObject({
				ratio: 'mosquitoesPerCollection',
				numerators: [25, 0, 0, 0],
				denominators: [4, 0, 0, 0],
				averageYears: 0,
			});
		});
	});

	it('reads one day and one year off the same rows', async () => {
		await withTestDb(async ({ db }) => {
			const organizationId = await seedJune2025(db);
			const scope = { organizationId, timeZone: ORGANIZATION_TIME_ZONE } as const;

			const day = await readOverview(db, { ...scope, grain: 'day', period: '2025-06-15' });
			const year = await readOverview(db, { ...scope, grain: 'year', period: '2025' });

			expect(day.columns).toEqual([
				{ key: 'period', from: '2025-06-15', to: '2025-06-15' },
				{ key: 'previous', from: '2025-06-14', to: '2025-06-14' },
			]);
			expect(day.types[0]).toMatchObject({ type: 'inspections', values: [3, 0], averageYears: 0 });
			expect(day.types[0]?.series).toHaveLength(365);

			expect(year.columns).toEqual([
				{ key: 'period', from: '2025-01-01', to: '2025-12-31' },
				{ key: 'previous', from: '2024-01-01', to: '2024-12-31' },
				{ key: 'average', years: { from: 2020, to: 2024 } },
			]);
			// The four June inspections and the two on the boundary days.
			expect(year.types[0]).toMatchObject({
				type: 'inspections',
				values: [6, 0, 1],
				averageYears: 1,
			});
			// The whole history, from the stray row's year to the current one.
			expect(year.types[0]?.series[0]).toEqual({ period: '2021', value: 1 });
			expect(year.types[0]?.series.at(-1)?.period).toBe(year.today.slice(0, 4));
		});
	});

	it('answers zeros and no earliest for an Organization with nothing, and refuses a bad period', async () => {
		await withTestDb(async ({ db }) => {
			const organizationId = await createOrganization(db);
			const scope = { organizationId, timeZone: ORGANIZATION_TIME_ZONE } as const;

			const empty = await readOverview(db, { ...scope, grain: 'day' });

			expect(empty.period).toBe(empty.today);
			expect(empty.earliest).toBeNull();
			expect(empty.types.every((row) => !row.recordedEver)).toBe(true);
			expect(empty.types[0]?.values).toEqual([0, 0]);

			await expect(
				readOverview(db, { ...scope, grain: 'month', period: '2026-13' }),
			).rejects.toBeInstanceOf(OverviewPeriodInvalidError);
			await expect(
				readOverview(db, { ...scope, grain: 'year', timeZone: "x'; drop table habitats; --" }),
			).rejects.toThrow(/IANA/);
		});
	});
});

// --- the seed -----------------------------------------------------------------

async function seedJune2025(db: DbExecutor): Promise<string> {
	const organizationId = await createOrganization(db);
	const neighbourId = await createOrganization(db);
	const speciesId = await createSpecies(db);
	const unitId = await createUnit(db);

	// Inspections.
	const inspection = (date: string, overrides = {}) =>
		createInspection(db, organizationId, { inspection_date: dateOf(date), ...overrides });
	const positive = await inspection('2025-06-15', { density: 'heavy' });
	await inspection('2025-06-15', { is_wet: false, density: null });
	await inspection('2025-06-15', { larvae_count: 3, dip_count: 2, density: null });
	await inspection('2025-06-16', { density: 'none' });
	await inspection('2025-05-31');
	await inspection('2025-07-01');
	const deleted = await inspection('2025-06-10', { deleted_at: sql`now()` });
	await inspection('2021-03-01');
	await createInspection(db, neighbourId, { inspection_date: dateOf('2025-06-15') });

	// Samples, dated by the parent inspection.
	const sample = (inspectionId: string, deleted = false) =>
		db
			.insertInto('samples')
			.values({
				organization_id: organizationId,
				inspection_id: inspectionId,
				deleted_at: deleted ? sql`now()` : null,
			})
			.execute();
	await sample(positive);
	await sample(positive, true);
	await sample(deleted);

	// Collections, one per state.
	const methodId = await createCollectionMethod(db, organizationId);
	const trapId = await createTrap(db, organizationId, methodId);
	const links = { trapId, collectionMethodId: methodId };
	const collected = (collectedAt: string, overrides = {}) =>
		createCollection(db, organizationId, links, {
			started_at: instant('2025-06-14 22:00:00+00'),
			collected_at: instant(collectedAt),
			...overrides,
		});
	const identified = await collected('2025-06-15 12:00:00+00');
	await createCollectionSpecies(
		db,
		organizationId,
		{ collectionId: identified, speciesId },
		{ count: 10 },
	);
	await createCollectionSpecies(
		db,
		organizationId,
		{ collectionId: identified, speciesId },
		{ count: 5 },
	);
	const problem = await collected('2025-06-15 12:00:00+00', { has_problem: true });
	await createCollectionSpecies(
		db,
		organizationId,
		{ collectionId: problem, speciesId },
		{ count: 7 },
	);
	await collected('2025-06-15 12:00:00+00');
	await collected('2025-06-16 12:00:00+00', { is_zero_result: true });
	// Still out: no `collected_at`, so undated and counted nowhere.
	await createCollection(db, organizationId, links, {
		started_at: instant('2025-06-29 22:00:00+00'),
	});
	const dated = await createCollection(db, organizationId, links, {
		collection_timing_mode: 'collection_date_duration',
		started_at: null,
		collection_date: dateOf('2025-06-30'),
		duration_amount: 1,
		duration_unit_id: unitId,
	});
	await createCollectionSpecies(
		db,
		organizationId,
		{ collectionId: dated, speciesId },
		{ count: 4 },
	);
	// 23:30 on June 30 in New York, which is 03:30 on July 1 in UTC.
	const lateNight = await collected('2025-07-01 03:30:00+00');
	await createCollectionSpecies(
		db,
		organizationId,
		{ collectionId: lateNight, speciesId },
		{ count: 6 },
	);

	// Control operations.
	const insecticideId = await createInsecticide(db, organizationId, unitId);
	const application = (date: string) =>
		createApplication(
			db,
			organizationId,
			{ insecticideId, unitId },
			{ application_date: dateOf(date) },
		);
	await application('2025-06-01');
	await application('2025-06-30');
	await application('2025-05-02');
	await application('2025-05-20');
	const reductionMethodId = await createSourceReductionMethod(db, organizationId);
	await createSourceReduction(
		db,
		organizationId,
		{ methodId: reductionMethodId, unitId },
		{ source_reduction_date: dateOf('2025-06-15') },
	);

	// Public engagement.
	const addressId = await createAddress(db, organizationId);
	const contactId = await createContact(db, organizationId);
	await createServiceRequest(
		db,
		organizationId,
		{ addressId, contactId },
		{ request_date: dateOf('2025-06-20') },
	);
	const outreachMethod = await db
		.insertInto('outreach_methods')
		.values({ organization_id: organizationId, name: 'Door hangers' })
		.returning(['id'])
		.executeTakeFirstOrThrow();
	await createOutreachAction(db, organizationId, outreachMethod.id, {
		outreach_date: dateOf('2025-06-05'),
	});

	return organizationId;
}
