import { describe, expect, it } from 'vitest';
import {
	countNearbyByFamily,
	type NearbyCategory,
	type NearbyItem,
	visibleNearbyItems,
} from '../../../../../routes/public-engagement/service-requests/-service-request-nearby';

function item(id: string, category: NearbyCategory, distanceMeters: number): NearbyItem {
	return {
		category,
		id,
		lat: 42,
		lng: -71,
		distanceMeters,
		date: null,
		label: null,
		refId: null,
		status: null,
	};
}

const ITEMS: readonly NearbyItem[] = [
	item('trap', 'trap', 300),
	item('habitat', 'habitat', 50),
	item('inspection', 'inspection', 200),
	item('application', 'application', 100),
	item('biocontrol', 'biocontrol', 400),
];

describe('countNearbyByFamily', () => {
	it('counts every family, including the ones with nothing in them', () => {
		expect(countNearbyByFamily(ITEMS)).toEqual({
			infrastructure: 2,
			surveillance: 1,
			control: 2,
		});
	});

	it('reports zeroes rather than gaps for an empty result', () => {
		expect(countNearbyByFamily([])).toEqual({
			infrastructure: 0,
			surveillance: 0,
			control: 0,
		});
	});
});

describe('visibleNearbyItems', () => {
	it('keeps only the toggled-on families, nearest first', () => {
		const visible = visibleNearbyItems(ITEMS, new Set(['infrastructure', 'control']));
		expect(visible.map((entry) => entry.id)).toEqual([
			'habitat',
			'application',
			'trap',
			'biocontrol',
		]);
	});

	// The map and the list read the same response; sorting the list must not
	// reorder what the caller handed in.
	it('leaves the array it was handed alone', () => {
		const source = [...ITEMS];
		visibleNearbyItems(source, new Set(['infrastructure', 'surveillance', 'control']));
		expect(source.map((entry) => entry.id)).toEqual(ITEMS.map((entry) => entry.id));
	});

	it('returns nothing when every family is hidden', () => {
		expect(visibleNearbyItems(ITEMS, new Set())).toEqual([]);
	});
});
