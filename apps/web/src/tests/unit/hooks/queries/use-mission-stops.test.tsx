/** @vitest-environment jsdom */

/**
 * Mission dispatch's read: a mission's stops in dispatch order.
 *
 * It replaced three queries, two of them sequential, with two `left` joins
 * inside one pipeline. `left` on both because a stop need not name a request and
 * need not sit at an address, and an `inner` join would take the stop off the
 * list rather than leave its label blank.
 */

import { beforeEach, describe, expect, it } from 'vitest';
import { useMissionStops } from '../../../../hooks/queries/use-mission-stops';
import { addresses } from '../../../../lib/collections/addresses';
import { mission_items } from '../../../../lib/collections/mission_items';
import { requested_control_actions } from '../../../../lib/collections/requested_control_actions';
import { installMemoryCollections, seedRows } from '../../lib/collections/memory-collections';
import { renderRead } from './read-harness';

const MISSION = '11111111-1111-4111-8111-111111111111';
const OTHER_MISSION = '22222222-2222-4222-8222-222222222222';

function stop(
	id: string,
	position: number,
	overrides: {
		readonly mission_id?: string;
		readonly requested_control_action_id?: string | null;
		readonly address_id?: string | null;
	} = {},
) {
	return {
		id,
		mission_id: MISSION,
		position,
		requested_control_action_id: 'r1',
		address_id: 'a1',
		lat: 38.58,
		lng: -121.49,
		geom_type: 'st_point',
		completed_at: null,
		skipped_at: null,
		skip_reason: null,
		updated_at: new Date('2026-08-04T15:00:00Z'),
		...overrides,
	};
}

beforeEach(() => {
	installMemoryCollections();
	seedRows(requested_control_actions, [
		{ id: 'r1', summary: 'Standing water behind the school', control_type: 'larvicide' },
	]);
	seedRows(addresses, [
		{
			id: 'a1',
			display_name: '12 Alder St',
			address_line_1: '12 Alder St',
			address_line_2: null,
			locality: 'Davis',
			region: 'CA',
			postal_code: '95616',
		},
	]);
});

describe('useMissionStops', () => {
	it('carries the request summary and the address through the joins', async () => {
		seedRows(mission_items, [stop('s1', 1)]);

		const { result } = await renderRead(() => useMissionStops(MISSION));

		expect(result.current.stops[0]?.requestSummary).toBe('Standing water behind the school');
		expect(result.current.stops[0]?.address.displayName).toBe('12 Alder St');
	});

	it('reads them in dispatch order rather than in the order they were added', async () => {
		seedRows(mission_items, [stop('s1', 3), stop('s2', 1), stop('s3', 2)]);

		const { result } = await renderRead(() => useMissionStops(MISSION));

		expect(result.current.stops.map((row) => row.id)).toEqual(['s2', 's3', 's1']);
	});

	it('keeps a stop that names no request, and reads its summary as null', async () => {
		// Guarded on the stop's own column, because a real request may have a null
		// summary and nullness alone could not tell that from an unmatched join.
		seedRows(mission_items, [stop('s1', 1, { requested_control_action_id: null })]);

		const { result } = await renderRead(() => useMissionStops(MISSION));

		expect(result.current.stops.map((row) => row.id)).toEqual(['s1']);
		expect(result.current.stops[0]?.requestSummary).toBeNull();
	});

	it('keeps a stop sited at no address', async () => {
		seedRows(mission_items, [stop('s1', 1, { address_id: null })]);

		const { result } = await renderRead(() => useMissionStops(MISSION));

		expect(result.current.stops.map((row) => row.id)).toEqual(['s1']);
	});

	it('answers about the mission it was asked about', async () => {
		seedRows(mission_items, [stop('s1', 1), stop('s2', 1, { mission_id: OTHER_MISSION })]);

		const { result } = await renderRead(() => useMissionStops(MISSION));

		expect(result.current.stops.map((row) => row.id)).toEqual(['s1']);
	});
});
