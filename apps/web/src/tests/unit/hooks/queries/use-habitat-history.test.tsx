/** @vitest-environment jsdom */

/**
 * The habitat History card's fourth tab: requests for control raised at a site.
 *
 * The request form has always promised a linked request "shows on that
 * habitat's history", and until now nothing on the page read
 * `requested_control_actions.habitat_id` at all. What is worth holding is the
 * predicate reading that column rather than one of the other three context
 * links a request can carry, and resolved requests staying in the result: the
 * mission picker filters them out because it is asking what is still unplanned,
 * and a history card asking what happened must not copy that.
 */

import { beforeEach, describe, expect, it } from 'vitest';
import { useHabitatHistory } from '../../../../hooks/queries/use-habitat-history';
import { requested_control_actions } from '../../../../lib/collections/requested_control_actions';
import { installMemoryCollections, seedRows } from '../../lib/collections/memory-collections';
import { plain, renderRead } from './read-harness';

const HABITAT = '11111111-1111-4111-8111-111111111111';
const OTHER_HABITAT = '22222222-2222-4222-8222-222222222222';
const PROFILE = '33333333-3333-4333-8333-333333333333';

function request(
	id: string,
	requestedAt: string,
	overrides: Record<string, unknown> = {},
): Record<string, unknown> & { readonly id: string } {
	return {
		id,
		habitat_id: HABITAT,
		inspection_id: null,
		collection_id: null,
		control_type: 'application',
		summary: null,
		requested_by_profile_id: PROFILE,
		requested_at: new Date(requestedAt),
		resolved_at: null,
		...overrides,
	};
}

beforeEach(() => {
	installMemoryCollections();
});

describe('useHabitatHistory requests', () => {
	it('reads the habitat link the request carries', async () => {
		seedRows(requested_control_actions, [
			request('r1', '2026-08-01T10:00:00.000Z', { summary: 'Standing water behind the depot' }),
			request('r2', '2026-08-02T10:00:00.000Z', { habitat_id: OTHER_HABITAT }),
			request('r3', '2026-08-03T10:00:00.000Z', { habitat_id: null }),
		]);

		const { result } = await renderRead(() => useHabitatHistory(HABITAT));

		expect(result.current.requests.map(plain)).toEqual([
			{
				id: 'r1',
				requestedAt: new Date('2026-08-01T10:00:00.000Z'),
				requestedByProfileId: PROFILE,
				controlType: 'application',
				summary: 'Standing water behind the depot',
				resolvedAt: null,
			},
		]);
	});

	it('reads them most recently raised first', async () => {
		seedRows(requested_control_actions, [
			request('older', '2026-07-04T08:00:00.000Z'),
			request('newest', '2026-09-01T08:00:00.000Z'),
			request('middle', '2026-08-12T08:00:00.000Z'),
		]);

		const { result } = await renderRead(() => useHabitatHistory(HABITAT));

		expect(result.current.requests.map((row) => row.id)).toEqual(['newest', 'middle', 'older']);
	});

	it('keeps a resolved request, and says which one it is', async () => {
		seedRows(requested_control_actions, [
			request('open', '2026-08-02T08:00:00.000Z'),
			request('done', '2026-08-01T08:00:00.000Z', {
				control_type: 'source_reduction',
				resolved_at: new Date('2026-08-05T08:00:00.000Z'),
			}),
		]);

		const { result } = await renderRead(() => useHabitatHistory(HABITAT));

		expect(
			result.current.requests.map((row) => [row.id, row.controlType, row.resolvedAt !== null]),
		).toEqual([
			['open', 'application', false],
			['done', 'source_reduction', true],
		]);
	});

	it('settles the card even with no request at the habitat', async () => {
		const { result } = await renderRead(() => useHabitatHistory(HABITAT));

		expect(result.current.requests).toEqual([]);
		expect(result.current.isReady).toBe(true);
		expect(result.current.isRequestsError).toBe(false);
	});
});
