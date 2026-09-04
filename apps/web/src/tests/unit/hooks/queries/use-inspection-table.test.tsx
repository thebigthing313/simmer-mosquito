/** @vitest-environment jsdom */

/**
 * The inspections table's read.
 *
 * Two things are worth holding here. The order is the whole reason the window
 * works: it is by inspection date and then by `created_at`, both columns of
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
import { useInspectionTable } from '../../../../hooks/queries/use-inspection-table';
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

async function renderTable(limit: number) {
	const { result } = await renderRead(() => useInspectionTable(limit));
	return result;
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

	it('pages the window lazily rather than loading every inspection', async () => {
		/*
		 * The failure this catches is silent. `orderBy` with `limit` pages by
		 * cursor only while the sort key is indexed on the collection being
		 * windowed; without the index the compiler logs one warning and loads the
		 * whole filtered set, which on a real agency's history is the hang this
		 * surface exists to avoid. Right rows, right order, nothing thrown. So the
		 * warning is the assertion.
		 */
		const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
		seedRows(inspections, [inspection('i1')]);

		await renderTable(10);

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
});

function siteLabelOf(row: InspectionTableRow | undefined): string {
	expect(row, 'the hook returned no row to label').toBeDefined();
	return inspectionSiteLabel(row as InspectionTableRow);
}
