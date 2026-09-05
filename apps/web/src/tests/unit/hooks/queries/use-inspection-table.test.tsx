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
	nextSort,
	SORT_DIRECTIONS,
	useInspectionTable,
} from '../../../../hooks/queries/use-inspection-table';
import { addresses } from '../../../../lib/collections/addresses';
import { habitat_types } from '../../../../lib/collections/habitat_types';
import { habitats } from '../../../../lib/collections/habitats';
import { inspections } from '../../../../lib/collections/inspections';
import { profiles } from '../../../../lib/collections/profiles';
import { installMemoryCollections, seedRows } from '../../lib/collections/memory-collections';
import { renderRead } from './read-harness';

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
		readonly dip_count?: number | null;
		readonly larvae_count?: number | null;
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

async function renderTable(limit: number, sort: InspectionSort = DEFAULT_INSPECTION_SORT) {
	const { result } = await renderRead(() => useInspectionTable(sort, limit));
	return result;
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

		await renderTable(10, sort);

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
