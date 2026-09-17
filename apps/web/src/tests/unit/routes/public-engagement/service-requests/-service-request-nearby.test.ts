import { mapFamily } from '@simmer-mosquito/design-tokens';
import { describe, expect, it } from 'vitest';
import type { Tag } from '../../../../../hooks/queries/tag-view';
import type { ActivityLookups } from '../../../../../routes/-activity-data';
import {
	buildNearbyMapData,
	countNearbyByFamily,
	formatNearbyDistance,
	formatRadiusLabel,
	type NearbyCategory,
	type NearbyItem,
	type NearbyResponse,
	nearbyItemDate,
	nearbyItemKey,
	nearbyRow,
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

describe('nearbyItemKey', () => {
	// Seven categories are seven tables, so the id alone cannot key a selection.
	it('tells two records sharing an id apart by category', () => {
		expect(nearbyItemKey(item('r-1', 'habitat', 10))).toBe('habitat:r-1');
		expect(nearbyItemKey(item('r-1', 'inspection', 10))).toBe('inspection:r-1');
	});
});

describe('buildNearbyMapData', () => {
	const RESPONSE: NearbyResponse = {
		request: { id: 'sr-1', lat: 42, lng: -71, requestDate: '2026-08-01' },
		radius: { amount: 500, unitCode: 'meter', meters: 500 },
		timeWindow: { daysBefore: 30, daysAfter: 30 },
		dateFrom: '2026-07-02',
		dateTo: '2026-08-31',
		dateToFrom: 'setting',
		families: ['larval', 'adult', 'control'],
		items: ITEMS,
	};

	it('draws the ring, the centre and the pins of the families it is handed', () => {
		const data = buildNearbyMapData({ lat: 42, lng: -71 }, RESPONSE, new Set(['control']));
		expect(data.features.map((feature) => feature.properties?.role)).toEqual([
			'ring',
			'nearby',
			'nearby',
			'center',
		]);
		expect(
			data.features
				.filter((feature) => feature.properties?.role === 'nearby')
				.map((f) => f.properties),
		).toEqual([
			{
				role: 'nearby',
				id: 'application:application',
				recordId: 'application',
				family: 'control',
				category: 'application',
			},
			{
				role: 'nearby',
				id: 'biocontrol:biocontrol',
				recordId: 'biocontrol',
				family: 'control',
				category: 'biocontrol',
			},
		]);
	});

	// The pin's `id` is what the layer hands back on a click, so it is the
	// selection key and not the record id.
	it('keys every pin by the item key the list selects on', () => {
		const data = buildNearbyMapData(
			{ lat: 42, lng: -71 },
			RESPONSE,
			new Set(['infrastructure', 'surveillance', 'control']),
		);
		const pins = data.features.filter((feature) => feature.properties?.role === 'nearby');
		expect(pins.map((pin) => pin.properties?.id)).toEqual(ITEMS.map(nearbyItemKey));
	});

	it('draws the request and its radius alone when handed no family', () => {
		const data = buildNearbyMapData({ lat: 42, lng: -71 }, RESPONSE, new Set());
		expect(data.features.map((feature) => feature.properties?.role)).toEqual(['ring', 'center']);
	});

	it('draws the centre alone before the response lands', () => {
		const data = buildNearbyMapData({ lat: 42, lng: -71 }, undefined, new Set(['control']));
		expect(data.features.map((feature) => feature.properties?.role)).toEqual(['center']);
	});
});

describe('visibleNearbyItems', () => {
	it('keeps only the families it is handed, nearest first', () => {
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

describe('nearbyRow', () => {
	const PRIORITY: Tag = { id: 'tag-1', name: 'Priority', color: null, description: null };
	const LOOKUPS: ActivityLookups = {
		nameById: new Map([
			['type-1', 'Catch basin'],
			['method-1', 'CDC light trap'],
			['product-1', 'VectoBac 12AS'],
			['method-2', 'Backpack sprayer'],
		]),
		formatQuantity: (amount, unitId) => `${amount} ${unitId ?? 'each'}`,
		tagById: new Map([[PRIORITY.id, PRIORITY]]),
	};

	// The describer is Daily Work's, so each category is titled the way the same
	// record is titled in a Profile's log; what this list adds is the category
	// ahead of the subtitle, since there is no verb here to say what the record
	// is. One case per category, so a kind the describer forgets fails here.
	it.each([
		[
			'habitat',
			{ label: 'Elm St basin', refId: 'type-1' },
			{ title: 'Elm St basin', subtitle: 'Habitat · Catch basin' },
		],
		[
			'trap',
			{ label: 'Trap 14', refId: 'method-1' },
			{ title: 'Trap 14', subtitle: 'Trap · CDC light trap' },
		],
		[
			'inspection',
			{ placeName: 'Elm St basin', refId: 'type-1' },
			{ title: 'Elm St basin', subtitle: 'Inspection · Catch basin' },
		],
		[
			'collection',
			{ placeName: 'Trap 14', refId: 'method-1' },
			{ title: 'Trap 14', subtitle: 'Collection · CDC light trap' },
		],
		[
			'application',
			{
				refId: 'product-1',
				methodRefId: 'method-2',
				amount: 2,
				unitId: 'gal',
				placeName: 'Elm St basin',
			},
			{ title: 'VectoBac 12AS', subtitle: 'Application · 2 gal · Backpack sprayer · Elm St basin' },
		],
		[
			'sourceReduction',
			{ refId: 'method-2', placeName: 'Elm St basin' },
			{ title: 'Backpack sprayer', subtitle: 'Source Reduction · Elm St basin' },
		],
		[
			'biocontrol',
			{ refId: 'method-2', amount: 40, placeName: 'Elm St basin' },
			{ title: 'Backpack sprayer', subtitle: 'Biocontrol · 40 each · Elm St basin' },
		],
	] as const)('describes a %s the way Daily Work does, category first', (category, fields, expected) => {
		const row = nearbyRow(item('a', category, 10, fields), LOOKUPS, 'meter');
		expect({ title: row.title, subtitle: row.subtitle }).toEqual(expected);
	});

	// The category is the title then, and a subtitle repeating it says nothing.
	it('falls back to the category when a record has nothing to name it, once', () => {
		const row = nearbyRow(item('a', 'habitat', 10), LOOKUPS, 'meter');
		expect({ title: row.title, subtitle: row.subtitle }).toEqual({
			title: 'Habitat',
			subtitle: null,
		});
	});

	it('dates a visit for the rail and leaves a place undated', () => {
		expect(nearbyRow(item('a', 'inspection', 10), LOOKUPS, 'meter').date).toBe('Aug 1, 2026');
		expect(nearbyRow(item('a', 'trap', 10), LOOKUPS, 'meter').date).toBeNull();
	});

	it('formats the distance in the family of the radius unit', () => {
		expect(nearbyRow(item('a', 'trap', 100), LOOKUPS, 'mile').distance).toBe('328 ft');
		expect(nearbyRow(item('a', 'trap', 100), LOOKUPS, 'meter').distance).toBe('100 m');
	});

	// The dot is the family, in the three hues the map paints, and its name is
	// the family's rather than the record's, since the title names the record.
	it.each([
		['habitat', mapFamily.larval, 'Infrastructure'],
		['inspection', mapFamily.adult, 'Surveillance'],
		['biocontrol', mapFamily.control, 'Control'],
	] as const)('colours a %s in its family hue', (category, color, label) => {
		expect(nearbyRow(item('a', category, 10), LOOKUPS, 'meter').swatch).toEqual({ color, label });
	});

	it('reads the badge facts and the Tags off the register the log reads', () => {
		const row = nearbyRow(
			item('a', 'inspection', 10, { detail: 'dry', tagIds: ['tag-1', 'unknown'] }),
			LOOKUPS,
			'meter',
		);
		expect(row.facts).toEqual({
			category: 'inspection',
			result: { isWet: false, density: null, stages: null },
		});
		expect(row.tags).toEqual([PRIORITY]);
	});

	it("links the chevron to the record's own detail page", () => {
		expect(nearbyRow(item('sr-9', 'sourceReduction', 10), LOOKUPS, 'meter').link).toEqual({
			to: '/control-operations/source-reduction/$id',
			params: { id: 'sr-9' },
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
			'5 records within 0.25 mi, Aug 1, 2026–Oct 2, 2026, extended to the day it was closed.',
		);
	});

	it('names today while an old request is still open', () => {
		expect(nearbySummary(response({ dateTo: '2026-09-17', dateToFrom: 'today' }))).toBe(
			'5 records within 0.25 mi, Aug 1, 2026–Sep 17, 2026, extended to today.',
		);
	});

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
