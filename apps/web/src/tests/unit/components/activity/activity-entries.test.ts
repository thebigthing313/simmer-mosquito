/**
 * What the daily activity log calls a collection.
 *
 * One case per rung of `placeName`: the trap, then the address, then the
 * coordinates. The whole ladder is resolved here rather than where the entry is
 * described, because this is the seam holding the columns (#1231).
 */

import { describe, expect, it } from 'vitest';
import { collectionEntries, type DayScope } from '../../../../components/activity/activity-entries';

const SCOPE: DayScope = { day: '2026-09-01', timeZone: 'America/New_York' };

const COLLECTED_AT = new Date('2026-09-01T14:00:00.000Z');

const ROW = {
	id: 'collection-00000000-0000-4000-8000-000000000001',
	lat: 34.05213,
	lng: -118.24368,
	trap_id: null,
	collection_method_id: 'method-1',
	collected_at: COLLECTED_AT,
	collected_by_profile_id: 'profile-1',
	started_at: null,
	set_by_profile_id: null,
	collection_timing_mode: 'exact_timestamps' as const,
	collection_date: null,
	has_problem: false,
	is_zero_result: false,
	has_bycatch: false,
	created_at: COLLECTED_AT,
	trapCode: null,
	trapName: null,
	addressName: null,
	assisting: [],
};

function placeOf(overrides: Partial<typeof ROW>): string | null | undefined {
	const [entry] = collectionEntries({ ...ROW, ...overrides }, SCOPE);
	return entry?.placeName;
}

describe('collectionEntries', () => {
	it('names a collection by the trap it came from', () => {
		expect(placeOf({ trap_id: 'trap-1', trapCode: 'GR-014', trapName: 'Riverside gravid' })).toBe(
			'GR-014 - Riverside gravid',
		);
	});

	// The address outranks the coordinates: it is the same place said in words.
	it('names a collection with no trap by the address it was linked to', () => {
		expect(placeOf({ addressName: '123 Main St' })).toBe('123 Main St');
	});

	// #1231: this row drew the words "Ad-hoc collection", which name the category
	// every such row already belongs to.
	it('reads the coordinates when there is no trap and no address', () => {
		expect(placeOf({})).toBe('34.05213, -118.24368');
	});
});
