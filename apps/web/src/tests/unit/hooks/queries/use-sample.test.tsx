/** @vitest-environment jsdom */

/**
 * The sample map card's read, and what it calls the habitat.
 *
 * A sample is read through its inspection, and the inspection's habitat is a
 * second `left` join over an on-demand collection. The three answers the
 * projection gives for the habitat's name are the same three the inspection
 * card's read gives, and the third one, `null` for a row that has not arrived,
 * is what lets the card title the habitat by its id rather than with the comma
 * it drew before #998.
 */

import { beforeEach, describe, expect, it } from 'vitest';
import { useSample } from '../../../../hooks/queries/use-sample';
import { habitats } from '../../../../lib/collections/habitats';
import { inspections } from '../../../../lib/collections/inspections';
import { samples } from '../../../../lib/collections/samples';
import { habitatLabel } from '../../../../lib/coordinate-label';
import { installMemoryCollections, seedRows } from '../../lib/collections/memory-collections';
import { inspection, sample, UNSTREAMED_HABITAT_ID } from './larval-rows';
import { renderRead } from './read-harness';

beforeEach(() => {
	installMemoryCollections();
	seedRows(habitats, [
		{ id: 'h1', habitat_name: 'Alder catch basin', lat: 34.1, lng: -118.2 },
		{ id: 'h2', habitat_name: null, lat: 40.1, lng: -74.4 },
	]);
	seedRows(samples, [sample('s1')]);
});

async function readSample(id: string) {
	const { result } = await renderRead(() => useSample(id));
	const record = result.current.sample;
	expect(record, 'the hook returned no sample').toBeDefined();
	return record as NonNullable<typeof record>;
}

/** The habitat line the map card draws, mapped the way `-sample-map-card.tsx` maps it. */
function habitatLineOf(record: Awaited<ReturnType<typeof readSample>>): string {
	return habitatLabel(
		{
			habitatId: record.habitatId,
			habitatName: record.habitatName,
			lat: record.latitude,
			lng: record.longitude,
		},
		{ fallback: 'Ad-hoc sample' },
	);
}

describe('useSample', () => {
	it('names the habitat through the inspection', async () => {
		seedRows(inspections, [inspection('i1')]);

		const record = await readSample('s1');

		expect(record.inspectionDate).toBe('2026-08-12');
		expect(record.habitatName).toBe('Alder catch basin');
		expect(habitatLineOf(record)).toBe('Alder catch basin');
	});

	it('reads a habitat that has streamed with no name as its coordinates', async () => {
		seedRows(inspections, [inspection('i1', { habitat_id: 'h2' })]);

		const record = await readSample('s1');

		expect(record.habitatName).toBe('40.1, -74.4');
		expect(habitatLineOf(record)).toBe('40.1, -74.4');
	});

	it('reads a habitat whose row has not arrived as null, so the id arm runs', async () => {
		seedRows(inspections, [inspection('i1', { habitat_id: UNSTREAMED_HABITAT_ID })]);

		const record = await readSample('s1');

		expect(record.habitatId).toBe(UNSTREAMED_HABITAT_ID);
		expect(record.habitatName).toBeNull();
		expect(habitatLineOf(record)).toBe('Habitat 1a2b3c4d');
	});

	it('reads an inspection naming no habitat as null, so the fallback runs', async () => {
		seedRows(inspections, [inspection('i1', { habitat_id: null })]);

		const record = await readSample('s1');

		expect(record.habitatId).toBeNull();
		expect(record.habitatName).toBeNull();
		expect(habitatLineOf(record)).toBe('34.05213, -118.24368');
	});

	it('reads an inspection that has not arrived as no habitat and no centroid', async () => {
		// `inspection_id` is not nullable, so an unmatched inspection join only
		// ever means the row is still streaming. There is no habitat to guard on
		// either, and the sample reads as ad hoc until the inspection lands.
		const record = await readSample('s1');

		expect(record.inspectionDate).toBeNull();
		expect(record.habitatId).toBeNull();
		expect(record.habitatName).toBeNull();
		expect(habitatLineOf(record)).toBe('Ad-hoc sample');
	});
});
