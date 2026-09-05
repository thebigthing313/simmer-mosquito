/** @vitest-environment jsdom */

/**
 * Field-work support's read: the Routes one record is a stop on.
 *
 * `route_items` joined to the catalog, so a line arrives named rather than as a
 * route id for the caller to look up. Three things are worth holding: the join
 * being `inner`, because the line is a link and an unnamed one offers a page
 * that is not there; the predicate taking both halves of the polymorphic key,
 * since a Habitat and a Trap can share neither id nor row; and the name order.
 */

import { beforeEach, describe, expect, it } from 'vitest';
import { useRecordRoutes } from '../../../../hooks/queries/use-record-routes';
import { route_items } from '../../../../lib/collections/route_items';
import { routes } from '../../../../lib/collections/routes';
import { installMemoryCollections, seedRows } from '../../lib/collections/memory-collections';
import { renderRead } from './read-harness';

const HABITAT = '11111111-1111-4111-8111-111111111111';
const OTHER = '22222222-2222-4222-8222-222222222222';

function route(id: string, name: string) {
	return { id, route_name: name, route_type: 'habitat' };
}

function stop(
	id: string,
	routeId: string,
	position: number,
	entityId = HABITAT,
	entityType = 'habitat',
) {
	return { id, route_id: routeId, entity_type: entityType, entity_id: entityId, position };
}

beforeEach(() => {
	installMemoryCollections();
});

describe('useRecordRoutes', () => {
	it('names the Route through the join', async () => {
		seedRows(routes, [route('r1', 'Zone 3')]);
		seedRows(route_items, [stop('i1', 'r1', 4)]);

		const { result } = await renderRead(() => useRecordRoutes({ type: 'habitat', id: HABITAT }));

		expect(result.current.routes).toEqual([
			expect.objectContaining({
				routeItemId: 'i1',
				routeId: 'r1',
				routeName: 'Zone 3',
				position: 4,
			}),
		]);
		expect(result.current.isReady).toBe(true);
	});

	it('drops a stop whose Route it does not hold', async () => {
		// The `'inner'` third argument is what does this. Without it `.join()` in
		// `@tanstack/db` defaults to `left`, the unmatched stop is emitted, and the
		// `coalesce` gives it an empty name, which the detail page draws as a link
		// to a Route that is not there. The `coalesce` stays because the builder
		// types a joined column as possibly absent whatever the join kind, so this
		// is the assertion that says it is unreachable.
		seedRows(routes, [route('r1', 'Zone 3')]);
		seedRows(route_items, [stop('i1', 'r1', 4), stop('i2', 'not-synced', 1)]);

		const { result } = await renderRead(() => useRecordRoutes({ type: 'habitat', id: HABITAT }));

		expect(result.current.routes.map((row) => row.routeName)).toEqual(['Zone 3']);
	});

	it('reads them in name order rather than by stop position', async () => {
		seedRows(routes, [route('r1', 'Zephyr'), route('r2', 'Alder'), route('r3', 'Meadow')]);
		seedRows(route_items, [stop('i1', 'r1', 1), stop('i2', 'r2', 2), stop('i3', 'r3', 3)]);

		const { result } = await renderRead(() => useRecordRoutes({ type: 'habitat', id: HABITAT }));

		expect(result.current.routes.map((row) => row.routeName)).toEqual([
			'Alder',
			'Meadow',
			'Zephyr',
		]);
	});

	it('answers about one record, and about one kind of record', async () => {
		// `entity_id` is a uuid, so the id alone would very nearly do. The type is
		// in the predicate because a Route holds one kind of stop and a caller
		// asking about a Trap should not be handed a Habitat's Routes.
		seedRows(routes, [route('r1', 'Zone 3'), route('r2', 'Zone 4'), route('r3', 'Zone 5')]);
		seedRows(route_items, [
			stop('i1', 'r1', 1),
			stop('i2', 'r2', 1, OTHER),
			stop('i3', 'r3', 1, HABITAT, 'trap'),
		]);

		const { result } = await renderRead(() => useRecordRoutes({ type: 'habitat', id: HABITAT }));

		expect(result.current.routes.map((row) => row.routeName)).toEqual(['Zone 3']);
	});
});
