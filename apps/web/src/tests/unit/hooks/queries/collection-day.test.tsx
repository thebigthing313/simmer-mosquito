/** @vitest-environment jsdom */

/**
 * Which day a collection counts on: the day function as a table, and the two
 * query predicates run on real TanStack DB collections, because a bound in the
 * wrong type compares a `Date` against text and orders by neither.
 */

import { useLiveQuery } from '@tanstack/react-db';
import { beforeEach, describe, expect, it } from 'vitest';
import {
	collectedOn,
	collectedSince,
	collectionEffectiveDate,
} from '../../../../hooks/queries/collection-day';
import type { CollectionDates } from '../../../../hooks/queries/collection-view';
import { collections } from '../../../../lib/collections/collections';
import { operationalDayAsInstant } from '../../../../lib/local-date';
import { installMemoryCollections, seedRows } from '../../lib/collections/memory-collections';
import { renderRead } from './read-harness';

/** Five hours behind UTC in September, so an instant and its day can disagree. */
const ZONE = 'America/Chicago';

describe('collectionEffectiveDate', () => {
	const cases: readonly {
		readonly name: string;
		readonly row: CollectionDates;
		readonly zone?: string;
		readonly day: string | null;
	}[] = [
		{
			name: 'an instant row reads the instant in the zone',
			row: { collectedAt: new Date('2026-09-15T15:00:00Z'), collectionDate: null },
			day: '2026-09-15',
		},
		{
			name: 'a date row reads the plain day',
			row: { collectedAt: null, collectionDate: '2026-09-15' },
			day: '2026-09-15',
		},
		{
			name: 'a row with neither is pending',
			row: { collectedAt: null, collectionDate: null },
			day: null,
		},
		{
			name: 'an unparseable string keeps its leading date',
			row: { collectedAt: '2026-09-15 at dusk', collectionDate: null },
			day: '2026-09-15',
		},
		{
			name: 'an invalid Date carries nothing',
			row: { collectedAt: new Date('not a date'), collectionDate: null },
			day: null,
		},
		{
			// 22:30 in Chicago on the 15th is 03:30 UTC on the 16th.
			name: 'an instant at 22:30 local west of UTC reads the local day',
			row: { collectedAt: new Date('2026-09-16T03:30:00Z'), collectionDate: null },
			day: '2026-09-15',
		},
		{
			name: 'the same instant read in UTC is the next day',
			row: { collectedAt: new Date('2026-09-16T03:30:00Z'), collectionDate: null },
			zone: 'UTC',
			day: '2026-09-16',
		},
		{
			// 2026-12-31 20:00 in New York, already 2027-01-01 in UTC, as the string
			// `/map/collections` hands up.
			name: 'an ISO string late on New Year’s Eve reads the zone’s year',
			row: { collectedAt: '2027-01-01 01:00:00+00', collectionDate: null },
			zone: 'America/New_York',
			day: '2026-12-31',
		},
	];

	for (const { name, row, zone, day } of cases) {
		it(name, () => {
			expect(collectionEffectiveDate(row, zone ?? ZONE)).toBe(day);
		});
	}
});

/**
 * The two halves of an operational date, checked against each other.
 *
 * A collection's date is typed as a calendar day, widened to an instant to be
 * stored, and narrowed back to a calendar day to be read. Each half is correct
 * on its own terms and they were written months apart; what nothing covered was
 * whether they agree. They did not past ±12, which is issue #156.
 */
describe('a typed collection date, stamped and read back', () => {
	/** Long after every day stamped here, so the same-day clamp never applies. */
	const LONG_AFTER = new Date('2027-01-01T00:00:00.000Z');

	it('reads back as the day that was typed, in a zone past +12', () => {
		const typed = '2026-08-04';
		const zone = 'Pacific/Auckland';
		const collectedAt = operationalDayAsInstant(typed, zone, LONG_AFTER);
		expect(collectionEffectiveDate({ collectedAt, collectionDate: null }, zone)).toBe(typed);
	});

	it('agrees on the day a clamped same-day stamp falls on', () => {
		// Keyed at 09:00 local, so the stamp is now rather than the organization's
		// midday. Any instant that day answers the same question, which is what
		// makes the clamp safe.
		const zone = 'America/New_York';
		const morning = new Date('2026-08-04T13:00:00.000Z');
		const collectedAt = operationalDayAsInstant('2026-08-04', zone, morning);
		expect(collectionEffectiveDate({ collectedAt, collectionDate: null }, zone)).toBe('2026-08-04');
	});

	it('is the stamp that had to change, not the reader', () => {
		// The stamp this replaced, through the same reader in the same zone. If
		// anything puts midday UTC back, the test above starts failing and this
		// one says why.
		expect(
			collectionEffectiveDate(
				{ collectedAt: '2026-08-04T12:00:00.000Z', collectionDate: null },
				'Pacific/Auckland',
			),
		).toBe('2026-08-05');
	});
});

/** A collection on trap `t1`, undated unless a column is passed. */
function collection(
	id: string,
	dates: { readonly collected_at?: Date | null; readonly collection_date?: string | null } = {},
) {
	return {
		id,
		trap_id: 't1',
		collection_method_id: 'm1',
		collected_at: null,
		collection_date: null,
		collection_timing_mode:
			dates.collected_at === undefined ? 'collection_date_duration' : 'exact_timestamps',
		has_problem: false,
		is_zero_result: false,
		has_bycatch: false,
		...dates,
	};
}

const SINCE = '2026-09-10';

/** Local midnight on `SINCE` in Chicago, as the instant it is. */
const SINCE_MIDNIGHT = new Date('2026-09-10T05:00:00Z');
const MINUTE = 60_000;

beforeEach(() => {
	installMemoryCollections();
});

describe('collectedSince', () => {
	function useIdsSince() {
		return useLiveQuery((query) =>
			query
				.from({ collection: collections() })
				.where(({ collection }) => collectedSince(collection, SINCE, ZONE))
				.select(({ collection }) => ({ id: collection.id })),
		);
	}

	it('keeps an instant at local midnight of since and drops one a minute earlier', async () => {
		seedRows(collections, [
			collection('midnight', { collected_at: SINCE_MIDNIGHT }),
			collection('minute-before', {
				collected_at: new Date(SINCE_MIDNIGHT.getTime() - MINUTE),
			}),
		]);

		const { result } = await renderRead(useIdsSince);

		expect(result.current.data.map((row) => row.id)).toEqual(['midnight']);
	});

	it('keeps a date on since and drops the day before', async () => {
		seedRows(collections, [
			collection('on-since', { collection_date: SINCE }),
			collection('day-before', { collection_date: '2026-09-09' }),
		]);

		const { result } = await renderRead(useIdsSince);

		expect(result.current.data.map((row) => row.id)).toEqual(['on-since']);
	});

	it('drops a pending row', async () => {
		seedRows(collections, [collection('pending')]);

		const { result } = await renderRead(useIdsSince);

		expect(result.current.data).toEqual([]);
	});
});

describe('collectedOn', () => {
	function useIdsOn() {
		return useLiveQuery((query) =>
			query
				.from({ collection: collections() })
				.where(({ collection }) => collectedOn(collection, SINCE, ZONE))
				.select(({ collection }) => ({ id: collection.id })),
		);
	}

	it('keeps the local day from its first minute to its last, on either column', async () => {
		seedRows(collections, [
			collection('first-minute', { collected_at: SINCE_MIDNIGHT }),
			collection('last-minute', {
				collected_at: new Date(SINCE_MIDNIGHT.getTime() + 24 * 60 * MINUTE - MINUTE),
			}),
			collection('day-before', { collected_at: new Date(SINCE_MIDNIGHT.getTime() - MINUTE) }),
			collection('day-after', {
				collected_at: new Date(SINCE_MIDNIGHT.getTime() + 24 * 60 * MINUTE),
			}),
			collection('dated', { collection_date: SINCE }),
			collection('dated-after', { collection_date: '2026-09-11' }),
			collection('pending'),
		]);

		const { result } = await renderRead(useIdsOn);

		expect(result.current.data.map((row) => row.id).sort()).toEqual([
			'dated',
			'first-minute',
			'last-minute',
		]);
	});
});
