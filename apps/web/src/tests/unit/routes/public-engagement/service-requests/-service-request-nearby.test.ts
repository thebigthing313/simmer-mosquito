import { describe, expect, it } from 'vitest';
import {
	countNearbyByFamily,
	describeNearbyItem,
	formatNearbyDistance,
	formatRadiusLabel,
	type NearbyCategory,
	type NearbyItem,
	type NearbyResponse,
	nearbyItemDate,
	nearbySummary,
	visibleNearbyItems,
} from '../../../../../routes/public-engagement/service-requests/-service-request-nearby';

function item(
	id: string,
	category: NearbyCategory,
	distanceMeters: number,
	overrides: Partial<NearbyItem> = {},
): NearbyItem {
	return {
		category,
		family: 'larval',
		id,
		lat: 42,
		lng: -71,
		distanceMeters,
		date: '2026-08-01',
		occurredAt: null,
		label: null,
		placeName: null,
		refId: null,
		methodRefId: null,
		amount: null,
		unitId: null,
		detail: null,
		stages: null,
		context: null,
		hasBycatch: null,
		tagIds: null,
		...overrides,
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

describe('nearbyItemDate', () => {
	// The row dates a place by the day its record was created, which is the
	// activity register's rule. Beside a request that day says nothing, so the
	// list keeps drawing a habitat or a trap without one.
	it.each(['habitat', 'trap'] as const)('leaves the date off a %s', (category) => {
		expect(nearbyItemDate(item('a', category, 10))).toBeNull();
	});

	it.each([
		'inspection',
		'collection',
		'application',
		'sourceReduction',
		'biocontrol',
	] as const)('keeps the date on a %s', (category) => {
		expect(nearbyItemDate(item('a', category, 10))).toBe('2026-08-01');
	});
});

describe('describeNearbyItem', () => {
	const NAMES = new Map([
		['type-1', 'Catch basin'],
		['method-1', 'CDC light trap'],
	]);

	// Only habitats and traps are named records; the operational categories are
	// titled by what they are and carry the lookup name underneath.
	it('titles a habitat by its own name and keeps the type underneath', () => {
		expect(
			describeNearbyItem(
				item('a', 'habitat', 10, { label: 'Elm St basin', refId: 'type-1' }),
				NAMES,
			),
		).toEqual({ title: 'Elm St basin', subtitle: 'Catch basin' });
	});

	it('falls back to the habitat type when the habitat is unnamed', () => {
		expect(describeNearbyItem(item('a', 'habitat', 10, { refId: 'type-1' }), NAMES)).toEqual({
			title: 'Catch basin',
			subtitle: null,
		});
	});

	it('falls back to the bare category when a habitat has neither', () => {
		expect(describeNearbyItem(item('a', 'habitat', 10), NAMES)).toEqual({
			title: 'Habitat',
			subtitle: null,
		});
	});

	it('titles a trap by its own name, with the collection method underneath', () => {
		expect(
			describeNearbyItem(item('a', 'trap', 10, { label: 'Trap 14', refId: 'method-1' }), NAMES),
		).toEqual({ title: 'Trap 14', subtitle: 'CDC light trap' });
	});

	it('gives an inspection no subtitle, since it references no lookup', () => {
		expect(describeNearbyItem(item('a', 'inspection', 10, { refId: 'method-1' }), NAMES)).toEqual({
			title: 'Inspection',
			subtitle: null,
		});
	});

	it.each([
		['collection', 'Collection'],
		['application', 'Application'],
		['sourceReduction', 'Source reduction'],
		['biocontrol', 'Biocontrol'],
	] as const)('titles a %s by its category, with the method underneath', (category, title) => {
		expect(describeNearbyItem(item('a', category, 10, { refId: 'method-1' }), NAMES)).toEqual({
			title,
			subtitle: 'CDC light trap',
		});
	});

	// A label of spaces is not a name. Trusting it would title the row blank.
	it('treats a whitespace-only label as no name at all', () => {
		expect(describeNearbyItem(item('a', 'trap', 10, { label: '   ' }), NAMES)).toEqual({
			title: 'Trap',
			subtitle: null,
		});
	});

	it('trims the label it does use', () => {
		expect(describeNearbyItem(item('a', 'trap', 10, { label: '  Trap 14  ' }), NAMES)).toEqual({
			title: 'Trap 14',
			subtitle: null,
		});
	});

	// The lookup collections sync separately from the nearby response, so a
	// refId can arrive before the row that names it.
	it('drops the subtitle when the referenced name has not synced yet', () => {
		expect(describeNearbyItem(item('a', 'collection', 10, { refId: 'unknown' }), NAMES)).toEqual({
			title: 'Collection',
			subtitle: null,
		});
	});
});

describe('formatNearbyDistance', () => {
	it('shows feet below the mile-switch point', () => {
		expect(formatNearbyDistance(100, 'mile')).toBe('328 ft');
	});

	it('switches to miles at a thousand feet', () => {
		expect(formatNearbyDistance(304.8, 'mile')).toBe('0.19 mi');
	});

	it('shows metres below a kilometre', () => {
		expect(formatNearbyDistance(100, 'meter')).toBe('100 m');
	});

	it('switches to kilometres at a thousand metres', () => {
		expect(formatNearbyDistance(1500, 'meter')).toBe('1.50 km');
	});

	// The unit code comes off the org setting, so its casing and padding are
	// whatever was stored.
	it.each(['MILE', ' ft ', 'Feet', 'yd'])('reads %o as imperial', (unitCode) => {
		expect(formatNearbyDistance(100, unitCode)).toBe('328 ft');
	});

	it('falls back to metric for a unit it does not recognise', () => {
		expect(formatNearbyDistance(100, 'furlong')).toBe('100 m');
	});
});

describe('formatRadiusLabel', () => {
	it('abbreviates a unit it knows', () => {
		expect(formatRadiusLabel(0.25, 'mile')).toBe('0.25 mi');
	});

	it.each([
		['kilometer', 'km'],
		['meter', 'm'],
		['foot', 'ft'],
		['yard', 'yd'],
	])('abbreviates %s to %s', (unitCode, abbreviation) => {
		expect(formatRadiusLabel(2, unitCode)).toBe(`2 ${abbreviation}`);
	});

	it('shows an unknown unit code as it stands rather than dropping it', () => {
		expect(formatRadiusLabel(3, 'furlong')).toBe('3 furlong');
	});
});

describe('nearbySummary', () => {
	function response(overrides: Partial<NearbyResponse> = {}): NearbyResponse {
		return {
			request: { id: 'r', lat: 42, lng: -71, requestDate: '2026-08-15' },
			radius: { amount: 0.25, unitCode: 'mile', meters: 402.336 },
			timeWindow: { daysBefore: 14, daysAfter: 14 },
			dateFrom: '2026-08-01',
			dateTo: '2026-08-29',
			dateToFrom: 'setting',
			families: ['larval', 'adult', 'control'],
			items: ITEMS,
			...overrides,
		};
	}

	it('names the settings while the fetch is out', () => {
		expect(nearbySummary(undefined)).toBe(
			'Records around this request, from your public-engagement settings.',
		);
	});

	// The end of the window is a floor set by `daysAfter` and runs on to the
	// close, or to today while the request is open (#1084). A range that ran
	// past the setting used to send a reader to the settings for a number that
	// says 14, so the sentence names the end that won (#1085).
	it('reads count, radius and range when the setting set the end', () => {
		expect(nearbySummary(response())).toBe('5 records within 0.25 mi, Aug 1, 2026–Aug 29, 2026.');
	});

	it('names the close when the request closed after the setting', () => {
		expect(nearbySummary(response({ dateTo: '2026-10-02', dateToFrom: 'close' }))).toBe(
			'5 records within 0.25 mi, Aug 1, 2026–Oct 2, 2026, through the day it was closed.',
		);
	});

	it('names today while an old request is still open', () => {
		expect(nearbySummary(response({ dateTo: '2026-09-17', dateToFrom: 'today' }))).toBe(
			'5 records within 0.25 mi, Aug 1, 2026–Sep 17, 2026, through today.',
		);
	});

	// A caller's own end is nobody's anchor, so the sentence reads as it does
	// on the setting.
	it('names no end for a range the caller set', () => {
		expect(nearbySummary(response({ dateTo: '2026-08-01', dateToFrom: 'query' }))).toBe(
			'5 records within 0.25 mi, Aug 1, 2026–Aug 1, 2026.',
		);
	});

	it('counts one record in the singular and none as No', () => {
		expect(nearbySummary(response({ items: [item('trap', 'trap', 300)] }))).toBe(
			'1 record within 0.25 mi, Aug 1, 2026–Aug 29, 2026.',
		);
		expect(nearbySummary(response({ items: [] }))).toBe(
			'No records within 0.25 mi, Aug 1, 2026–Aug 29, 2026.',
		);
	});
});
