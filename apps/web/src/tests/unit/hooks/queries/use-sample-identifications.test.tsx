/** @vitest-environment jsdom */

/**
 * Larval surveillance's read: what was found in one Sample.
 *
 * The counts come off `sample_species` and the names off the taxonomy, joined
 * rather than looked up, and the order is by count rather than by name because
 * the question a technician asks of the list is what dominated the jar.
 */

import { beforeEach, describe, expect, it } from 'vitest';
import { useSampleIdentifications } from '../../../../hooks/queries/use-sample-identifications';
import { sample_species } from '../../../../lib/collections/sample_species';
import { species } from '../../../../lib/collections/species';
import { installMemoryCollections, seedRows } from '../../lib/collections/memory-collections';
import { renderRead } from './read-harness';

const SAMPLE = '11111111-1111-4111-8111-111111111111';
const OTHER_SAMPLE = '22222222-2222-4222-8222-222222222222';

function identification(id: string, speciesId: string, count: number, sampleId = SAMPLE) {
	return {
		id,
		sample_id: sampleId,
		species_id: speciesId,
		larvae_count: count,
		identified_at: new Date('2026-08-04T15:00:00Z'),
	};
}

beforeEach(() => {
	installMemoryCollections();
	seedRows(species, [
		{ id: 's1', display_name: 'Culex tarsalis' },
		{ id: 's2', display_name: 'Aedes vexans' },
	]);
});

describe('useSampleIdentifications', () => {
	it('carries the species name with the count', async () => {
		seedRows(sample_species, [identification('i1', 's1', 12)]);

		const { result } = await renderRead(() => useSampleIdentifications(SAMPLE));

		expect(result.current.identifications).toEqual([
			expect.objectContaining({ speciesId: 's1', speciesName: 'Culex tarsalis', larvaeCount: 12 }),
		]);
	});

	it('reads biggest count first, not the order they were entered', async () => {
		seedRows(sample_species, [
			identification('i1', 's1', 3),
			identification('i2', 's2', 40),
			identification('i3', 's1', 12),
		]);

		const { result } = await renderRead(() => useSampleIdentifications(SAMPLE));

		expect(result.current.identifications.map((row) => row.larvaeCount)).toEqual([40, 12, 3]);
	});

	it('drops an identification whose taxonomy row it does not hold', async () => {
		// The `'inner'` third argument is what does this. Without it `.join()` in
		// `@tanstack/db` defaults to `left`, the unmatched row is emitted, and the
		// `coalesce` labels it "Unknown species" beside a real count. The
		// `coalesce` stays because the builder types a joined column as possibly
		// absent whatever the join kind, so this is the assertion that says it is
		// unreachable.
		seedRows(sample_species, [identification('i1', 's1', 12), identification('i2', 'gone', 40)]);

		const { result } = await renderRead(() => useSampleIdentifications(SAMPLE));

		expect(result.current.identifications.map((row) => row.speciesName)).toEqual([
			'Culex tarsalis',
		]);
	});

	it('answers about the sample it was asked about', async () => {
		seedRows(sample_species, [
			identification('i1', 's1', 12),
			identification('i2', 's2', 99, OTHER_SAMPLE),
		]);

		const { result } = await renderRead(() => useSampleIdentifications(SAMPLE));

		expect(result.current.identifications.map((row) => row.larvaeCount)).toEqual([12]);
	});

	it('is empty and ready for a sample awaiting identification', async () => {
		// Empty is a lifecycle here rather than a gap, and the two are told apart by
		// `isReady`. A caller reading only the array cannot tell them apart at all.
		seedRows(sample_species, []);

		const { result } = await renderRead(() => useSampleIdentifications(SAMPLE));

		expect(result.current.identifications).toEqual([]);
		expect(result.current.isReady).toBe(true);
	});
});
