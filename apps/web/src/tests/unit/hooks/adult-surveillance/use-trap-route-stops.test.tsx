/** @vitest-environment jsdom */

/**
 * A Trap Route's itinerary: its items joined onto `traps` with `left`.
 *
 * The join is `left` so a stop whose Trap has not streamed still draws. Before
 * #1600 such a stop read `isActive: true` out of a `coalesce` default, so it
 * drew as an active stop before anything was known about the Trap.
 */

import { beforeEach, describe, expect, it } from 'vitest';
import { useTrapRouteStops } from '../../../../hooks/adult-surveillance/use-trap-route-stops';
import { route_items } from '../../../../lib/collections/route_items';
import { traps } from '../../../../lib/collections/traps';
import { installMemoryCollections, seedRows } from '../../lib/collections/memory-collections';
import { renderRead } from '../queries/read-harness';

const ROUTE = 'r1';
const TRAP = '5e6f7a8b-0000-4000-8000-000000000001';

const ITEM = {
	id: 'i1',
	route_id: ROUTE,
	entity_type: 'trap',
	entity_id: TRAP,
	position: 1,
	directions_to_next_item: null,
};

function trap(overrides: { readonly is_active?: boolean }) {
	return {
		id: TRAP,
		trap_code: 'A-1',
		trap_name: null,
		lat: 34.05,
		lng: -118.24,
		is_active: true,
		...overrides,
	};
}

async function readRoute() {
	const { result } = await renderRead(() => useTrapRouteStops(ROUTE));
	await expect.poll(() => result.current.stops.length).toBe(1);
	return result.current;
}

beforeEach(() => {
	installMemoryCollections();
});

describe('useTrapRouteStops', () => {
	it('carries no status on a stop whose Trap is not in the client, and puts nothing on the map', async () => {
		seedRows(route_items, [ITEM]);

		const { stops, features } = await readRoute();

		expect(stops[0]).toMatchObject({ isResolving: true, hasLocation: false });
		expect(stops[0]).not.toHaveProperty('isActive');
		expect(features).toEqual([]);
	});

	it("reads a resolved Trap's status off its row, and draws its pin in that tone", async () => {
		seedRows(traps, [trap({ is_active: false })]);
		seedRows(route_items, [ITEM]);

		const { stops, features } = await readRoute();

		expect(stops[0]).toMatchObject({ isResolving: false, isActive: false, name: 'A-1' });
		expect(features).toMatchObject([{ id: 'i1', ordinal: 1, tone: 'inactive' }]);
	});
});
