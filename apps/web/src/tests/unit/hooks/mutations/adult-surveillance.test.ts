/** @vitest-environment jsdom */

/**
 * What an adult write dispatches: traps, collections and species counts.
 *
 * `trapUpdatePlan` and the two hand-built stop bodies are tested on their own
 * beside this file. What is here is the part between them and the wire: which
 * command the hook named, whether the point rode along, and which of the two
 * seams the write went down. A stop recording that dispatches to a collection
 * instead of posting leaves its stop open behind a 201, and nothing under this
 * layer can see it.
 *
 * The three writes that post are asserted on the wire; everything else is
 * asserted at the handoff. See `dispatch-harness.ts` for why the two are
 * different.
 */

import { renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type {
	CollectionFields,
	CollectionTiming,
} from '../../../../hooks/mutations/use-collection-mutations';
import type { TrapFields } from '../../../../hooks/mutations/use-trap-mutations';
import { installMemoryCollections, seedRows } from '../../lib/collections/memory-collections';

const ORGANIZATION = '11111111-1111-4111-8111-111111111111';
const PROFILE = '22222222-2222-4222-8222-222222222222';
const RECORD = '33333333-3333-4333-8333-333333333333';
const TRAP = '44444444-4444-4444-8444-444444444444';
const STOP = '55555555-5555-4555-8555-555555555555';
const METHOD = '66666666-6666-4666-8666-666666666666';
const SPECIES = '77777777-7777-4777-8777-777777777777';
const UNIT = '88888888-8888-4888-8888-888888888888';

vi.mock('../../../../lib/collections/mutate', async () => {
	const { recordDispatch } = await import('./dispatch-harness');
	return { mutateCollection: recordDispatch };
});
vi.mock('../../../../hooks/use-auth-snapshot', () => ({
	useAuthSnapshot: () => ({
		authenticated: true,
		localIdentity: { organizationId: ORGANIZATION, profileId: PROFILE },
	}),
}));

const {
	commandUrl,
	dispatches,
	firstAttempt,
	lastChanges,
	lastIntents,
	lastRequest,
	lastWrite,
	requests,
	resetDispatches,
	stubApi,
} = await import('./dispatch-harness');
const {
	COLLECTION_DELETE_REFUSALS,
	COLLECTION_ZERO_RESULT_REFUSALS,
	STOP_RECORD_REFUSALS,
	TRAP_DELETE_REFUSALS,
	TRAP_SAVE_REFUSALS,
} = await import('../../../../lib/acknowledgement-copy');
const { assignment_items } = await import('../../../../lib/collections/assignment_items');
const { collections } = await import('../../../../lib/collections/collections');
const { useTrapMutations } = await import('../../../../hooks/mutations/use-trap-mutations');
const { useCollectionMutations } = await import(
	'../../../../hooks/mutations/use-collection-mutations'
);
const { useCollectionSpeciesMutations } = await import(
	'../../../../hooks/mutations/use-collection-species-mutations'
);

const SHAPE = { type: 'Point', coordinates: [-121.49, 38.58] } as const;
const CENTROID = { lat: 38.58, lng: -121.49, geomType: 'st_point' };

beforeEach(() => {
	installMemoryCollections();
	resetDispatches();
	stubApi();
});

afterEach(() => {
	vi.unstubAllGlobals();
});

function trapFields(overrides: Partial<TrapFields> = {}): TrapFields {
	return {
		trapName: 'North Levee',
		trapCode: 'NL-1',
		description: null,
		collectionMethodId: METHOD,
		collectionLureId: null,
		addressId: null,
		isActive: true,
		...overrides,
	};
}

describe('a trap write', () => {
	it('names the create and carries the drawn point beside the row', async () => {
		const { result } = renderHook(() => useTrapMutations());

		await result.current.create(trapFields(), SHAPE, CENTROID);

		expect(lastIntents()).toEqual(['adultSurveillance.createTrap']);
		expect(lastWrite().locationSource).toEqual({ kind: 'geometry', geometry: SHAPE });
		// `geom` never syncs, so the pin on the map moves off these until the
		// trigger's own values stream back.
		expect(lastWrite().row).toMatchObject({ lat: 38.58, lng: -121.49, geom_type: 'st_point' });
	});

	it('names the retirement beside the create when the switch was turned off', async () => {
		// The POST this replaces had no `is_active` in it, so a trap added inactive
		// was written active and the switch flicked back on when the row synced.
		const { result } = renderHook(() => useTrapMutations());

		await result.current.create(trapFields({ isActive: false }), SHAPE, CENTROID);

		expect(lastIntents()).toEqual(['adultSurveillance.createTrap', 'adultSurveillance.retireTrap']);
		expect(lastWrite().row).toMatchObject({ is_active: false });
	});

	it('withholds the code collision on a create, and passes the label answer through', async () => {
		// Moved from `acknowledged-write.test.tsx`. The form's askable map covers
		// both trap questions and the create sends what it was handed, so the flag
		// `createTrap` reads arrives withheld and the other rides along unread.
		const { result } = renderHook(() => useTrapMutations());

		await firstAttempt(TRAP_SAVE_REFUSALS, async (acknowledgements) => {
			await result.current.create(
				trapFields({ trapName: 'South Levee' }),
				SHAPE,
				{ lat: 38.58, lng: -121.49, geomType: 'ST_Point' },
				acknowledgements,
			);
		});

		expect(lastIntents()).toEqual(['adultSurveillance.createTrap']);
		expect(lastWrite().acknowledgements).toEqual({
			acknowledgedDuplicateTrapCode: false,
			acknowledgedHistoricalLabelChange: false,
		});
	});

	it('names every command the edit means, in one write', async () => {
		// Two updates to a key merge and keep only the last `metadata`, so a second
		// call would arrive carrying the first command's fields under the second's
		// name and be dropped behind a 200.
		const { result } = renderHook(() => useTrapMutations());

		await result.current.save(
			RECORD,
			trapFields({ trapName: 'North Levee 1', addressId: 'address-1', isActive: false }),
			trapFields(),
			{ geometry: SHAPE, centroid: CENTROID },
		);

		expect(dispatches()).toHaveLength(1);
		expect(lastIntents()).toEqual([
			'adultSurveillance.updateTrapDetails',
			'adultSurveillance.updateTrapConfiguration',
			'adultSurveillance.retireTrap',
		]);
		expect(lastWrite().locationSource).toEqual({ kind: 'geometry', geometry: SHAPE });
	});

	it('leaves the point out of an edit that only moved the address', async () => {
		// A trap's address is reference only and independent of its point, so a
		// shape here would make the body claim an edit it is not making.
		const { result } = renderHook(() => useTrapMutations());

		await result.current.save(RECORD, trapFields({ addressId: 'address-1' }), trapFields(), null);

		expect(lastIntents()).toEqual(['adultSurveillance.updateTrapConfiguration']);
		expect(lastWrite().locationSource).toBeUndefined();
		expect(Object.keys(lastChanges())).not.toContain('lat');
	});

	it('dispatches nothing when the form was saved untouched', async () => {
		const { result } = renderHook(() => useTrapMutations());

		await result.current.save(RECORD, trapFields(), trapFields(), null);

		expect(dispatches()).toHaveLength(0);
	});

	it('withholds the rename question, and not the code collision', async () => {
		// Moved from `acknowledged-write.test.tsx`. Retiring a trap frees its code,
		// so only a reactivation can walk into a collision — a rename on a trap
		// already in service answers a question nobody asked.
		const { result } = renderHook(() => useTrapMutations());

		await firstAttempt(TRAP_SAVE_REFUSALS, (acknowledgements) =>
			result.current.save(
				RECORD,
				trapFields({ trapName: 'North Levee 1' }),
				trapFields(),
				null,
				acknowledgements,
			),
		);

		expect(lastIntents()).toEqual(['adultSurveillance.updateTrapDetails']);
		expect(lastWrite().acknowledgements).toEqual({ acknowledgedHistoricalLabelChange: false });
	});

	it('reads the service switch for its direction', async () => {
		const { result } = renderHook(() => useTrapMutations());

		await result.current.setActive(RECORD, false);
		expect(lastIntents()).toEqual(['adultSurveillance.retireTrap']);
		expect(lastChanges().is_active).toBe(false);

		await result.current.setActive(RECORD, true);
		expect(lastIntents()).toEqual(['adultSurveillance.reactivateTrap']);
		expect(lastChanges().is_active).toBe(true);
	});

	it('names the delete and withholds the flag over the collections taken at it', async () => {
		// Moved from `acknowledged-write.test.tsx`. The delete registry counts those
		// rows only for a client that sends the flag as `false` on purpose.
		const { result } = renderHook(() => useTrapMutations());

		await firstAttempt(TRAP_DELETE_REFUSALS, (acknowledgements) =>
			result.current.remove(RECORD, acknowledgements),
		);

		expect(lastIntents()).toEqual(['adultSurveillance.deleteTrap']);
		expect(lastWrite().acknowledgements).toEqual({ acknowledgedCascadeDelete: false });
	});
});

function exactTiming(overrides: Partial<CollectionTiming> = {}): CollectionTiming {
	return {
		timingMode: 'exact_timestamps',
		startedAt: new Date('2026-08-17T16:00:00.000Z'),
		collectedAt: new Date('2026-08-18T16:00:00.000Z'),
		collectionDate: null,
		durationAmount: null,
		durationUnitId: null,
		...overrides,
	};
}

function datedTiming(overrides: Partial<CollectionTiming> = {}): CollectionTiming {
	return {
		timingMode: 'collection_date_duration',
		startedAt: null,
		collectedAt: null,
		collectionDate: '2026-08-18',
		durationAmount: 24,
		durationUnitId: UNIT,
		...overrides,
	};
}

function collectionFields(overrides: Partial<CollectionFields> = {}): CollectionFields {
	return {
		collectionMethodId: METHOD,
		collectionLureId: null,
		addressId: null,
		timing: exactTiming(),
		setByProfileId: PROFILE,
		collectedByProfileId: PROFILE,
		hasProblem: false,
		metadata: null,
		...overrides,
	};
}

/**
 * The edit a transaction handed a collection, replayed onto a bare draft.
 *
 * Local to this file because the harness has nothing for it and reading the row
 * back does not work: a transaction discards its optimistic state once it
 * commits, so the stop is its seeded self again by the time an assertion looks,
 * and `expect(undefined).not.toBeNull()` passes on a stop that was never closed.
 */
function replayUpdate(spy: {
	readonly mock: { readonly calls: readonly unknown[][] };
}): Record<string, unknown> {
	const call = spy.mock.calls.at(-1);
	expect(call, 'the collection was never updated').toBeDefined();
	const draft: Record<string, unknown> = {};
	(call as [string, (row: Record<string, unknown>) => void])[1](draft);
	return draft;
}

describe('a collection write', () => {
	it('reads the caller for whether the trap was set or emptied', async () => {
		const { result } = renderHook(() => useCollectionMutations());

		await result.current.record({
			collectionId: 'a0000000-0000-4000-8000-000000000001',
			fields: collectionFields(),
			placement: { kind: 'trap', trapId: TRAP },
			centroid: CENTROID,
			isCollected: false,
		});
		expect(lastIntents()).toEqual(['adultSurveillance.setTrapCollection']);

		await result.current.record({
			collectionId: 'a0000000-0000-4000-8000-000000000002',
			fields: collectionFields(),
			placement: { kind: 'trap', trapId: TRAP },
			centroid: CENTROID,
			isCollected: true,
		});
		expect(lastIntents()).toEqual(['adultSurveillance.recordCollectedTrapCollection']);
	});

	it('reads the caller rather than the timestamp, so a dated collection is still collected', async () => {
		// The route this replaces chose between the two on a `collectedAt` that
		// happened to parse. An organization on date+duration never has one, so
		// every emptied trap it recorded was written as a trap left out.
		const { result } = renderHook(() => useCollectionMutations());

		await result.current.record({
			collectionId: 'a0000000-0000-4000-8000-000000000003',
			fields: collectionFields({ timing: datedTiming() }),
			placement: { kind: 'trap', trapId: TRAP },
			centroid: CENTROID,
			isCollected: true,
		});

		expect(lastIntents()).toEqual(['adultSurveillance.recordCollectedTrapCollection']);
		expect(lastWrite().row).toMatchObject({ collected_at: null, collection_date: '2026-08-18' });
	});

	it('sends no point for a trap collection and the drawn one for an ad hoc', async () => {
		const { result } = renderHook(() => useCollectionMutations());

		await result.current.record({
			collectionId: 'a0000000-0000-4000-8000-000000000004',
			fields: collectionFields(),
			placement: { kind: 'trap', trapId: TRAP },
			centroid: CENTROID,
			isCollected: false,
		});
		expect(lastWrite().locationSource).toBeUndefined();

		await result.current.record({
			collectionId: 'a0000000-0000-4000-8000-000000000005',
			fields: collectionFields({ addressId: 'address-1' }),
			placement: { kind: 'adhoc', geometry: SHAPE },
			centroid: CENTROID,
			isCollected: true,
		});
		expect(lastIntents()).toEqual(['adultSurveillance.recordCollectedAdHocCollection']);
		expect(lastWrite().locationSource).toEqual({ kind: 'geometry', geometry: SHAPE });
		// An ad hoc collection is located by its own address; a trap collection
		// takes the trap's, so the field is dropped rather than sent.
		expect(lastWrite().row).toMatchObject({ trap_id: null, address_id: 'address-1' });
	});

	it('posts the stop recording as one request naming the stop it closes', async () => {
		// ADR 0012, and the seam that can go quiet: without `assignmentItemId` the
		// server takes the ordinary branch, answers 201, and sync drops the closed
		// stop a moment later with nothing thrown.
		seedRows(assignment_items, [{ id: STOP }]);
		const { result } = renderHook(() => useCollectionMutations());

		await result.current.record({
			collectionId: 'a0000000-0000-4000-8000-000000000006',
			fields: collectionFields(),
			placement: { kind: 'stop', assignmentItemId: STOP, trapId: null },
			centroid: CENTROID,
			isCollected: false,
			acknowledgements: { acknowledgedCompletedItemAdditionalRecord: false },
		});

		expect(dispatches()).toHaveLength(0);
		expect(requests()).toHaveLength(1);
		expect(lastRequest().url).toBe(commandUrl('collections'));
		expect(lastRequest().method).toBe('POST');
		expect(lastRequest().body).toMatchObject({
			intents: ['fieldWork.setTrapCollectionForAssignmentItem'],
			id: 'a0000000-0000-4000-8000-000000000006',
			assignmentItemId: STOP,
			acknowledgedCompletedItemAdditionalRecord: false,
		});
	});

	it('names the collected stop recording when the trap was emptied on the same visit', async () => {
		seedRows(assignment_items, [{ id: STOP }]);
		const update = vi.spyOn(assignment_items(), 'update');
		const { result } = renderHook(() => useCollectionMutations());

		await result.current.record({
			collectionId: 'a0000000-0000-4000-8000-000000000007',
			fields: collectionFields(),
			placement: { kind: 'stop', assignmentItemId: STOP, trapId: null },
			centroid: CENTROID,
			isCollected: true,
		});

		expect(lastRequest().body).toMatchObject({
			intents: ['fieldWork.recordCollectedTrapCollectionForAssignmentItem'],
		});
		// Closed by the visit that was the reason for it, and un-skipped with it:
		// a stop skipped this morning and worked this afternoon is worked.
		const stop = replayUpdate(update);
		expect(stop.completed_at).toBeInstanceOf(Date);
		expect(stop.skipped_at).toBeNull();
		update.mockRestore();
	});

	it('names both commands when the field record and the ad hoc placement both moved', async () => {
		const { result } = renderHook(() => useCollectionMutations());

		await result.current.save({
			collectionId: RECORD,
			fields: collectionFields({ hasProblem: true, collectionLureId: 'lure-1' }),
			current: collectionFields(),
			geometry: { geometry: SHAPE, centroid: CENTROID },
		});

		expect(dispatches()).toHaveLength(1);
		expect(lastIntents()).toEqual([
			'adultSurveillance.updateCollectionFieldDetails',
			'adultSurveillance.updateAdHocCollectionConfiguration',
		]);
		expect(lastWrite().locationSource).toEqual({ kind: 'geometry', geometry: SHAPE });
		expect(lastChanges().lat).toBe(38.58);
	});

	it('restates the whole timing when one of the six moved', async () => {
		// A collection is either exactly timestamped or dated with a duration, and
		// the server rebuilds one whole `CollectionTiming` from whichever six
		// arrive. Half of each is not a state the row can hold.
		const { result } = renderHook(() => useCollectionMutations());

		await result.current.save({
			collectionId: RECORD,
			fields: collectionFields({ timing: datedTiming({ durationAmount: 48 }) }),
			current: collectionFields({ timing: datedTiming() }),
			geometry: null,
		});

		expect(lastIntents()).toEqual(['adultSurveillance.updateCollectionFieldDetails']);
		expect(Object.keys(lastChanges())).toEqual(
			expect.arrayContaining([
				'collection_timing_mode',
				'started_at',
				'collected_at',
				'collection_date',
				'duration_amount',
				'duration_unit_id',
			]),
		);
		expect(lastChanges().duration_amount).toBe(48);
	});

	it('leaves the point out of an edit that only changed the method', async () => {
		const { result } = renderHook(() => useCollectionMutations());

		await result.current.save({
			collectionId: RECORD,
			fields: collectionFields({ collectionMethodId: 'method-2' }),
			current: collectionFields(),
			geometry: null,
		});

		expect(lastIntents()).toEqual(['adultSurveillance.updateAdHocCollectionConfiguration']);
		expect(lastWrite().locationSource).toBeUndefined();
		expect(Object.keys(lastChanges())).not.toContain('lat');
	});

	it('dispatches nothing when the form was saved untouched', async () => {
		const { result } = renderHook(() => useCollectionMutations());

		await result.current.save({
			collectionId: RECORD,
			fields: collectionFields(),
			current: collectionFields(),
			geometry: null,
		});

		expect(dispatches()).toHaveLength(0);
	});

	it('dispatches nothing when the custom fields were rebuilt but not edited', async () => {
		// `metadata` is an object the form rebuilds on every render, so a reference
		// check would name the field-details command on every save.
		const { result } = renderHook(() => useCollectionMutations());

		await result.current.save({
			collectionId: RECORD,
			fields: collectionFields({ metadata: { trapCondition: 'intact' } }),
			current: collectionFields({ metadata: { trapCondition: 'intact' } }),
			geometry: null,
		});

		expect(dispatches()).toHaveLength(0);
	});

	it('dispatches the second visit as an ordinary collect when no stop sent the crew', async () => {
		const collectedAt = new Date('2026-08-18T16:00:00.000Z');
		const { result } = renderHook(() => useCollectionMutations());

		await result.current.collect({ collectionId: RECORD, collectedAt });

		expect(requests()).toHaveLength(0);
		expect(lastIntents()).toEqual(['adultSurveillance.collectCollection']);
		expect(lastChanges().collected_at).toBe(collectedAt);
		expect(lastChanges().collected_by_profile_id).toBe(PROFILE);
	});

	it('posts the second visit and sends the closed-stop flag as false and nothing else', async () => {
		// Moved from `acknowledged-write.test.tsx`, and asserted on the wire here
		// because this path posts rather than dispatches. The other four stop flags
		// are state refusals that repeat what the form already shows, so they stay
		// silent.
		seedRows(assignment_items, [{ id: STOP }]);
		seedRows(collections, [{ id: RECORD }]);
		const { result } = renderHook(() => useCollectionMutations());

		await firstAttempt(STOP_RECORD_REFUSALS, (acknowledgements) =>
			result.current.collect({
				collectionId: RECORD,
				collectedAt: new Date('2026-08-03T14:00:00Z'),
				assignmentItemId: STOP,
				acknowledgements,
			}),
		);

		expect(requests()).toHaveLength(1);
		expect(lastRequest().url).toBe(commandUrl('collections', RECORD));
		expect(lastRequest().method).toBe('PATCH');
		expect(lastRequest().body.acknowledgedCompletedItemAdditionalRecord).toBe(false);
		// The collection was set on an earlier visit, so restating its trap, method
		// or timing would let this one silently rewrite what that one recorded.
		expect(Object.keys(lastRequest().body).sort()).toEqual([
			'acknowledgedCompletedItemAdditionalRecord',
			'assignmentItemId',
			'collected_at',
			'collected_by_profile_id',
			'intents',
		]);
		expect(lastRequest().body.intents).toEqual([
			'fieldWork.collectTrapCollectionForAssignmentItem',
		]);
	});

	it('reads the zero result for its direction, because clearing it is not an undo', async () => {
		const { result } = renderHook(() => useCollectionMutations());

		await result.current.setZeroResult(RECORD, true);
		expect(lastIntents()).toEqual(['adultSurveillance.markCollectionZeroResult']);
		expect(lastChanges().is_zero_result).toBe(true);

		await result.current.setZeroResult(RECORD, false);
		expect(lastIntents()).toEqual(['adultSurveillance.clearCollectionZeroResult']);
		expect(lastChanges().is_zero_result).toBe(false);
	});

	it('withholds the clearance flag when a zero result is marked', async () => {
		// Moved from `acknowledged-write.test.tsx`. Marking deletes every species
		// count on the collection, and the number the server names is its own
		// rather than whatever the page happens to have loaded.
		const { result } = renderHook(() => useCollectionMutations());

		await firstAttempt(COLLECTION_ZERO_RESULT_REFUSALS, (acknowledgements) =>
			result.current.setZeroResult(RECORD, true, acknowledgements),
		);

		expect(lastIntents()).toEqual(['adultSurveillance.markCollectionZeroResult']);
		expect(lastWrite().acknowledgements).toEqual({ acknowledgedSpeciesCountsClearance: false });
	});

	it('names one command for the bycatch observation, whichever way it went', async () => {
		const { result } = renderHook(() => useCollectionMutations());

		await result.current.setBycatch(RECORD, true);
		expect(lastIntents()).toEqual(['adultSurveillance.setCollectionBycatch']);

		await result.current.setBycatch(RECORD, false);
		expect(lastIntents()).toEqual(['adultSurveillance.setCollectionBycatch']);
		expect(lastChanges().has_bycatch).toBe(false);
	});

	it('files the problem switch with the rest of the field record', async () => {
		const { result } = renderHook(() => useCollectionMutations());

		await result.current.setProblem(RECORD, true);

		expect(lastIntents()).toEqual(['adultSurveillance.updateCollectionFieldDetails']);
		expect(lastChanges().has_problem).toBe(true);
	});

	it('names the delete and withholds the flag over its species counts', async () => {
		// Moved from `acknowledged-write.test.tsx`.
		const { result } = renderHook(() => useCollectionMutations());

		await firstAttempt(COLLECTION_DELETE_REFUSALS, (acknowledgements) =>
			result.current.remove(RECORD, acknowledgements),
		);

		expect(lastIntents()).toEqual(['adultSurveillance.deleteCollection']);
		expect(lastWrite().acknowledgements).toEqual({ acknowledgedSpeciesCountDeletion: false });
	});
});

describe('a collection species write', () => {
	it('names the create and files it under the day the organization is having', async () => {
		// An identification keyed at 11pm on a lab machine two zones away belongs
		// to the organization's date, not the browser's.
		const { result } = renderHook(() => useCollectionSpeciesMutations());

		await result.current.add({
			collectionId: RECORD,
			fields: { speciesId: SPECIES, count: 40, sex: 'female', status: 'gravid' },
			identifiedDate: '2026-08-04',
			collectionSpeciesId: 'b0000000-0000-4000-8000-000000000001',
		});

		expect(lastIntents()).toEqual(['adultSurveillance.addCollectionSpeciesCount']);
		expect(lastWrite().row).toMatchObject({
			identified_date: '2026-08-04',
			identified_by_profile_id: PROFILE,
		});
	});

	it('sends only what the correction restated, because the command reads by presence', async () => {
		// A count corrected from 40 to 38 says nothing about the species, the sex or
		// the status, and re-sending them would be this layer inventing an edit.
		const { result } = renderHook(() => useCollectionSpeciesMutations());

		await result.current.save(RECORD, { count: 38 });

		expect(lastIntents()).toEqual(['adultSurveillance.updateCollectionSpeciesCount']);
		expect(lastChanges().count).toBe(38);
		expect(Object.keys(lastChanges())).not.toContain('species_id');
		expect(Object.keys(lastChanges())).not.toContain('sex');
		expect(Object.keys(lastChanges())).not.toContain('status');
	});

	it('dispatches nothing when the grid saved an untouched row', async () => {
		const { result } = renderHook(() => useCollectionSpeciesMutations());

		await result.current.save(RECORD, {});

		expect(dispatches()).toHaveLength(0);
	});

	it('names the delete', async () => {
		const { result } = renderHook(() => useCollectionSpeciesMutations());

		await result.current.remove(RECORD);

		expect(lastIntents()).toEqual(['adultSurveillance.deleteCollectionSpeciesCount']);
	});
});
