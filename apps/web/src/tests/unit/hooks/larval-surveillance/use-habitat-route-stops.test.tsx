/** @vitest-environment jsdom */

/**
 * A habitat Route's itinerary: its items joined onto `habitats` with `left`.
 *
 * The join is `left` so a stop whose Habitat has not streamed still draws, and
 * that is the case worth holding. An unmatched join reads every `habitat.*` as
 * `undefined`, `concat` over three of those answers `, `, and `coalesce` over an
 * absent description with a `''` fallback answers `''`. So before #1565 such a
 * stop was titled with a bare comma and offered an empty description that a save
 * would write over the Habitat's real one.
 */

import { beforeEach, describe, expect, it } from 'vitest';
import { useHabitatRouteStops } from '../../../../hooks/larval-surveillance/use-habitat-route-stops';
import { habitats } from '../../../../lib/collections/habitats';
import { route_items } from '../../../../lib/collections/route_items';
import { installMemoryCollections, seedRows } from '../../lib/collections/memory-collections';
import { renderRead } from '../queries/read-harness';

const ROUTE = 'r1';
const HABITAT = '1a2b3c4d-0000-4000-8000-000000000001';

const ITEM = {
	id: 'i1',
	route_id: ROUTE,
	entity_type: 'habitat',
	entity_id: HABITAT,
	position: 1,
	directions_to_next_item: null,
};

function habitat(overrides: {
	readonly habitat_name?: string | null;
	readonly description?: string;
}) {
	return {
		id: HABITAT,
		organization_id: 'org-1',
		habitat_name: 'Alder catch basin',
		description: 'Behind the pump station.',
		habitat_type_id: null,
		address_id: null,
		lat: 34.05,
		lng: -118.24,
		geom_type: 'ST_Point',
		is_active: true,
		is_inaccessible: false,
		...overrides,
	};
}

async function readStop() {
	const { result } = await renderRead(() => useHabitatRouteStops(ROUTE));
	await expect.poll(() => result.current.stops.length).toBe(1);
	const stop = result.current.stops[0];
	if (stop === undefined) throw new Error('the stop did not come back');
	return stop;
}

beforeEach(() => {
	installMemoryCollections();
});

describe('useHabitatRouteStops', () => {
	it('names a stop whose Habitat is not in the client by its id, with no description', async () => {
		seedRows(route_items, [ITEM]);

		const stop = await readStop();

		expect(stop).toMatchObject({
			name: 'Habitat 1a2b3c4d',
			description: null,
			isResolving: true,
		});
	});

	it('names a resolved Habitat with no name by its coordinates', async () => {
		seedRows(habitats, [habitat({ habitat_name: null })]);
		seedRows(route_items, [ITEM]);

		const stop = await readStop();

		expect(stop).toMatchObject({ name: '34.05, -118.24', isResolving: false });
	});

	it('reads a resolved Habitat with no description as empty', async () => {
		seedRows(habitats, [habitat({ description: '' })]);
		seedRows(route_items, [ITEM]);

		const stop = await readStop();

		expect(stop).toMatchObject({
			name: 'Alder catch basin',
			description: '',
			isResolving: false,
		});
	});
});
