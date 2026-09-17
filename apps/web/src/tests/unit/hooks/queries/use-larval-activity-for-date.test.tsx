/** @vitest-environment jsdom */

/**
 * The larval overview's day panel read, and what it calls each habitat.
 *
 * The predicate is an equality on the date, so the first case holds that a
 * neighbouring day stays out. The rest are the habitat name: the three answers
 * the projection gives, and the third, `null` for a habitat row that has not
 * arrived, is what lets the panel title the row by the habitat's id rather
 * than with the comma it drew before #998.
 */

import { beforeEach, describe, expect, it } from 'vitest';
import { inspectionHabitatLabel } from '../../../../hooks/queries/larval-activity-view';
import { useLarvalActivityForDate } from '../../../../hooks/queries/use-larval-activity-for-date';
import { habitat_types } from '../../../../lib/collections/habitat_types';
import { habitats } from '../../../../lib/collections/habitats';
import { inspections } from '../../../../lib/collections/inspections';
import { profiles } from '../../../../lib/collections/profiles';
import { installMemoryCollections, seedRows } from '../../lib/collections/memory-collections';
import { inspection, UNSTREAMED_HABITAT_ID } from './larval-rows';
import { renderRead } from './read-harness';

beforeEach(() => {
	installMemoryCollections();
	seedRows(habitats, [
		{ id: 'h1', habitat_name: 'Alder catch basin', lat: 34.1, lng: -118.2 },
		{ id: 'h2', habitat_name: null, lat: 40.1, lng: -74.4 },
	]);
	seedRows(habitat_types, [{ id: 't1', name: 'Catch basin' }]);
	seedRows(profiles, [{ id: 'p1', display_name: 'Rosa Lam' }]);
});

/** The one row the hook returned for 12 August, labelled the way the panel labels it. */
async function readOne() {
	const { result } = await renderRead(() => useLarvalActivityForDate('2026-08-12'));
	const row = result.current.rows[0];
	expect(row, 'the hook returned no row').toBeDefined();
	const found = row as NonNullable<typeof row>;
	return { label: inspectionHabitatLabel(found), row: found };
}

describe('useLarvalActivityForDate', () => {
	it('reads the one day and nothing beside it', async () => {
		seedRows(inspections, [
			inspection('day-before', { inspection_date: '2026-08-11' }),
			inspection('the-day', { inspection_date: '2026-08-12' }),
			inspection('day-after', { inspection_date: '2026-08-13' }),
		]);

		const { result } = await renderRead(() => useLarvalActivityForDate('2026-08-12'));

		expect(result.current.rows.map((row) => row.id)).toEqual(['the-day']);
	});

	it('names the habitat through the join', async () => {
		seedRows(inspections, [inspection('i1')]);

		const { label, row } = await readOne();

		expect(row.habitatName).toBe('Alder catch basin');
		expect(label).toBe('Alder catch basin');
	});

	it('reads a habitat that has streamed with no name as its coordinates', async () => {
		seedRows(inspections, [inspection('i1', { habitat_id: 'h2' })]);

		const { label, row } = await readOne();

		expect(row.habitatName).toBe('40.1, -74.4');
		expect(label).toBe('40.1, -74.4');
	});

	it('reads a habitat whose row has not arrived as null, so the id arm runs', async () => {
		seedRows(inspections, [inspection('i1', { habitat_id: UNSTREAMED_HABITAT_ID })]);

		const { label, row } = await readOne();

		expect(row.habitatName).toBeNull();
		expect(label).toBe('Habitat 1a2b3c4d');
	});

	it('reads an inspection naming no habitat as null, so the fallback runs', async () => {
		seedRows(inspections, [inspection('i1', { habitat_id: null })]);

		const { label, row } = await readOne();

		expect(row.habitatName).toBeNull();
		expect(label).toBe('34.05213, -118.24368');
	});
});
