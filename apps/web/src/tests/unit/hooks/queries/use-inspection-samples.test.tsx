/** @vitest-environment jsdom */

/**
 * The samples an Inspection's detail page lists, with the species identified in
 * each.
 *
 * A species count names its taxon by id. The page used to resolve each chip
 * through a roster read behind a `<Suspense>` (#874); the include joins the
 * species catalog now, so the name arrives on the count. A taxon the client
 * does not hold reads as `null` and the count stays, which is the `left` join.
 */

import { beforeEach, describe, expect, it } from 'vitest';
import { useInspectionSamples } from '../../../../hooks/queries/use-inspection-samples';
import { sample_species } from '../../../../lib/collections/sample_species';
import { samples } from '../../../../lib/collections/samples';
import { species } from '../../../../lib/collections/species';
import { installMemoryCollections, seedRows } from '../../lib/collections/memory-collections';
import { renderRead } from './read-harness';

const INSPECTION = '11111111-1111-4111-8111-111111111111';
const SPECIES = '22222222-2222-4222-8222-222222222222';
const MISSING = '99999999-9999-4999-8999-999999999999';

beforeEach(() => {
	installMemoryCollections();
	seedRows(species, [{ id: SPECIES, display_name: 'Culex pipiens' }]);
	seedRows(samples, [
		{
			id: 's1',
			inspection_id: INSPECTION,
			display_name: 'Vial 1',
			is_zero_larvae: false,
			has_non_mosquito: false,
			unidentifiable_reason: null,
			created_at: new Date('2026-08-12T10:00:00.000Z'),
		},
	]);
});

async function readSpecies() {
	const { result } = await renderRead(() => useInspectionSamples(INSPECTION));
	const [sample] = result.current.samples;
	expect(sample, 'the hook returned no sample').toBeDefined();
	return (sample as NonNullable<typeof sample>).species;
}

describe('useInspectionSamples', () => {
	it('names the species on each count', async () => {
		seedRows(sample_species, [{ id: 'c1', sample_id: 's1', species_id: SPECIES, larvae_count: 7 }]);

		expect(await readSpecies()).toEqual([
			expect.objectContaining({ id: 'c1', speciesName: 'Culex pipiens', larvaeCount: 7 }),
		]);
	});

	it('keeps a count whose species is not in the client, with a null name', async () => {
		seedRows(sample_species, [{ id: 'c1', sample_id: 's1', species_id: MISSING, larvae_count: 3 }]);

		expect(await readSpecies()).toEqual([
			expect.objectContaining({ id: 'c1', speciesName: null, larvaeCount: 3 }),
		]);
	});
});
