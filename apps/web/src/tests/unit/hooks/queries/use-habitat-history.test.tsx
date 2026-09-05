/** @vitest-environment jsdom */

/**
 * The habitat History card's two newest tabs: requests for control raised at a
 * site, and source reductions carried out there.
 *
 * The request form has always promised a linked request "shows on that
 * habitat's history", and until #553 nothing on the page read
 * `requested_control_actions.habitat_id` at all. What is worth holding is the
 * predicate reading that column rather than one of the other three context
 * links a request can carry, and resolved requests staying in the result: the
 * mission picker filters them out because it is asking what is still unplanned,
 * and a history card asking what happened must not copy that.
 *
 * `source_reductions.habitat_id` is the same column on the sibling table, and
 * the case worth holding there is the absence of a filter. The table has no
 * lifecycle column, so a row that reaches the collection is work that was done,
 * and a predicate on anything but the habitat link would drop history the card
 * exists to show.
 */

import { beforeEach, describe, expect, it } from 'vitest';
import { useHabitatHistory } from '../../../../hooks/queries/use-habitat-history';
import { requested_control_actions } from '../../../../lib/collections/requested_control_actions';
import { source_reductions } from '../../../../lib/collections/source_reductions';
import { installMemoryCollections, seedRows } from '../../lib/collections/memory-collections';
import { plain, renderRead } from './read-harness';

const HABITAT = '11111111-1111-4111-8111-111111111111';
const OTHER_HABITAT = '22222222-2222-4222-8222-222222222222';
const PROFILE = '33333333-3333-4333-8333-333333333333';
const METHOD = '44444444-4444-4444-8444-444444444444';
const UNIT = '55555555-5555-4555-8555-555555555555';

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

function sourceReduction(
	id: string,
	sourceReductionDate: string,
	overrides: Record<string, unknown> = {},
): Record<string, unknown> & { readonly id: string } {
	return {
		id,
		habitat_id: HABITAT,
		address_id: null,
		inspection_id: null,
		requested_control_action_id: null,
		source_reduction_date: sourceReductionDate,
		source_reduction_method_id: METHOD,
		technician_profile_id: PROFILE,
		sources_eliminated_amount: 4,
		sources_eliminated_unit_id: UNIT,
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

describe('useHabitatHistory source reductions', () => {
	it('reads the habitat link the source reduction carries', async () => {
		seedRows(source_reductions, [
			sourceReduction('s1', '2026-08-01'),
			sourceReduction('s2', '2026-08-02', { habitat_id: OTHER_HABITAT }),
			sourceReduction('s3', '2026-08-03', { habitat_id: null }),
		]);

		const { result } = await renderRead(() => useHabitatHistory(HABITAT));

		expect(result.current.sourceReductions.map(plain)).toEqual([
			{
				id: 's1',
				sourceReductionDate: '2026-08-01',
				technicianProfileId: PROFILE,
				sourceReductionMethodId: METHOD,
				sourcesEliminatedAmount: 4,
				sourcesEliminatedUnitId: UNIT,
			},
		]);
	});

	it('reads them most recent first', async () => {
		seedRows(source_reductions, [
			sourceReduction('older', '2026-07-04'),
			sourceReduction('newest', '2026-09-01'),
			sourceReduction('middle', '2026-08-12'),
		]);

		const { result } = await renderRead(() => useHabitatHistory(HABITAT));

		expect(result.current.sourceReductions.map((row) => row.id)).toEqual([
			'newest',
			'middle',
			'older',
		]);
	});

	/**
	 * The trap #553 named, on the sibling table. A source reduction carries
	 * `inspection_id`, `requested_control_action_id` and `mission_item_id`, and
	 * every one of them is null on work somebody logged straight against the
	 * site. A predicate borrowed from a hook asking how work was dispatched would
	 * empty this tab of exactly the rows a crew lead came to see.
	 */
	it('keeps work logged with no inspection, request or mission behind it', async () => {
		seedRows(source_reductions, [
			sourceReduction('standalone', '2026-08-02', { technician_profile_id: null }),
			sourceReduction('from-a-request', '2026-08-01', {
				requested_control_action_id: '66666666-6666-4666-8666-666666666666',
				inspection_id: '77777777-7777-4777-8777-777777777777',
			}),
		]);

		const { result } = await renderRead(() => useHabitatHistory(HABITAT));

		expect(result.current.sourceReductions.map((row) => [row.id, row.technicianProfileId])).toEqual(
			[
				['standalone', null],
				['from-a-request', PROFILE],
			],
		);
	});

	it('settles the card even with no source reduction at the habitat', async () => {
		const { result } = await renderRead(() => useHabitatHistory(HABITAT));

		expect(result.current.sourceReductions).toEqual([]);
		expect(result.current.isReady).toBe(true);
		expect(result.current.isSourceReductionsError).toBe(false);
	});
});
