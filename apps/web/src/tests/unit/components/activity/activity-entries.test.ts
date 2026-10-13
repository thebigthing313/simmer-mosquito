/**
 * What the daily activity log calls a collection and an inspection.
 *
 * One case per rung of `placeName`. A collection reads the trap, then the
 * address, then the coordinates; an inspection reads the habitat, then the
 * address, then the habitat's id, then the coordinates. The whole ladder is
 * resolved here rather than where the entry is described, because this is the
 * seam holding the columns (#1231, #1688).
 */

import { describe, expect, it } from 'vitest';
import {
	collectionEntries,
	type DayScope,
	inspectionEntries,
} from '../../../../components/activity/activity-entries';

const SCOPE: DayScope = { day: '2026-09-01', timeZone: 'America/New_York' };

const COLLECTED_AT = new Date('2026-09-01T14:00:00.000Z');

const ROW = {
	id: 'collection-00000000-0000-4000-8000-000000000001',
	lat: 34.05213,
	lng: -118.24368,
	trap_id: null as string | null,
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
	trapCode: null as string | null,
	trapName: null as string | null,
	addressName: null as string | null,
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

const INSPECTION = {
	id: 'inspection-00000000-0000-4000-8000-000000000001',
	lat: 34.05213,
	lng: -118.24368,
	inspection_date: SCOPE.day,
	habitat_id: null as string | null,
	habitat_type_id: 'habitat-type-1',
	inspected_by_profile_id: 'profile-1',
	is_wet: true,
	density: null,
	has_eggs: false,
	has_first_instar: false,
	has_second_instar: false,
	has_third_instar: false,
	has_fourth_instar: false,
	has_pupae: false,
	created_at: COLLECTED_AT,
	habitatName: null as string | null,
	addressName: null as string | null,
	assisting: [],
};

function inspectionPlaceOf(overrides: Partial<typeof INSPECTION>): string | null | undefined {
	const [entry] = inspectionEntries({ ...INSPECTION, ...overrides }, SCOPE);
	return entry?.placeName;
}

describe('inspectionEntries', () => {
	it('names an inspection by the habitat it was recorded at', () => {
		expect(
			inspectionPlaceOf({
				habitat_id: '4f3c1a2b-0000-4000-8000-000000000001',
				habitatName: 'North ditch',
			}),
		).toBe('North ditch');
	});

	// #1688: `habitats` syncs on demand, so the left join is unmatched until the
	// row lands. The inspection still names a habitat, and the coordinates would
	// say it had none.
	it('names an inspection by its habitat id while the habitat has not loaded', () => {
		expect(inspectionPlaceOf({ habitat_id: '4f3c1a2b-0000-4000-8000-000000000001' })).toBe(
			'Habitat 4f3c1a2b',
		);
	});

	it('names an inspection with no habitat by the address it was linked to', () => {
		expect(inspectionPlaceOf({ addressName: '123 Main St' })).toBe('123 Main St');
	});

	it('reads the coordinates when there is no habitat and no address', () => {
		expect(inspectionPlaceOf({})).toBe('34.05213, -118.24368');
	});
});
