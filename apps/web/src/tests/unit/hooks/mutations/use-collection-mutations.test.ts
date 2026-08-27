/**
 * The stop id has to reach the endpoint, because it is the only thing that tells
 * the server this write is an execution rather than an ordinary record.
 *
 * This seam is where the feature can go quiet. The domain command, the server
 * handler, the migration and the optimistic row can all be correct and fully
 * covered, and the collection still lands with a null link and its stop still
 * pending — the server simply takes the non-execution branch, answers 201, and
 * sync reverts the optimistic completion a moment later. Nothing throws and
 * nothing below this layer can see it.
 *
 * `mutateCollection` derives its body from the mutation, and `commandRequestFor`
 * is tested for that in `packages/sync`. Neither of these goes that way: both
 * are multi-row commands, so they go through `commandTransaction`, which sends
 * the body it is handed. Those bodies are built here, which is why the
 * assertions are here.
 *
 * A collection reaches a stop two ways, and they are separate tests because they
 * are separate visits — the trap is set and emptied on one visit, or it was set
 * on an earlier one and this visit only empties it.
 *
 * See `docs/adr/0012-assignment-item-action-provenance.md`.
 */

import type { AdultCollection } from '@simmer-mosquito/sync';
import { describe, expect, it } from 'vitest';
import {
	stopCollectionRequestBody,
	stopCollectRequestBody,
} from '../../../../hooks/mutations/use-collection-mutations';

const ASSIGNMENT_ITEM = '11111111-1111-4111-8111-111111111111';
const TRAP = '44444444-4444-4444-8444-444444444444';

function collectionRow(overrides: Partial<AdultCollection> = {}): AdultCollection {
	return {
		id: '22222222-2222-4222-8222-222222222222',
		organization_id: '33333333-3333-4333-8333-333333333333',
		lat: 40.5,
		lng: -74.4,
		geom_type: 'point',
		trap_id: TRAP,
		collection_method_id: '55555555-5555-4555-8555-555555555555',
		collection_lure_id: null,
		address_id: null,
		collection_timing_mode: 'exact_timestamps',
		started_at: new Date('2026-08-17T16:00:00.000Z'),
		collected_at: new Date('2026-08-18T16:00:00.000Z'),
		collection_date: null,
		duration_amount: null,
		duration_unit_id: null,
		set_by_profile_id: '66666666-6666-4666-8666-666666666666',
		collected_by_profile_id: '66666666-6666-4666-8666-666666666666',
		set_assignment_item_id: ASSIGNMENT_ITEM,
		collected_assignment_item_id: ASSIGNMENT_ITEM,
		has_problem: false,
		is_zero_result: false,
		has_bycatch: false,
		metadata: null,
		created_by_profile_id: null,
		updated_by_profile_id: null,
		created_at: new Date('2026-08-18T00:00:00.000Z'),
		updated_at: new Date('2026-08-18T00:00:00.000Z'),
		...overrides,
	};
}

describe('stopCollectionRequestBody', () => {
	it('sends the assignment stop the collection was recorded from', () => {
		const body = stopCollectionRequestBody(collectionRow(), {
			assignmentItemId: ASSIGNMENT_ITEM,
			trapId: null,
		});

		expect(body.assignmentItemId).toBe(ASSIGNMENT_ITEM);
	});

	it('leaves the trap to the stop unless one is stated', () => {
		const body = stopCollectionRequestBody(collectionRow(), {
			assignmentItemId: ASSIGNMENT_ITEM,
			trapId: null,
		});

		// The stop already names a trap, and the writer falls back to that trap's own
		// method and lure. Sending the row's would be a second claim about the same
		// thing, and the two can disagree.
		expect(body.trap_id).toBeNull();
	});

	it('states the trap when the caller overrides the stop', () => {
		const body = stopCollectionRequestBody(collectionRow(), {
			assignmentItemId: ASSIGNMENT_ITEM,
			trapId: TRAP,
		});

		expect(body.trap_id).toBe(TRAP);
	});

	it('sends the whole timing, in either mode', () => {
		const exact = stopCollectionRequestBody(collectionRow(), {
			assignmentItemId: ASSIGNMENT_ITEM,
			trapId: null,
		});

		expect(exact.collection_timing_mode).toBe('exact_timestamps');
		expect(exact.started_at).toEqual(new Date('2026-08-17T16:00:00.000Z'));

		// The other mode dates the collection from a different pair of columns, and
		// the server rebuilds one whole `CollectionTiming` from whichever six
		// arrive — half of each is not a state the row can hold.
		const dated = stopCollectionRequestBody(
			collectionRow({
				collection_timing_mode: 'collection_date_duration',
				started_at: null,
				collected_at: null,
				collection_date: '2026-08-18',
				duration_amount: 24,
				duration_unit_id: '77777777-7777-4777-8777-777777777777',
			}),
			{ assignmentItemId: ASSIGNMENT_ITEM, trapId: null },
		);

		expect(dated.collection_date).toBe('2026-08-18');
		expect(dated.duration_amount).toBe(24);
		expect(dated.duration_unit_id).toBe('77777777-7777-4777-8777-777777777777');
	});

	it('drops the columns the server owns', () => {
		const body = stopCollectionRequestBody(collectionRow(), {
			assignmentItemId: ASSIGNMENT_ITEM,
			trapId: null,
		});

		// The centroid is snapshotted from the trap at commit and the stamps are the
		// server's own — an optimistic row carries them so the map can draw, but
		// sending them would be the client claiming to have written them.
		//
		// The two assignment columns are the sharper case: they are real columns on
		// this table, and a caller does not choose which one the stop lands in.
		// Setting a trap and emptying it are separate visits, so the command decides
		// — which is also why `assignmentItemId` above is camelCase.
		for (const column of [
			'lat',
			'lng',
			'geom_type',
			'organization_id',
			'set_assignment_item_id',
			'collected_assignment_item_id',
			'is_zero_result',
			'has_bycatch',
			'created_at',
			'updated_at',
			'created_by_profile_id',
			'updated_by_profile_id',
		]) {
			expect(body).not.toHaveProperty(column);
		}
	});

	it('carries the acknowledgements a refused attempt is answering', () => {
		const body = stopCollectionRequestBody(
			collectionRow(),
			{ assignmentItemId: ASSIGNMENT_ITEM, trapId: null },
			{ acknowledgedCompletedItemAdditionalRecord: true },
		);

		expect(body.acknowledgedCompletedItemAdditionalRecord).toBe(true);
	});
});

describe('stopCollectRequestBody', () => {
	const COLLECTED_AT = new Date('2026-08-18T16:00:00.000Z');

	it('sends the stop the second visit closes', () => {
		const body = stopCollectRequestBody({
			collectedAt: COLLECTED_AT,
			collectedByProfileId: '66666666-6666-4666-8666-666666666666',
			assignmentItemId: ASSIGNMENT_ITEM,
		});

		expect(body.assignmentItemId).toBe(ASSIGNMENT_ITEM);
	});

	it('restates nothing but when the trap was emptied and by whom', () => {
		const body = stopCollectRequestBody({
			collectedAt: COLLECTED_AT,
			collectedByProfileId: null,
			assignmentItemId: ASSIGNMENT_ITEM,
		});

		// The collection already exists — it was set on an earlier visit — so there
		// is no trap, no method and no timing to restate. Sending them would let a
		// second visit silently rewrite what the first one recorded.
		expect(Object.keys(body).sort()).toEqual([
			'assignmentItemId',
			'collected_at',
			'collected_by_profile_id',
		]);
		expect(body.collected_at).toEqual(COLLECTED_AT);
		expect(body.collected_by_profile_id).toBeNull();
	});

	it('carries the acknowledgements a refused attempt is answering', () => {
		const body = stopCollectRequestBody(
			{
				collectedAt: COLLECTED_AT,
				collectedByProfileId: null,
				assignmentItemId: ASSIGNMENT_ITEM,
			},
			{ acknowledgedCompletedItemAdditionalRecord: true },
		);

		expect(body.acknowledgedCompletedItemAdditionalRecord).toBe(true);
	});
});
