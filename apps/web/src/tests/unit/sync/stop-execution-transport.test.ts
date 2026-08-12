import type { AdultCollectionRow, ApplicationRow, InspectionRow } from '@simmer-mosquito/sync';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createCollectionMutationHandlers } from '../../../sync/adultSurveillanceMutations';
import { createApplicationMutationHandlers } from '../../../sync/controlOperationsMutations';
import { createInspectionMutationHandlers } from '../../../sync/larvalSurveillanceMutations';

/**
 * The stop id has to reach the endpoint, because it is the only thing that tells
 * the server this write is an execution rather than an ordinary record.
 *
 * This seam is where the whole feature can go quiet. The domain command, the
 * server handler, the migration and the optimistic row can all be correct and
 * fully covered, and the record still lands with a null link and its stop still
 * pending — the server simply takes the non-execution branch, answers 201, and
 * sync reverts the optimistic link a moment later. Nothing throws and nothing
 * below this layer can see it, so the assertion has to be on the wire body.
 *
 * See `docs/adr/0012-assignment-item-action-provenance.md`.
 */
describe('stop execution transport', () => {
	afterEach(() => {
		vi.unstubAllGlobals();
	});

	it('sends the assignment stop with an inspection recorded from one', async () => {
		const fetch = stubFetch();

		await createInspectionMutationHandlers({ serverUrl: SERVER }).onInsert({
			transaction: { mutations: [{ original: {}, modified: inspection() }] },
		});

		expect(bodyOf(fetch)).toMatchObject({ assignmentItemId: 'assignment-item-1' });
	});

	it('sends the assignment stop with a collection recorded from one', async () => {
		// The row keeps set and collected provenance apart, but a create is one
		// visit: the server decides which column the stop lands in.
		const fetch = stubFetch();

		await createCollectionMutationHandlers({ serverUrl: SERVER }).onInsert({
			transaction: {
				mutations: [
					{
						original: {},
						modified: collection({
							setAssignmentItemId: 'assignment-item-2',
							collectedAssignmentItemId: 'assignment-item-2',
						}),
					},
				],
			},
		});

		expect(bodyOf(fetch)).toMatchObject({ assignmentItemId: 'assignment-item-2' });
	});

	it('sends the mission stop with an application recorded from one', async () => {
		const fetch = stubFetch();

		await createApplicationMutationHandlers({ serverUrl: SERVER }).onInsert({
			transaction: {
				mutations: [{ original: {}, modified: application({ missionItemId: 'mission-item-1' }) }],
			},
		});

		expect(bodyOf(fetch)).toMatchObject({ missionItemId: 'mission-item-1' });
	});

	it('sends a drawn mission location as a geometry, not a location source', async () => {
		// A mission stop already has a place, so its execution command takes a bare
		// geometry override and has no reader for `locationSource`. Sent under the
		// ordinary name the draw is silently dropped and the action inherits the
		// stop's geometry — which also makes the ST_Covers check trivially true.
		const fetch = stubFetch();
		const geometry = { type: 'Point', coordinates: [-122.33, 47.61] };

		await createApplicationMutationHandlers({ serverUrl: SERVER }).onInsert({
			transaction: {
				mutations: [
					{
						original: {},
						modified: application({ missionItemId: 'mission-item-1' }),
						metadata: { locationSource: { kind: 'geometry', geometry } },
					},
				],
			},
		});

		const body = bodyOf(fetch) as Record<string, unknown>;
		expect(body.geometry).toEqual(geometry);
		expect(body).not.toHaveProperty('locationSource');
	});

	it('keeps sending a location source when there is no mission stop', async () => {
		const fetch = stubFetch();
		const locationSource = {
			kind: 'geometry',
			geometry: { type: 'Point', coordinates: [-122.33, 47.61] },
		};

		await createApplicationMutationHandlers({ serverUrl: SERVER }).onInsert({
			transaction: {
				mutations: [{ original: {}, modified: application(), metadata: { locationSource } }],
			},
		});

		const body = bodyOf(fetch) as Record<string, unknown>;
		expect(body.locationSource).toEqual(locationSource);
		expect(body).not.toHaveProperty('geometry');
	});

	it('routes emptying a pending trap to the collect endpoint, carrying the stop', async () => {
		// Only `collectCollection` can link and close the stop; the ordinary PATCH
		// has no execution branch, so a Collect sent that way would record the
		// specimens and leave the stop pending.
		const fetch = stubFetch();
		const pending = collection({ collectedAt: null, collectedByProfileId: null });

		await createCollectionMutationHandlers({ serverUrl: SERVER }).onUpdate({
			transaction: {
				mutations: [
					{
						original: pending,
						modified: collection({
							collectedAt: '2026-08-11T12:00:00.000Z',
							collectedAssignmentItemId: 'assignment-item-3',
						}),
					},
				],
			},
		});

		expect(String(fetch.mock.calls[0]?.[0])).toBe(
			`${SERVER}/adult-surveillance/collections/collection-1/collect`,
		);
		expect(bodyOf(fetch)).toMatchObject({
			assignmentItemId: 'assignment-item-3',
			collectedAt: '2026-08-11T12:00:00.000Z',
		});
	});

	it('leaves a broader edit on the ordinary patch, even when it also collects', async () => {
		// The edit form can turn a pending collection into a collected one while
		// changing anything else on the record. Routing that to /collect would
		// carry the collect columns and silently drop the rest of the edit.
		const fetch = stubFetch();

		await createCollectionMutationHandlers({ serverUrl: SERVER }).onUpdate({
			transaction: {
				mutations: [
					{
						original: collection({ collectedAt: null }),
						modified: collection({
							collectedAt: '2026-08-11T12:00:00.000Z',
							collectionLureId: 'lure-2',
						}),
					},
				],
			},
		});

		expect(String(fetch.mock.calls[0]?.[0])).toBe(
			`${SERVER}/adult-surveillance/collections/collection-1`,
		);
		expect(bodyOf(fetch)).toMatchObject({ collectionLureId: 'lure-2' });
	});

	it('does not offer the stop as an editable field on a later correction', async () => {
		// Provenance is written once, by the write that closed the stop. A PATCH
		// carrying it would let an ordinary edit reassign which stop a record came
		// from — and, on the mission side, re-enter the execution branch.
		const fetch = stubFetch();

		await createApplicationMutationHandlers({ serverUrl: SERVER }).onUpdate?.({
			transaction: {
				mutations: [
					{
						original: application({ missionItemId: 'mission-item-1' }),
						modified: application({ missionItemId: 'mission-item-2', amountApplied: 3 }),
					},
				],
			},
		});

		expect(bodyOf(fetch)).toEqual({ amountApplied: 3 });
	});
});

const SERVER = 'https://example.test';

// Typed with the arguments it is called with, not as a bare thunk: `bodyOf` reads
// the second one, and a zero-argument mock types `calls` as empty tuples.
function stubFetch() {
	const fetch = vi.fn(
		async (_url: string, _init?: RequestInit) => new Response(JSON.stringify({ txid: 42 })),
	);
	vi.stubGlobal('fetch', fetch);
	return fetch;
}

/** The body the handler actually put on the wire. */
function bodyOf(fetch: ReturnType<typeof stubFetch>): unknown {
	return JSON.parse(String(fetch.mock.calls[0]?.[1]?.body));
}

function inspection(overrides: Partial<InspectionRow> = {}): InspectionRow {
	return {
		id: 'inspection-1',
		organizationId: 'organization-1',
		habitatId: 'habitat-1',
		habitatTypeId: null,
		addressId: null,
		inspectedByProfileId: 'profile-1',
		assignmentItemId: 'assignment-item-1',
		inspectionDate: '2026-08-11',
		isWet: true,
		dipCount: 10,
		density: null,
		larvaeCount: null,
		hasFirstInstar: false,
		hasSecondInstar: false,
		hasThirdInstar: false,
		hasFourthInstar: false,
		hasPupae: false,
		hasEggs: false,
		createdByProfileId: 'profile-1',
		updatedByProfileId: 'profile-1',
		createdAt: '2026-08-11T00:00:00.000Z',
		updatedAt: '2026-08-11T00:00:00.000Z',
		...overrides,
	};
}

function collection(overrides: Partial<AdultCollectionRow> = {}): AdultCollectionRow {
	return {
		id: 'collection-1',
		organizationId: 'organization-1',
		lat: 47.61,
		lng: -122.33,
		geomType: 'point',
		trapId: 'trap-1',
		collectionMethodId: 'method-1',
		collectionLureId: null,
		addressId: null,
		collectedAt: '2026-08-11T17:00:00.000Z',
		collectedByProfileId: 'profile-1',
		startedAt: '2026-08-10T17:00:00.000Z',
		setByProfileId: 'profile-1',
		setAssignmentItemId: null,
		collectedAssignmentItemId: null,
		collectionTimingMode: 'exact_timestamps',
		collectionDate: null,
		durationAmount: null,
		durationUnitId: null,
		hasProblem: false,
		isZeroResult: false,
		hasBycatch: false,
		metadata: null,
		createdByProfileId: 'profile-1',
		updatedByProfileId: 'profile-1',
		createdAt: '2026-08-11T00:00:00.000Z',
		updatedAt: '2026-08-11T00:00:00.000Z',
		...overrides,
	};
}

function application(overrides: Partial<ApplicationRow> = {}): ApplicationRow {
	return {
		id: 'application-1',
		organizationId: 'organization-1',
		lat: 47.61,
		lng: -122.33,
		geomType: 'point',
		applicationMethodId: 'method-1',
		insecticideId: 'insecticide-1',
		applicatorProfileId: 'profile-1',
		applicationDate: '2026-08-11',
		addressId: null,
		vehicleId: null,
		equipmentId: null,
		amountApplied: 2,
		applicationUnitId: 'unit-1',
		habitatId: null,
		collectionId: null,
		inspectionId: null,
		requestedControlActionId: null,
		missionItemId: null,
		metadata: null,
		createdByProfileId: 'profile-1',
		updatedByProfileId: 'profile-1',
		createdAt: '2026-08-11T00:00:00.000Z',
		updatedAt: '2026-08-11T00:00:00.000Z',
		...overrides,
	};
}
