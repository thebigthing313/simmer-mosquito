/** @vitest-environment jsdom */

/**
 * Foundation's read: the taxonomy as rows.
 *
 * No join, because the taxonomy is the catalog everything else joins to. What
 * this holds is the ordering and the projection, in particular the epithet,
 * which is carried for one reason: specimens that were never keyed out are
 * recorded against a placeholder taxon, and a species breakdown that fails to
 * recognise it reads as the most abundant species in the county.
 */

import { beforeEach, describe, expect, it } from 'vitest';
import { useSpeciesCatalog } from '../../../../hooks/queries/use-species-catalog';
import { species } from '../../../../lib/collections/species';
import { installMemoryCollections, seedRows } from '../../lib/collections/memory-collections';
import { plain, renderRead } from './read-harness';

function taxon(id: string, displayName: string, epithet: string) {
	return { id, display_name: displayName, epithet };
}

beforeEach(() => {
	installMemoryCollections();
});

describe('useSpeciesCatalog', () => {
	it('reads a taxon down to the three columns a list needs', async () => {
		seedRows(species, [taxon('s1', 'Culex tarsalis', 'tarsalis')]);

		const { result } = await renderRead(useSpeciesCatalog);

		expect(result.current.map(plain)).toEqual([
			{ id: 's1', displayName: 'Culex tarsalis', epithet: 'tarsalis' },
		]);
	});

	it('reads in display-name order rather than in arrival order', async () => {
		seedRows(species, [
			taxon('s1', 'Culex tarsalis', 'tarsalis'),
			taxon('s2', 'Aedes vexans', 'vexans'),
			taxon('s3', 'Culiseta inornata', 'inornata'),
		]);

		const { result } = await renderRead(useSpeciesCatalog);

		expect(result.current.map((row) => row.displayName)).toEqual([
			'Aedes vexans',
			'Culex tarsalis',
			'Culiseta inornata',
		]);
	});

	it('keeps the placeholder taxon, which a breakdown has to recognise', async () => {
		seedRows(species, [
			taxon('s1', 'Culex tarsalis', 'tarsalis'),
			taxon('s2', 'Unidentified mosquito', 'unidentified'),
		]);

		const { result } = await renderRead(useSpeciesCatalog);

		expect(result.current.map((row) => row.epithet)).toContain('unidentified');
	});

	it('refuses a write, because this app only reads the global taxonomy', async () => {
		// `mutations: false` in the collection module leaves it with no handlers at
		// all, so a write is refused here rather than travelling to a server that
		// would refuse it. The memory source declares them the same way.
		expect(() =>
			species().insert({
				...taxon('s9', 'Anopheles freeborni', 'freeborni'),
				genus_id: null,
				common_name: null,
				created_at: new Date(),
				updated_at: new Date(),
			}),
		).toThrow();
	});
});
