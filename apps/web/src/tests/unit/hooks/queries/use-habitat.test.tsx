/** @vitest-environment jsdom */

/**
 * useHabitat over a Habitat whose type the client does not hold.
 *
 * An unmatched `left` join yields `undefined`, and the type name reads `null`
 * beside its id instead, so a card can tell a type it cannot name from a
 * Habitat with no type (#1535).
 */

import { beforeEach, describe, expect, it } from 'vitest';
import { useHabitat } from '../../../../hooks/queries/use-habitat';
import { habitats } from '../../../../lib/collections/habitats';
import { installMemoryCollections, seedRows } from '../../lib/collections/memory-collections';
import { readRecord } from './read-harness';

const GONE_TYPE = '66666666-6666-4666-8666-666666666666';

beforeEach(() => {
	installMemoryCollections();
	seedRows(habitats, [
		{
			id: 'h1',
			habitat_name: 'Alder catch basin',
			description: '',
			habitat_type_id: GONE_TYPE,
			address_id: null,
			is_active: true,
			is_inaccessible: false,
			lat: 34.1,
			lng: -118.2,
			geom_type: 'ST_Point',
		},
	]);
});

describe('useHabitat', () => {
	it('reads the type name as null when the type is not in the client', async () => {
		const habitat = await readRecord(() => {
			const read = useHabitat('h1');
			return { isReady: read.isReady, record: read.habitat };
		});

		expect(habitat).toMatchObject({ typeId: GONE_TYPE, typeName: null });
	});
});
