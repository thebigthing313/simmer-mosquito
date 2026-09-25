/** @vitest-environment jsdom */

/**
 * The inspection map card's read, and what it calls the habitat.
 *
 * `habitats` syncs on demand, so between the inspection arriving and its
 * habitat arriving the `left` join is unmatched. The projection has three
 * answers to give and the cases below hold all three: the habitat's name when
 * the row carries one, its coordinates when it carries none, and `null` when
 * there is no row, which is what lets `habitatLabel` read the id arm. Before
 * #998 the third answer was the non-empty string `, `, the separator of a
 * `concat` run over absent columns, and the card was titled with a comma.
 */

import { beforeEach, describe, expect, it } from 'vitest';
import { useInspection } from '../../../../hooks/queries/use-inspection';
import { habitat_types } from '../../../../lib/collections/habitat_types';
import { habitats } from '../../../../lib/collections/habitats';
import { inspections } from '../../../../lib/collections/inspections';
import { profiles } from '../../../../lib/collections/profiles';
import { habitatLabel } from '../../../../lib/coordinate-label';
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

async function readInspection(id: string) {
	const { result } = await renderRead(() => useInspection(id));
	const record = result.current.inspection;
	expect(record, 'the hook returned no inspection').toBeDefined();
	return record as NonNullable<typeof record>;
}

/** The title the map card draws, mapped the way `-inspection-map-card.tsx` maps it. */
function titleOf(record: Awaited<ReturnType<typeof readInspection>>): string {
	return habitatLabel(
		{
			habitatId: record.habitatId,
			habitatName: record.habitatName,
			lat: record.latitude,
			lng: record.longitude,
		},
		{ fallback: 'One-off inspection' },
	);
}

describe('useInspection', () => {
	it('names the habitat, the type and the inspector through the joins', async () => {
		seedRows(inspections, [inspection('i1')]);

		const record = await readInspection('i1');

		expect(record.habitatName).toBe('Alder catch basin');
		expect(record.typeName).toBe('Catch basin');
		expect(record.inspectedByName).toBe('Rosa Lam');
		expect(titleOf(record)).toBe('Alder catch basin');
	});

	it('reads a habitat that has streamed with no name as its coordinates', async () => {
		seedRows(inspections, [inspection('i1', { habitat_id: 'h2' })]);

		const record = await readInspection('i1');

		expect(record.habitatName).toBe('40.1, -74.4');
		expect(titleOf(record)).toBe('40.1, -74.4');
	});

	it('reads a habitat whose row has not arrived as null, so the id arm runs', async () => {
		seedRows(inspections, [inspection('i1', { habitat_id: UNSTREAMED_HABITAT_ID })]);

		const record = await readInspection('i1');

		expect(record.habitatId).toBe(UNSTREAMED_HABITAT_ID);
		expect(record.habitatName).toBeNull();
		expect(titleOf(record)).toBe('Habitat 1a2b3c4d');
	});

	it('reads an inspection naming no habitat as null, so the fallback runs', async () => {
		seedRows(inspections, [inspection('i1', { habitat_id: null, habitat_type_id: null })]);

		const record = await readInspection('i1');

		expect(record.habitatId).toBeNull();
		expect(record.habitatName).toBeNull();
		expect(titleOf(record)).toBe('34.05213, -118.24368');
	});
});
