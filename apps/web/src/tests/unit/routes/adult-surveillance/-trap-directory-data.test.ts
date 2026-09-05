import { describe, expect, it } from 'vitest';
import type {
	DirectoryCollection,
	DirectorySpecies,
} from '../../../../routes/adult-surveillance/-trap-directory-data';
import {
	groupByYear,
	specimenTotals,
	summaryLabel,
	UNDATED_GROUP_KEY,
} from '../../../../routes/adult-surveillance/-trap-directory-data';

/**
 * The trap directory reads one trap's whole run of collections, so every defect
 * here is a defect that still looks like data: a season missing the collections
 * that belong to it, a specimen counted twice, or a sample nobody has keyed out
 * yet reported as a trap that caught nothing.
 *
 * The two collection timing modes are what make the year hard. `exact_timestamps`
 * dates a collection in `collectedAt` and leaves it null until the trap is
 * retrieved; `collection_date_duration` dates it in `collectionDate` and leaves
 * `collectedAt` null forever. Reading either column alone empties a surface
 * silently, which is why the fixtures below exercise both.
 */

// A US agency zone rather than UTC: a fixture timestamped in the evening falls
// on a different day in the two, which is what makes the year assertions able to
// fail if the grouping ever reverts to the browser's or the server's zone.
const ORGANIZATION_TIME_ZONE = 'America/New_York';

function collection(overrides: Partial<DirectoryCollection> = {}): DirectoryCollection {
	return {
		id: 'collection-1',
		collectedAt: '2026-07-14 06:00:00+00',
		collectionDate: null,
		collectionTimingMode: 'exact_timestamps',
		hasProblem: false,
		isZeroResult: false,
		hasBycatch: false,
		species: [],
		...overrides,
	};
}

function species(overrides: Partial<DirectorySpecies> = {}): DirectorySpecies {
	return {
		id: 'species-row-1',
		speciesId: 'species-vexans',
		count: 4,
		sex: 'female',
		status: null,
		...overrides,
	};
}

describe('groupByYear', () => {
	it('cuts collections into years, most recent first', () => {
		const years = groupByYear(
			[
				collection({ id: 'a', collectedAt: '2024-08-01 06:00:00+00' }),
				collection({ id: 'b', collectedAt: '2026-07-14 06:00:00+00' }),
				collection({ id: 'c', collectedAt: '2025-06-02 06:00:00+00' }),
			],
			ORGANIZATION_TIME_ZONE,
		);

		expect(years.map((year) => year.label)).toEqual(['2026', '2025', '2024']);
		expect(years.map((year) => year.collections.length)).toEqual([1, 1, 1]);
	});

	it('groups and orders a Date the same as the timestamp string it parses from', () => {
		/*
		 * `useTrapCollections` reads through `lib/collections`, whose row schema
		 * parses a `timestamptz` into a `Date` — so the same collection reaches these
		 * functions as an object on one path and as text on the other. Both are the
		 * same instant, and an evening one in a western zone is the case where
		 * treating them differently would land the two on different days.
		 */
		const asText = '2026-01-01 04:30:00+00'; // 2025-12-31, 11:30pm in New York
		const years = groupByYear(
			[
				collection({ id: 'text', collectedAt: asText }),
				collection({ id: 'date', collectedAt: new Date(asText) }),
			],
			ORGANIZATION_TIME_ZONE,
		);

		expect(years).toHaveLength(1);
		expect(years[0]?.label).toBe('2025');
		expect(years[0]?.collections).toHaveLength(2);
	});

	it('dates a date-and-duration collection by collectionDate, not collectedAt', () => {
		// This is the mode where `collectedAt` is null by design. Read alone it
		// would file the whole season under undated.
		const years = groupByYear(
			[
				collection({
					id: 'duration',
					collectedAt: null,
					collectionDate: '2025-09-09',
					collectionTimingMode: 'collection_date_duration',
				}),
			],
			ORGANIZATION_TIME_ZONE,
		);

		expect(years).toHaveLength(1);
		expect(years[0]?.label).toBe('2025');
		expect(years[0]?.collections.map((row) => row.id)).toEqual(['duration']);
	});

	it('orders a year most recent first', () => {
		const years = groupByYear(
			[
				collection({ id: 'june', collectedAt: '2026-06-01 06:00:00+00' }),
				collection({ id: 'august', collectedAt: '2026-08-20 06:00:00+00' }),
				collection({ id: 'july', collectedAt: '2026-07-04 06:00:00+00' }),
			],
			ORGANIZATION_TIME_ZONE,
		);

		expect(years[0]?.collections.map((row) => row.id)).toEqual(['august', 'july', 'june']);
	});

	it('puts traps that are still out ahead of every dated year', () => {
		const years = groupByYear(
			[
				collection({ id: 'dated', collectedAt: '2026-07-14 06:00:00+00' }),
				collection({ id: 'out', collectedAt: null }),
			],
			ORGANIZATION_TIME_ZONE,
		);

		expect(years[0]?.key).toBe(UNDATED_GROUP_KEY);
		expect(years[0]?.label).toBe('Trap out');
		expect(years[0]?.collections.map((row) => row.id)).toEqual(['out']);
		expect(years[1]?.label).toBe('2026');
	});

	// A date-and-duration collection with no date is not a trap that is still out;
	// it is a record missing its date. Calling that bucket "Trap out" would tell
	// the operator the trap is in the field when it is not.
	it('calls the undated bucket what it is when it is not all pending', () => {
		const years = groupByYear(
			[
				collection({ id: 'out', collectedAt: null }),
				collection({
					id: 'missing-date',
					collectedAt: null,
					collectionDate: null,
					collectionTimingMode: 'collection_date_duration',
				}),
			],
			ORGANIZATION_TIME_ZONE,
		);

		expect(years[0]?.label).toBe('Undated');
	});

	it('has no undated bucket when every collection is dated', () => {
		const years = groupByYear([collection({ id: 'dated' })], ORGANIZATION_TIME_ZONE);

		expect(years.map((year) => year.key)).toEqual(['2026']);
	});

	// A collection retrieved late on New Year's Eve is that season's, not the next
	// one's. Grouping on the UTC prefix of `collectedAt` — which this did — moves
	// it into a year the crew never worked it in, and the server, which now
	// windows in the agency's zone, disagrees with the screen.
	it('files a late-evening collection in the organization’s year, not UTC’s', () => {
		const newYearsEve = collection({
			id: 'late',
			// 2026-12-31 20:00 in New York; already 2027-01-01 in UTC.
			collectedAt: '2027-01-01 01:00:00+00',
		});

		expect(groupByYear([newYearsEve], ORGANIZATION_TIME_ZONE).map((year) => year.label)).toEqual([
			'2026',
		]);
		expect(groupByYear([newYearsEve], 'UTC').map((year) => year.label)).toEqual(['2027']);
	});

	it('returns nothing for a trap that has never collected', () => {
		expect(groupByYear([], ORGANIZATION_TIME_ZONE)).toEqual([]);
	});
});

describe('specimenTotals', () => {
	it('sums counts and counts distinct species once', () => {
		const totals = specimenTotals([
			species({ id: '1', speciesId: 'vexans', count: 12, sex: 'female' }),
			species({ id: '2', speciesId: 'vexans', count: 3, sex: 'male' }),
			species({ id: '3', speciesId: 'sollicitans', count: 5 }),
		]);

		expect(totals).toEqual({ specimens: 20, species: 2 });
	});

	it('ignores non-positive counts rather than claiming the species was present', () => {
		const totals = specimenTotals([
			species({ id: '1', speciesId: 'vexans', count: 0 }),
			species({ id: '2', speciesId: 'sollicitans', count: 7 }),
		]);

		expect(totals).toEqual({ specimens: 7, species: 1 });
	});
});

describe('summaryLabel', () => {
	it('says a trap is still out before it says anything about specimens', () => {
		const pending = collection({ collectedAt: null });

		expect(summaryLabel(pending, specimenTotals(pending.species))).toBe('Not yet collected');
	});

	it('distinguishes a declared zero result from an unidentified sample', () => {
		const zero = collection({ isZeroResult: true });
		const unkeyed = collection();

		expect(summaryLabel(zero, specimenTotals(zero.species))).toBe('No specimens');
		expect(summaryLabel(unkeyed, specimenTotals(unkeyed.species))).toBe('Not identified');
	});

	it('reads the tally when there is one', () => {
		const counted = collection({
			species: [
				species({ id: '1', speciesId: 'vexans', count: 1200 }),
				species({ id: '2', speciesId: 'sollicitans', count: 40 }),
			],
		});

		expect(summaryLabel(counted, specimenTotals(counted.species))).toBe(
			'2 species · 1,240 specimens',
		);
	});
});
