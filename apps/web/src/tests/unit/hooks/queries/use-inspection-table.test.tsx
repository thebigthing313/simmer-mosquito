/** @vitest-environment jsdom */

/**
 * The inspections table's read.
 *
 * Two things are worth holding here. The order is the whole reason the window
 * works: the reader's column and then `created_at`, both columns of
 * `inspections` itself, because the cursor that pages an on-demand collection
 * follows the first `orderBy` clause to whichever collection it names. And the
 * joins are `left`, so an Ad Hoc Inspection with no Habitat, no type and no
 * inspector stays on the table instead of being dropped off it.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
	type InspectionTableRow,
	inspectionSiteLabel,
} from '../../../../hooks/queries/larval-activity-view';
import {
	DEFAULT_INSPECTION_SORT,
	INSPECTION_SORT_KEYS,
	type InspectionSort,
	type InspectionTableFilters,
	inspectionWindowKey,
	nextSort,
	SORT_DIRECTIONS,
	useInspectionTable,
} from '../../../../hooks/queries/use-inspection-table';
import { addresses } from '../../../../lib/collections/addresses';
import { habitat_types } from '../../../../lib/collections/habitat_types';
import { habitats } from '../../../../lib/collections/habitats';
import { inspections } from '../../../../lib/collections/inspections';
import { profiles } from '../../../../lib/collections/profiles';
import {
	installMemoryCollections,
	seedRows,
	subsetPredicate,
	subsetRequests,
} from '../../lib/collections/memory-collections';
import { renderRead } from './read-harness';

/** Every filter off: the whole set, in the sort's order. */
const NO_FILTERS: InspectionTableFilters = {
	dateFrom: '',
	dateTo: '',
	isWet: null,
	densities: new Set(),
	larvaeFound: false,
	habitatTypeIds: new Set(),
	inspectedByProfileIds: new Set(),
};

function inspection(
	id: string,
	overrides: {
		readonly inspection_date?: string;
		readonly created_at?: Date;
		readonly habitat_id?: string | null;
		readonly habitat_type_id?: string | null;
		readonly address_id?: string | null;
		readonly inspected_by_profile_id?: string | null;
		readonly is_wet?: boolean;
		readonly density?: string | null;
		readonly dip_count?: number | null;
		readonly larvae_count?: number | null;
		readonly has_eggs?: boolean;
		readonly has_first_instar?: boolean;
		readonly has_second_instar?: boolean;
		readonly has_third_instar?: boolean;
		readonly has_fourth_instar?: boolean;
		readonly has_pupae?: boolean;
		readonly lat?: number;
		readonly lng?: number;
	} = {},
) {
	return {
		id,
		organization_id: 'org-1',
		lat: 34.05213,
		lng: -118.24368,
		geom_type: 'ST_Point',
		habitat_id: 'h1',
		habitat_type_id: 't1',
		address_id: null,
		inspected_by_profile_id: 'p1',
		assignment_item_id: null,
		inspection_date: '2026-08-12',
		is_wet: true,
		dip_count: 10,
		density: 'light',
		larvae_count: 4,
		has_eggs: false,
		has_first_instar: true,
		has_second_instar: false,
		has_third_instar: false,
		has_fourth_instar: false,
		has_pupae: false,
		created_at: new Date('2026-08-12T10:00:00Z'),
		...overrides,
	};
}

beforeEach(() => {
	installMemoryCollections();
	seedRows(habitats, [{ id: 'h1', habitat_name: 'Alder catch basin', lat: 34.1, lng: -118.2 }]);
	seedRows(habitat_types, [{ id: 't1', name: 'Catch basin' }]);
	seedRows(profiles, [{ id: 'p1', display_name: 'Rosa Lam' }]);
});

async function renderTable(
	limit: number,
	sort: InspectionSort = DEFAULT_INSPECTION_SORT,
	filters: InspectionTableFilters = NO_FILTERS,
) {
	const { result } = await renderRead(() => useInspectionTable(sort, limit, filters));
	return result;
}

/** The ids left after `filters`, in the default order. */
async function filteredIds(filters: Partial<InspectionTableFilters>): Promise<string[]> {
	const result = await renderTable(50, DEFAULT_INSPECTION_SORT, { ...NO_FILTERS, ...filters });
	return result.current.rows.map((row) => row.id);
}

/** The ids the hook returned, which is what every ordering case is about. */
async function orderOf(sort: InspectionSort, limit = 10): Promise<string[]> {
	const result = await renderTable(limit, sort);
	return result.current.rows.map((row) => row.id);
}

describe('useInspectionTable', () => {
	it('opens by inspection date descending', async () => {
		seedRows(inspections, [
			inspection('i1', { inspection_date: '2026-08-10' }),
			inspection('i2', { inspection_date: '2026-08-12' }),
			inspection('i3', { inspection_date: '2026-08-11' }),
		]);

		const result = await renderTable(10);

		expect(result.current.rows.map((row) => row.id)).toEqual(['i2', 'i3', 'i1']);
	});

	it('breaks a tie within a date by the newest entry', async () => {
		// `created_at` gets no column of its own, so this is the only place the
		// rule is visible. Without it a day's rows come back in whatever order the
		// engine keyed them and move under the reader as the window widens.
		seedRows(inspections, [
			inspection('early', { created_at: new Date('2026-08-12T08:00:00Z') }),
			inspection('late', { created_at: new Date('2026-08-12T17:00:00Z') }),
			inspection('midday', { created_at: new Date('2026-08-12T12:00:00Z') }),
		]);

		const result = await renderTable(10);

		expect(result.current.rows.map((row) => row.id)).toEqual(['late', 'midday', 'early']);
	});

	it('returns the newest rows up to the limit, and more when it is raised', async () => {
		seedRows(inspections, [
			inspection('i1', { inspection_date: '2026-08-10' }),
			inspection('i2', { inspection_date: '2026-08-12' }),
			inspection('i3', { inspection_date: '2026-08-11' }),
		]);

		const narrow = await renderTable(2);
		expect(narrow.current.rows.map((row) => row.id)).toEqual(['i2', 'i3']);

		const wide = await renderTable(3);
		expect(wide.current.rows.map((row) => row.id)).toEqual(['i2', 'i3', 'i1']);
	});

	it('names the habitat, the type and the inspector through the joins', async () => {
		seedRows(inspections, [inspection('i1')]);

		const result = await renderTable(10);

		const row = result.current.rows[0];
		expect(row?.habitatName).toBe('Alder catch basin');
		expect(row?.typeName).toBe('Catch basin');
		expect(row?.inspectedByName).toBe('Rosa Lam');
		expect(row?.dipCount).toBe(10);
	});

	it.each(
		INSPECTION_SORT_KEYS.flatMap((key) => SORT_DIRECTIONS.map((direction) => ({ direction, key }))),
	)('pages the window lazily when sorted by $key $direction', async (sort) => {
		/*
		 * The failure this catches is silent. `orderBy` with `limit` pages by
		 * cursor only while the sort key is indexed on the collection being
		 * windowed, with the compare options the clause asks for; without a
		 * matching index the compiler logs one warning and loads the whole filtered
		 * set, which on a real organization's history is the hang this surface
		 * exists to avoid. Right rows, right order, nothing thrown. So the warning
		 * is the assertion, and every sortable column is a case: a key added to
		 * `INSPECTION_SORT_KEYS` with no index behind it fails here.
		 */
		const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
		seedRows(inspections, [inspection('i1')]);

		// With filters set as well as without: a `where` is the other thing that
		// can cost the cursor, and every filter here names a column of
		// `inspections` precisely so it does not.
		await renderTable(10, sort);
		await renderTable(10, sort, {
			...NO_FILTERS,
			dateFrom: '2026-08-01',
			dateTo: '2026-08-31',
			densities: new Set(['light']),
			habitatTypeIds: new Set(['t1']),
			inspectedByProfileIds: new Set(['p1']),
			isWet: true,
			larvaeFound: true,
		});

		const complaints = warn.mock.calls
			.map((call) => String(call[0]))
			.filter((message) => message.includes('requires an index'));
		warn.mockRestore();
		expect(complaints).toEqual([]);
	});

	it('keeps an ad-hoc inspection that has no habitat, type or inspector', async () => {
		// The `left` joins are what do that. An `inner` would take every Ad Hoc
		// Inspection off the table, which is the row least likely to be looked at
		// anywhere else.
		seedRows(inspections, [
			inspection('adhoc', {
				habitat_id: null,
				habitat_type_id: null,
				inspected_by_profile_id: null,
			}),
		]);

		const result = await renderTable(10);

		const row = result.current.rows[0];
		expect(row?.id).toBe('adhoc');
		expect(row?.habitatName).toBeNull();
		expect(row?.typeName).toBeNull();
		expect(row?.inspectedByName).toBeNull();
	});
});

describe('useInspectionTable sorting', () => {
	it('turns the date around', async () => {
		seedRows(inspections, [
			inspection('i1', { inspection_date: '2026-08-10' }),
			inspection('i2', { inspection_date: '2026-08-12' }),
			inspection('i3', { inspection_date: '2026-08-11' }),
		]);

		expect(await orderOf({ key: 'date', direction: 'asc' })).toEqual(['i1', 'i3', 'i2']);
	});

	it('sorts by water, dry at one end and wet at the other', async () => {
		seedRows(inspections, [
			inspection('wet', { is_wet: true }),
			inspection('dry', { is_wet: false }),
		]);

		expect(await orderOf({ key: 'water', direction: 'desc' })).toEqual(['wet', 'dry']);
		expect(await orderOf({ key: 'water', direction: 'asc' })).toEqual(['dry', 'wet']);
	});

	it('sorts by dips and by larvae as numbers', async () => {
		seedRows(inspections, [
			inspection('few', { dip_count: 2, larvae_count: 30 }),
			inspection('many', { dip_count: 12, larvae_count: 1 }),
			inspection('some', { dip_count: 7, larvae_count: 9 }),
		]);

		expect(await orderOf({ key: 'dips', direction: 'desc' })).toEqual(['many', 'some', 'few']);
		expect(await orderOf({ key: 'larvae', direction: 'desc' })).toEqual(['few', 'some', 'many']);
	});

	it('leaves an inspection with no count at the bottom either way', async () => {
		// A count nobody recorded is not a low count, and it is not the answer to
		// "which visits found the most larvae" in either direction. Postgres is
		// told the same thing. The clause reaches it as `NULLS LAST`.
		seedRows(inspections, [
			inspection('counted', { larvae_count: 4 }),
			inspection('uncounted', { larvae_count: null }),
			inspection('busy', { larvae_count: 90 }),
		]);

		expect(await orderOf({ key: 'larvae', direction: 'desc' })).toEqual([
			'busy',
			'counted',
			'uncounted',
		]);
		expect(await orderOf({ key: 'larvae', direction: 'asc' })).toEqual([
			'counted',
			'busy',
			'uncounted',
		]);
	});

	it('keeps the newest-entry tie-break under a column that ties a lot', async () => {
		// Water has two values, so almost every row ties on it. `created_at` is
		// what stops those rows from shuffling as the window widens.
		seedRows(inspections, [
			inspection('early', { is_wet: true, created_at: new Date('2026-08-12T08:00:00Z') }),
			inspection('late', { is_wet: true, created_at: new Date('2026-08-12T17:00:00Z') }),
			inspection('dry', { is_wet: false, created_at: new Date('2026-08-12T21:00:00Z') }),
		]);

		expect(await orderOf({ key: 'water', direction: 'desc' })).toEqual(['late', 'early', 'dry']);
	});

	it('windows the chosen order rather than re-sorting the first page', async () => {
		// The point of the whole arrangement. A narrow window under a new sort is
		// the first rows of the set, not the first rows of the last window.
		seedRows(inspections, [
			inspection('i1', { inspection_date: '2026-08-10', dip_count: 40 }),
			inspection('i2', { inspection_date: '2026-08-12', dip_count: 1 }),
			inspection('i3', { inspection_date: '2026-08-11', dip_count: 9 }),
		]);

		expect(await orderOf({ key: 'dips', direction: 'desc' }, 2)).toEqual(['i1', 'i3']);
	});
});

describe('nextSort', () => {
	it('turns the sorted column around', () => {
		expect(nextSort({ key: 'dips', direction: 'desc' }, 'dips')).toEqual({
			key: 'dips',
			direction: 'asc',
		});
		expect(nextSort({ key: 'dips', direction: 'asc' }, 'dips')).toEqual({
			key: 'dips',
			direction: 'desc',
		});
	});

	it('opens another column at the end readers ask for', () => {
		// Not "keep the direction you were on". Arriving at Larvae ascending shows
		// the visits that found nothing, which is nobody's first question.
		expect(nextSort({ key: 'date', direction: 'asc' }, 'larvae')).toEqual({
			key: 'larvae',
			direction: 'desc',
		});
	});
});

describe('inspectionSiteLabel', () => {
	it('names the habitat when there is one', async () => {
		seedRows(inspections, [inspection('i1')]);

		const result = await renderTable(10);

		expect(siteLabelOf(result.current.rows[0])).toBe('Alder catch basin');
	});

	it('falls back to the linked address', async () => {
		seedRows(addresses, [
			{
				id: 'a1',
				display_name: null,
				address_line_1: '123 Main St',
				address_line_2: null,
				locality: 'Edison',
				region: 'NJ',
				postal_code: '08817',
			},
		]);
		seedRows(inspections, [inspection('i1', { habitat_id: null, address_id: 'a1' })]);

		const result = await renderTable(10);

		expect(siteLabelOf(result.current.rows[0])).toBe('123 Main St, Edison, NJ 08817');
	});

	it('falls back to the centroid when there is neither', async () => {
		seedRows(inspections, [inspection('i1', { habitat_id: null, lat: 34.05213, lng: -118.24368 })]);

		const result = await renderTable(10);

		expect(siteLabelOf(result.current.rows[0])).toBe('34.05213, -118.24368');
	});

	it('names an unnamed habitat by the habitat, not by the linked address', async () => {
		// A Habitat is where the work was done, and an unnamed one is placed by its
		// own coordinates rather than by an Address the inspection happens to link.
		// The Address branch is for an Ad Hoc Inspection, which has no Habitat at
		// all. The day panels read the same rule off `habitatName`.
		seedRows(habitats, [{ id: 'h2', habitat_name: null, lat: 40.1, lng: -74.4 }]);
		seedRows(addresses, [
			{
				id: 'a1',
				display_name: 'Riverside HOA clubhouse',
				address_line_1: null,
				address_line_2: null,
				locality: null,
				region: null,
				postal_code: null,
			},
		]);
		seedRows(inspections, [inspection('i1', { habitat_id: 'h2', address_id: 'a1' })]);

		const result = await renderTable(10);

		expect(siteLabelOf(result.current.rows[0])).toBe('40.1, -74.4');
	});
});

function siteLabelOf(row: InspectionTableRow | undefined): string {
	expect(row, 'the hook returned no row to label').toBeDefined();
	const found = row as InspectionTableRow;
	return inspectionSiteLabel(found, found.address);
}

/** A visit that found nothing, for the cases about the life-stage columns. */
const NO_STAGES = {
	has_eggs: false,
	has_first_instar: false,
	has_second_instar: false,
	has_third_instar: false,
	has_fourth_instar: false,
	has_pupae: false,
} as const;

describe('useInspectionTable filtering', () => {
	beforeEach(() => {
		seedRows(habitat_types, [{ id: 't2', name: 'Tyre pile' }]);
		seedRows(profiles, [{ id: 'p2', display_name: 'Dan Ortiz' }]);
	});

	it('bounds the window at both ends of the inspection date', async () => {
		seedRows(inspections, [
			inspection('before', { inspection_date: '2026-07-31' }),
			inspection('inside', { inspection_date: '2026-08-05' }),
			inspection('after', { inspection_date: '2026-09-01' }),
		]);

		expect(await filteredIds({ dateFrom: '2026-08-01', dateTo: '2026-08-31' })).toEqual(['inside']);
		// A bound left blank is no bound at that end, which is what All time is.
		expect(await filteredIds({ dateFrom: '2026-08-01' })).toEqual(['after', 'inside']);
		expect(await filteredIds({ dateTo: '2026-08-31' })).toEqual(['inside', 'before']);
	});

	it('takes both ends of the date range inclusively', async () => {
		// An operator asking for August means the first and the last of it.
		seedRows(inspections, [
			inspection('first', { inspection_date: '2026-08-01' }),
			inspection('last', { inspection_date: '2026-08-31' }),
		]);

		expect(await filteredIds({ dateFrom: '2026-08-01', dateTo: '2026-08-31' })).toEqual([
			'last',
			'first',
		]);
	});

	it('separates wet from dry', async () => {
		seedRows(inspections, [
			inspection('wet', { inspection_date: '2026-08-12', is_wet: true }),
			inspection('dry', { inspection_date: '2026-08-11', is_wet: false }),
		]);

		expect(await filteredIds({ isWet: true })).toEqual(['wet']);
		expect(await filteredIds({ isWet: false })).toEqual(['dry']);
		expect(await filteredIds({ isWet: null })).toEqual(['wet', 'dry']);
	});

	it('takes any of the densities selected', async () => {
		seedRows(inspections, [
			inspection('quiet', { density: 'none', inspection_date: '2026-08-12' }),
			inspection('light', { density: 'light', inspection_date: '2026-08-11' }),
			inspection('heavy', { density: 'heavy', inspection_date: '2026-08-10' }),
		]);

		expect(await filteredIds({ densities: new Set(['light', 'heavy']) })).toEqual([
			'light',
			'heavy',
		]);
	});

	it('keeps a visit that found any one of the six stages', async () => {
		// Six boolean columns or'd, not a count: a visit that found one pupa and
		// nothing else is a positive one.
		seedRows(inspections, [
			inspection('eggs', { ...NO_STAGES, has_eggs: true }),
			inspection('pupae', { ...NO_STAGES, has_pupae: true }),
			inspection('nothing', NO_STAGES),
		]);

		expect(await filteredIds({ larvaeFound: true })).toEqual(['eggs', 'pupae']);
	});

	it('filters habitat type and inspector by id', async () => {
		// By id rather than by the name the table draws. The name is on a joined
		// collection, and a predicate over that would be applied after the window
		// had already been cut.
		seedRows(inspections, [
			inspection('basin', { habitat_type_id: 't1', inspected_by_profile_id: 'p1' }),
			inspection('tyres', { habitat_type_id: 't2', inspected_by_profile_id: 'p2' }),
		]);

		expect(await filteredIds({ habitatTypeIds: new Set(['t2']) })).toEqual(['tyres']);
		expect(await filteredIds({ inspectedByProfileIds: new Set(['p1']) })).toEqual(['basin']);
	});

	it('narrows by every filter at once', async () => {
		seedRows(inspections, [
			inspection('wanted', {
				density: 'heavy',
				habitat_type_id: 't2',
				inspected_by_profile_id: 'p2',
				inspection_date: '2026-08-10',
				is_wet: true,
			}),
			inspection('wrong-type', {
				density: 'heavy',
				habitat_type_id: 't1',
				inspected_by_profile_id: 'p2',
				inspection_date: '2026-08-10',
				is_wet: true,
			}),
			inspection('wrong-date', {
				density: 'heavy',
				habitat_type_id: 't2',
				inspected_by_profile_id: 'p2',
				inspection_date: '2026-06-10',
				is_wet: true,
			}),
		]);

		expect(
			await filteredIds({
				dateFrom: '2026-08-01',
				dateTo: '2026-08-31',
				densities: new Set(['heavy']),
				habitatTypeIds: new Set(['t2']),
				inspectedByProfileIds: new Set(['p2']),
				isWet: true,
				larvaeFound: true,
			}),
		).toEqual(['wanted']);
	});

	it('windows the filtered set rather than filtering a window', async () => {
		// The failure this catches is the one the whole arrangement exists to
		// avoid: a limit of one over a filter that excludes the newest row returns
		// the newest matching row, not an empty table.
		seedRows(inspections, [
			inspection('newest-dry', { inspection_date: '2026-08-20', is_wet: false }),
			inspection('older-wet', { inspection_date: '2026-08-10', is_wet: true }),
		]);

		const result = await renderTable(1, DEFAULT_INSPECTION_SORT, { ...NO_FILTERS, isWet: true });

		expect(result.current.rows.map((row) => row.id)).toEqual(['older-wet']);
	});
});

describe('the inspections table pushes its filters down', () => {
	/*
	 * The acceptance criterion nothing above can answer. Every case up to here
	 * runs against collections that hold every seeded row, so a predicate applied
	 * in the browser and one answered by Postgres return the same rows and read
	 * the same in a test. This installs the collections in the mode the app runs
	 * them in and records what the query handed the sync layer, which is the tree
	 * `compileSQL` turns into the shape request's `where`. A filter that is not in
	 * a recorded request is one the browser applied to rows it had already been
	 * sent.
	 */
	beforeEach(() => {
		installMemoryCollections({ recordSubsets: true });
		seedRows(habitat_types, [{ id: 't1', name: 'Catch basin' }]);
		seedRows(profiles, [{ id: 'p1', display_name: 'Rosa Lam' }]);
		seedRows(inspections, [inspection('i1')]);
	});

	/** Every predicate the inspections collection was asked to load under. */
	async function requestedPredicates(filters: Partial<InspectionTableFilters>) {
		await renderTable(50, DEFAULT_INSPECTION_SORT, { ...NO_FILTERS, ...filters });
		return subsetRequests(inspections).map(subsetPredicate);
	}

	it.each([
		{
			name: 'date range',
			filters: { dateFrom: '2026-08-01', dateTo: '2026-08-31' },
			expected: ['inspection_date >= 2026-08-01', 'inspection_date <= 2026-08-31'],
		},
		{ name: 'water', filters: { isWet: true }, expected: ['is_wet = true'] },
		{
			name: 'density',
			filters: { densities: new Set(['light', 'heavy'] as const) },
			expected: ['density = ANY [light, heavy]'],
		},
		{
			name: 'larvae found',
			filters: { larvaeFound: true },
			expected: [
				'(has_eggs = true or has_first_instar = true or has_second_instar = true or has_third_instar = true or has_fourth_instar = true or has_pupae = true)',
			],
		},
		{
			name: 'habitat type',
			filters: { habitatTypeIds: new Set(['t1']) },
			expected: ['habitat_type_id = ANY [t1]'],
		},
		{
			name: 'inspector',
			filters: { inspectedByProfileIds: new Set(['p1']) },
			expected: ['inspected_by_profile_id = ANY [p1]'],
		},
	])('sends the $name predicate to the server', async ({ filters, expected }) => {
		const predicates = await requestedPredicates(filters);

		expect(predicates.length).toBeGreaterThan(0);
		for (const fragment of expected) {
			expect(predicates.some((predicate) => predicate.includes(fragment))).toBe(true);
		}
	});

	it('sends the order and the window size with the predicate', async () => {
		// All three travel together or none of them narrows anything: a `where`
		// with no `limit` is the whole filtered history in the browser.
		await renderTable(50, DEFAULT_INSPECTION_SORT, { ...NO_FILTERS, isWet: true });

		const requests = subsetRequests(inspections);
		expect(requests.some((request) => request.orderBy !== undefined)).toBe(true);
		expect(requests.some((request) => request.limit !== undefined)).toBe(true);
	});

	it('names bare columns, which is what the compiler can turn into SQL', async () => {
		// `compileSQL` throws on a reference with more than one path segment, so a
		// predicate that reached it as `inspection.is_wet` would fail the shape
		// request rather than narrow it.
		const predicates = await requestedPredicates({
			dateFrom: '2026-08-01',
			habitatTypeIds: new Set(['t1']),
			isWet: true,
		});

		expect(predicates.join(' ')).not.toContain('inspection.');
	});
});

describe('inspectionWindowKey', () => {
	it('changes when the sort or a filter changes', () => {
		const opening = inspectionWindowKey(DEFAULT_INSPECTION_SORT, NO_FILTERS);

		expect(inspectionWindowKey(DEFAULT_INSPECTION_SORT, { ...NO_FILTERS, isWet: true })).not.toBe(
			opening,
		);
		expect(
			inspectionWindowKey(DEFAULT_INSPECTION_SORT, { ...NO_FILTERS, dateFrom: '2026-08-01' }),
		).not.toBe(opening);
		expect(inspectionWindowKey({ key: 'dips', direction: 'desc' }, NO_FILTERS)).not.toBe(opening);
	});

	it('reads two orderings of the same selection as one window', () => {
		// The URL's array order is whatever order the reader ticked boxes in.
		// Resetting the window on that would throw the loaded rows away for
		// nothing.
		const first = inspectionWindowKey(DEFAULT_INSPECTION_SORT, {
			...NO_FILTERS,
			habitatTypeIds: new Set(['t2', 't1']),
		});
		const second = inspectionWindowKey(DEFAULT_INSPECTION_SORT, {
			...NO_FILTERS,
			habitatTypeIds: new Set(['t1', 't2']),
		});

		expect(first).toBe(second);
	});
});
