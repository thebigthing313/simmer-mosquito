/** @vitest-environment jsdom */

/**
 * That the flags actually reach the wire, per surface.
 *
 * `acknowledged()` on the server reads an absent flag as confirmed, so a guard
 * fires only for a client that sends `false` on purpose. That reading is staying
 * (#319): flipping it would refuse writes from mobile and from every script that
 * works today. The cost is that a form which forgets to send its flags passes
 * every guard and nobody finds out, because the write succeeds.
 *
 * So this is the test each converted surface owes. It asserts the payload of the
 * *first* attempt, before any dialog, and it is the only thing standing between
 * a surface that asks and a surface that silently does not.
 */

import { renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

const mutateCollection = vi.fn((_collection: unknown, _write: unknown) => ({
	isPersisted: { promise: Promise.resolve() },
}));
const commandTransaction = vi.fn((_transaction: unknown) => ({
	isPersisted: { promise: Promise.resolve() },
}));
vi.mock('../../../lib/collections/mutate', () => ({
	mutateCollection: (collection: unknown, write: unknown) => mutateCollection(collection, write),
}));
vi.mock('../../../lib/collections/habitats', () => ({ habitats: {} }));
vi.mock('../../../lib/collections/weather_sources', () => ({ weather_sources: {} }));
// Every collection a hook under test imports. A collection module opens a sync
// shape at import time, so it is stubbed rather than loaded; nothing here reads
// one, because `mutateCollection` is what the assertions look at.
vi.mock('../../../lib/collections/transact', () => ({
	commandTransaction: (transaction: unknown) => commandTransaction(transaction),
}));
vi.mock('../../../lib/collections/application_methods', () => ({ application_methods: {} }));
vi.mock('../../../lib/collections/applications', () => ({ applications: {} }));
vi.mock('../../../lib/collections/assignment_items', () => ({ assignment_items: {} }));
vi.mock('../../../lib/collections/assignments', () => ({ assignments: {} }));
vi.mock('../../../lib/collections/biocontrol_actions', () => ({ biocontrol_actions: {} }));
vi.mock('../../../lib/collections/biocontrol_methods', () => ({ biocontrol_methods: {} }));
vi.mock('../../../lib/collections/collection_lures', () => ({ collection_lures: {} }));
vi.mock('../../../lib/collections/collection_methods', () => ({ collection_methods: {} }));
vi.mock('../../../lib/collections/collections', () => ({ collections: {} }));
vi.mock('../../../lib/collections/equipment', () => ({ equipment: {} }));
vi.mock('../../../lib/collections/habitat_types', () => ({ habitat_types: {} }));
vi.mock('../../../lib/collections/insecticide_batches', () => ({ insecticide_batches: {} }));
vi.mock('../../../lib/collections/insecticides', () => ({ insecticides: {} }));
vi.mock('../../../lib/collections/inspections', () => ({ inspections: {} }));
vi.mock('../../../lib/collections/mission_items', () => ({ mission_items: {} }));
vi.mock('../../../lib/collections/missions', () => ({ missions: {} }));
vi.mock('../../../lib/collections/notification_registration_types', () => ({
	notification_registration_types: {},
}));
vi.mock('../../../lib/collections/notification_registrations', () => ({
	notification_registrations: {},
}));
vi.mock('../../../lib/collections/notification_types', () => ({ notification_types: {} }));
vi.mock('../../../lib/collections/outreach_actions', () => ({ outreach_actions: {} }));
vi.mock('../../../lib/collections/outreach_methods', () => ({ outreach_methods: {} }));
vi.mock('../../../lib/collections/requested_control_actions', () => ({
	requested_control_actions: {},
}));
vi.mock('../../../lib/collections/route_items', () => ({ route_items: {} }));
vi.mock('../../../lib/collections/routes', () => ({ routes: {} }));
vi.mock('../../../lib/collections/samples', () => ({ samples: {} }));
vi.mock('../../../lib/collections/service_requests', () => ({ service_requests: {} }));
vi.mock('../../../lib/collections/source_reduction_methods', () => ({
	source_reduction_methods: {},
}));
vi.mock('../../../lib/collections/source_reductions', () => ({ source_reductions: {} }));
vi.mock('../../../lib/collections/traps', () => ({ traps: {} }));
vi.mock('../../../lib/collections/vehicles', () => ({ vehicles: {} }));
vi.mock('../../../hooks/use-auth-snapshot', () => ({
	useAuthSnapshot: () => ({
		authenticated: true,
		localIdentity: { organizationId: ORGANIZATION, profileId: PROFILE },
	}),
}));

const ORGANIZATION = '11111111-1111-4111-8111-111111111111';
const PROFILE = '22222222-2222-4222-8222-222222222222';
const RECORD = '33333333-3333-4333-8333-333333333333';

const { useAcknowledgedWrite } = await import('../../../components/acknowledged-write');
const {
	APPLICATION_DELETE_REFUSALS,
	APPLICATION_SAVE_REFUSALS,
	ASSIGNMENT_DELETE_REFUSALS,
	COLLECTION_DELETE_REFUSALS,
	COLLECTION_ZERO_RESULT_REFUSALS,
	CONTROL_ACTION_DELETE_REFUSALS,
	CONTROL_REQUEST_DELETE_REFUSALS,
	EQUIPMENT_SAVE_REFUSALS,
	HABITAT_DELETE_REFUSALS,
	INSECTICIDE_BATCH_SAVE_REFUSALS,
	INSECTICIDE_SAVE_REFUSALS,
	INSPECTION_DELETE_REFUSALS,
	IMPORT_REFUSALS,
	MISSION_DELETE_REFUSALS,
	REGISTRATION_SAVE_REFUSALS,
	ROUTE_DELETE_REFUSALS,
	SAMPLE_DELETE_REFUSALS,
	SERVICE_REQUEST_DELETE_REFUSALS,
	SERVICE_REQUEST_SAVE_REFUSALS,
	STATION_DELETE_REFUSALS,
	STATION_REFUSALS,
	STOP_RECORD_REFUSALS,
	TRAP_DELETE_REFUSALS,
	TRAP_SAVE_REFUSALS,
	VEHICLE_SAVE_REFUSALS,
	acknowledgementCopyFor,
} = await import('../../../lib/acknowledgement-copy');
const { useHabitatMutations } = await import('../../../hooks/mutations/use-habitat-mutations');
const { useWeatherStationMutations } = await import(
	'../../../hooks/mutations/use-weather-station-mutations'
);

/** What `mutateCollection` was handed, from the most recent call. */
function lastWrite(): Record<string, unknown> {
	const call = mutateCollection.mock.calls.at(-1);
	expect(call).toBeDefined();
	return (call as [unknown, unknown])[1] as Record<string, unknown>;
}

describe('the habitat delete asks the registry', () => {
	// deleteRegistry. Deleting a habitat keeps its inspections and the control
	// work recorded against it, and clears the link to the habitat from both. The
	// registry counts those rows and refuses; withholding the flags is what makes
	// it count them at all.
	it('sends both detach flags as false on the first attempt', async () => {
		mutateCollection.mockClear();
		const { result } = renderHook(() => ({
			ask: useAcknowledgedWrite({ askable: HABITAT_DELETE_REFUSALS, ask: true }),
			mutations: useHabitatMutations(),
		}));

		await result.current.ask.run((acknowledgements) =>
			result.current.mutations.remove(RECORD, acknowledgements),
		);

		expect(lastWrite().acknowledgements).toEqual({
			acknowledgedInspectionDetach: false,
			acknowledgedCrossDomainDetach: false,
		});
	});
});

describe('the weather station edit asks about the readings', () => {
	// historyCheck. Summaries record neither what the station was called nor where
	// it stood, so a rename relabels every past reading and a move relocates them.
	it('sends both history flags as false on the first attempt', async () => {
		mutateCollection.mockClear();
		const { result } = renderHook(() => ({
			ask: useAcknowledgedWrite({ askable: STATION_REFUSALS, ask: true }),
			mutations: useWeatherStationMutations(),
		}));

		await result.current.ask.run((acknowledgements) =>
			result.current.mutations.save({
				weatherStationId: RECORD,
				fields: { name: 'South Gauge', code: 'SG-1', metadata: null },
				current: { name: 'North Gauge', code: 'NG-1', metadata: null },
				geometry: { type: 'Point', coordinates: [-121.49, 38.58] },
				acknowledgedIdentityChange:
					acknowledgements.acknowledgedHistoricalStationIdentityChange === true,
				acknowledgedLocationChange: acknowledgements.acknowledgedHistoricalLocationChange === true,
			}),
		);

		expect(lastWrite().acknowledgements).toEqual({
			acknowledgedHistoricalStationIdentityChange: false,
			acknowledgedHistoricalLocationChange: false,
		});
	});
});

describe('the weather station delete asks about the readings it destroys', () => {
	// clearanceCheck. The only weather write that destroys data.
	it('sends the summary flag as false on the first attempt', async () => {
		mutateCollection.mockClear();
		const { result } = renderHook(() => ({
			ask: useAcknowledgedWrite({ askable: STATION_DELETE_REFUSALS, ask: true }),
			mutations: useWeatherStationMutations(),
		}));

		await result.current.ask.run((acknowledgements) =>
			result.current.mutations.remove(
				RECORD,
				acknowledgements.acknowledgedSummaryDeletion === true,
			),
		);

		expect(lastWrite().acknowledgements).toEqual({ acknowledgedSummaryDeletion: false });
	});
});

describe('opting in', () => {
	// The surfaces that have not been converted keep the behaviour that shipped:
	// no flags, every guard confirmed. Losing this would turn on forty-five
	// questions at once across pages with no wording for any of them.
	it('sends nothing at all without ask', async () => {
		const write = vi.fn(async () => undefined);
		const { result } = renderHook(() => useAcknowledgedWrite({ askable: STATION_REFUSALS }));

		await result.current.run(write);

		expect(write).toHaveBeenCalledWith({});
	});
});

describe('a refusal with no copy', () => {
	/**
	 * The counts are the server's and they are true whether or not anybody wrote a
	 * sentence around them, so the question states them and the save goes through
	 * on confirm. Dead-ending the user over a missing string in this repo would be
	 * the worse failure.
	 */
	it('builds a sentence from the consequences and logs the flag', () => {
		const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

		const copy = acknowledgementCopyFor('acknowledgedNothingWrittenYet', [
			{ key: 'inspections', count: 4, singular: 'inspection', plural: 'inspections' },
			{ key: 'samples', count: 1, singular: 'sample', plural: 'samples' },
		]);

		expect(copy.body).toBe('This affects 4 inspections and 1 sample.');
		expect(warn).toHaveBeenCalledWith(expect.stringContaining('acknowledgedNothingWrittenYet'));
		warn.mockRestore();
	});

	it('still says something when the refusal counts nothing', () => {
		const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

		expect(acknowledgementCopyFor('acknowledgedNothingWrittenYet', []).body).toBe(
			'This changes records beyond the one on screen.',
		);
		warn.mockRestore();
	});

	it('prefers the written question when there is one', () => {
		expect(acknowledgementCopyFor('acknowledgedSummaryDeletion', []).confirm).toBe('Delete them');
	});
});

// ===========================================================================
// The surfaces converted in the second phase
// ===========================================================================

const { useTrapMutations } = await import('../../../hooks/mutations/use-trap-mutations');
const { useCollectionMutations } = await import(
	'../../../hooks/mutations/use-collection-mutations'
);
const { useInspectionMutations } = await import(
	'../../../hooks/mutations/use-inspection-mutations'
);
const { useSampleMutations } = await import('../../../hooks/mutations/use-sample-mutations');
const { useApplicationMutations } = await import(
	'../../../hooks/mutations/use-application-mutations'
);
const { useSourceReductionMutations } = await import(
	'../../../hooks/mutations/use-source-reduction-mutations'
);
const { useBiocontrolActionMutations } = await import(
	'../../../hooks/mutations/use-biocontrol-action-mutations'
);
const { useOutreachActionMutations } = await import(
	'../../../hooks/mutations/use-outreach-action-mutations'
);
const { useRequestedControlActionMutations } = await import(
	'../../../hooks/mutations/use-requested-control-action-mutations'
);
const { useMissionMutations } = await import('../../../hooks/mutations/use-mission-mutations');
const { useRouteMutations } = await import('../../../hooks/mutations/use-route-mutations');
const { useAssignmentMutations } = await import(
	'../../../hooks/mutations/use-assignment-mutations'
);
const { useServiceRequestMutations } = await import(
	'../../../hooks/mutations/use-service-request-mutations'
);
const { useNotificationRegistrationMutations } = await import(
	'../../../hooks/mutations/use-notification-registration-mutations'
);
const { useCollectionMethodMutations, useNotificationTypeMutations } = await import(
	'../../../hooks/mutations/use-catalog-mutations'
);
const { useInsecticideBatchMutations, useInsecticideMutations } = await import(
	'../../../hooks/mutations/use-insecticide-mutations'
);
const { useEquipmentMutations, useVehicleMutations } = await import(
	'../../../hooks/mutations/use-control-asset-mutations'
);

/** What `commandTransaction` was handed, from the most recent call. */
function lastTransaction(): Record<string, unknown> {
	const call = commandTransaction.mock.calls.at(-1);
	expect(call).toBeDefined();
	return (call as [unknown])[0] as Record<string, unknown>;
}

/**
 * One attempt with nothing answered, which is what a page's first Save sends.
 *
 * Every test below is the same three lines: render the hook the page holds, run
 * the write once, read what went out. Wrapped so the assertion is the only thing
 * a reader compares between surfaces.
 */
function firstAttempt(
	askable: Readonly<Record<string, string>>,
	write: (acknowledgements: Readonly<Record<string, boolean>>) => Promise<void>,
): Promise<void> {
	mutateCollection.mockClear();
	commandTransaction.mockClear();
	const { result } = renderHook(() => useAcknowledgedWrite({ askable, ask: true }));
	return result.current.run(write);
}

describe('the deletes that take other records with them', () => {
	// Every one of these is the delete registry counting rows behind a flag the
	// server reads as confirmed unless it arrives as `false`. Withholding it is
	// what makes the server count at all.
	it('trap: the collections taken at it', async () => {
		const { result } = renderHook(() => useTrapMutations());

		await firstAttempt(TRAP_DELETE_REFUSALS, (acknowledgements) =>
			result.current.remove(RECORD, acknowledgements),
		);

		expect(lastWrite().acknowledgements).toEqual({ acknowledgedCascadeDelete: false });
	});

	it('collection: the species counts on it', async () => {
		const { result } = renderHook(() => useCollectionMutations());

		await firstAttempt(COLLECTION_DELETE_REFUSALS, (acknowledgements) =>
			result.current.remove(RECORD, acknowledgements),
		);

		expect(lastWrite().acknowledgements).toEqual({ acknowledgedSpeciesCountDeletion: false });
	});

	it('inspection: what is filed under it, and the control work that is only unlinked', async () => {
		const { result } = renderHook(() => useInspectionMutations());

		await firstAttempt(INSPECTION_DELETE_REFUSALS, (acknowledgements) =>
			result.current.remove(RECORD, acknowledgements),
		);

		expect(lastWrite().acknowledgements).toEqual({
			acknowledgedAssociatedRecordsDeletion: false,
			acknowledgedCrossDomainDetach: false,
		});
	});

	it('sample: its species counts and comments', async () => {
		const { result } = renderHook(() => useSampleMutations());

		await firstAttempt(SAMPLE_DELETE_REFUSALS, (acknowledgements) =>
			result.current.remove(RECORD, acknowledgements),
		);

		expect(lastWrite().acknowledgements).toEqual({
			acknowledgedAssociatedRecordsDeletion: false,
		});
	});

	it('chemical application: its batch records and its support rows', async () => {
		const { result } = renderHook(() => useApplicationMutations());

		await firstAttempt(APPLICATION_DELETE_REFUSALS, (acknowledgements) =>
			result.current.remove(RECORD, acknowledgements),
		);

		expect(lastWrite().acknowledgements).toEqual({
			acknowledgedBatchDeletion: false,
			acknowledgedSupportRecordDeletion: false,
		});
	});

	it('source reduction: its notes and crew', async () => {
		const { result } = renderHook(() => useSourceReductionMutations());

		await firstAttempt(CONTROL_ACTION_DELETE_REFUSALS, (acknowledgements) =>
			result.current.remove(RECORD, acknowledgements),
		);

		expect(lastWrite().acknowledgements).toEqual({ acknowledgedSupportRecordDeletion: false });
	});

	it('biocontrol release: its notes and crew', async () => {
		const { result } = renderHook(() => useBiocontrolActionMutations());

		await firstAttempt(CONTROL_ACTION_DELETE_REFUSALS, (acknowledgements) =>
			result.current.remove(RECORD, acknowledgements),
		);

		expect(lastWrite().acknowledgements).toEqual({ acknowledgedSupportRecordDeletion: false });
	});

	it('outreach action: its notes and crew', async () => {
		const { result } = renderHook(() => useOutreachActionMutations());

		await firstAttempt(CONTROL_ACTION_DELETE_REFUSALS, (acknowledgements) =>
			result.current.remove(RECORD, acknowledgements),
		);

		expect(lastWrite().acknowledgements).toEqual({ acknowledgedSupportRecordDeletion: false });
	});

	it('service request: the assignment stops cut from it', async () => {
		const { result } = renderHook(() => useServiceRequestMutations());

		await firstAttempt(SERVICE_REQUEST_DELETE_REFUSALS, (acknowledgements) =>
			result.current.remove(RECORD, acknowledgements),
		);

		expect(lastWrite().acknowledgements).toEqual({ acknowledgedAssignmentItemDeletion: false });
	});

	it('control request: the work done and the mission stops naming it', async () => {
		const { result } = renderHook(() => useRequestedControlActionMutations());

		await firstAttempt(CONTROL_REQUEST_DELETE_REFUSALS, (acknowledgements) =>
			result.current.remove(RECORD, acknowledgements),
		);

		expect(lastWrite().acknowledgements).toEqual({
			acknowledgedActionDetach: false,
			acknowledgedMissionDetach: false,
		});
	});

	it('mission: its stops, its notifications, and the work recorded at them', async () => {
		const { result } = renderHook(() => useMissionMutations());

		await firstAttempt(MISSION_DELETE_REFUSALS, (acknowledgements) =>
			result.current.remove(RECORD, acknowledgements),
		);

		expect(lastWrite().acknowledgements).toEqual({
			acknowledgedActualActionDetach: false,
			acknowledgedMissionItemDeletion: false,
			acknowledgedNotificationDeletion: false,
		});
	});

	it('route: the stops on it', async () => {
		const { result } = renderHook(() => useRouteMutations());

		await firstAttempt(ROUTE_DELETE_REFUSALS, (acknowledgements) =>
			result.current.remove(RECORD, acknowledgements),
		);

		expect(lastWrite().acknowledgements).toEqual({ acknowledgedRouteItemDeletion: false });
	});

	it('assignment: the stops on it', async () => {
		const { result } = renderHook(() => useAssignmentMutations());

		await firstAttempt(ASSIGNMENT_DELETE_REFUSALS, (acknowledgements) =>
			result.current.remove(RECORD, acknowledgements),
		);

		expect(lastWrite().acknowledgements).toEqual({ acknowledgedAssignmentItemDeletion: false });
	});
});

const UNIT = '44444444-4444-4444-8444-444444444444';
const METHOD = '55555555-5555-4555-8555-555555555555';
const CONTACT = '66666666-6666-4666-8666-666666666666';
const OTHER = '77777777-7777-4777-8777-777777777777';
const STOP = '88888888-8888-4888-8888-888888888888';

/** The application an edit is compared against. */
function applicationValues() {
	return {
		insecticideId: RECORD,
		amountApplied: 2,
		unitId: UNIT,
		actionDate: '2026-08-03',
		methodId: null,
		applicatorProfileId: null,
		vehicleId: null,
		equipmentId: null,
		addressId: null,
		habitatId: null,
		metadata: null,
	};
}

/**
 * The stored row an edit is diffed against.
 *
 * Written out rather than cast, because the diff is the whole point: a field the
 * fixture leaves undefined would read as moved and name a command the test did
 * not mean.
 */
function application() {
	return {
		...applicationValues(),
		id: RECORD,
		productName: 'Aqua-Reslin',
		methodName: null,
		applicatorName: null,
		unitAbbreviation: null,
		vehicleName: null,
		equipmentName: null,
		collectionId: null,
		address: {
			id: undefined,
			displayName: undefined,
			addressLine1: undefined,
			addressLine2: undefined,
			locality: undefined,
			region: undefined,
			postalCode: undefined,
		},
		inspectionId: null,
		requestedControlActionId: null,
		missionItemId: null,
		latitude: 38.58,
		longitude: -121.49,
		geometryKind: 'ST_Point',
		createdAt: new Date('2026-08-03T14:00:00Z'),
		updatedAt: new Date('2026-08-03T14:00:00Z'),
		createdByProfileId: PROFILE,
		updatedByProfileId: PROFILE,
	};
}

describe('the renames and edits that rewrite what past records read', () => {
	// `historyCheck` on the server. The rows are not going anywhere; they will
	// read differently, and the count is how many.
	it('catalog: only when the name moved', async () => {
		const { result } = renderHook(() => useCollectionMethodMutations());

		await firstAttempt(result.current.refusals, (acknowledgements) =>
			result.current.save(
				RECORD,
				{ name: 'Gravid trap', isActive: true },
				{ name: 'Gravid', isActive: true },
				acknowledgements,
			),
		);

		expect(lastWrite().acknowledgements).toEqual({ acknowledgedHistoricalLabelChange: false });
	});

	it('catalog: nothing at all on a description-only edit', async () => {
		const { result } = renderHook(() => useCollectionMethodMutations());

		await firstAttempt(result.current.refusals, (acknowledgements) =>
			result.current.save(
				RECORD,
				{ name: 'Gravid', description: 'Now with a lure', isActive: true },
				{ name: 'Gravid', description: null, isActive: true },
				acknowledgements,
			),
		);

		expect(lastWrite().acknowledgements).toEqual({});
	});

	it('notification type: retiring one asks about the registrations under it', async () => {
		const { result } = renderHook(() => useNotificationTypeMutations());

		await firstAttempt(result.current.refusals, (acknowledgements) =>
			result.current.setActive(RECORD, false, acknowledgements),
		);

		expect(lastWrite().acknowledgements).toEqual({ acknowledgedActiveSubscriptionImpact: false });
	});

	it('insecticide: only when the product identity moved', async () => {
		const { result } = renderHook(() => useInsecticideMutations());
		const current = {
			tradeName: 'Aqua-Reslin',
			activeIngredient: 'Permethrin',
			type: 'adulticide' as const,
			registrationNumber: '432-796',
			defaultUnitId: UNIT,
			labelUrl: null,
			msdsUrl: null,
			shorthand: null,
			metadata: null,
			isActive: true,
		};

		await firstAttempt(INSECTICIDE_SAVE_REFUSALS, (acknowledgements) =>
			result.current.save(
				RECORD,
				{ ...current, tradeName: 'Aqua-Reslin 20-20' },
				current,
				acknowledgements,
			),
		);

		expect(lastWrite().acknowledgements).toEqual({ acknowledgedHistoricalProductChange: false });
	});

	it('insecticide: and nothing when only the label links moved', async () => {
		const { result } = renderHook(() => useInsecticideMutations());
		const current = {
			tradeName: 'Aqua-Reslin',
			activeIngredient: 'Permethrin',
			type: 'adulticide' as const,
			registrationNumber: '432-796',
			defaultUnitId: UNIT,
			labelUrl: null,
			msdsUrl: null,
			shorthand: null,
			metadata: null,
			isActive: true,
		};

		await firstAttempt(INSECTICIDE_SAVE_REFUSALS, (acknowledgements) =>
			result.current.save(
				RECORD,
				{ ...current, labelUrl: 'https://example.test/label.pdf' },
				current,
				acknowledgements,
			),
		);

		expect(lastWrite().acknowledgements).toEqual({});
	});

	it('insecticide batch: only when the batch label moved', async () => {
		const { result } = renderHook(() => useInsecticideBatchMutations());
		const current = { insecticideId: RECORD, batchName: 'Lot 4', isActive: true };

		await firstAttempt(INSECTICIDE_BATCH_SAVE_REFUSALS, (acknowledgements) =>
			result.current.save(RECORD, { ...current, batchName: 'Lot 4A' }, current, acknowledgements),
		);

		expect(lastWrite().acknowledgements).toEqual({
			acknowledgedHistoricalBatchLabelChange: false,
		});
	});

	it('vehicle: only when the name moved', async () => {
		const { result } = renderHook(() => useVehicleMutations());
		const current = { name: 'Truck 3', serialNumber: null, metadata: null, isActive: true };

		await firstAttempt(VEHICLE_SAVE_REFUSALS, (acknowledgements) =>
			result.current.save(RECORD, { ...current, name: 'Truck 03' }, current, acknowledgements),
		);

		expect(lastWrite().acknowledgements).toEqual({
			acknowledgedHistoricalVehicleLabelChange: false,
		});
	});

	it('equipment: on the name or the serial number', async () => {
		const { result } = renderHook(() => useEquipmentMutations());
		const current = { name: 'ULV 1', serialNumber: 'A-1', metadata: null, isActive: true };

		await firstAttempt(EQUIPMENT_SAVE_REFUSALS, (acknowledgements) =>
			result.current.save(RECORD, { ...current, serialNumber: 'A-2' }, current, acknowledgements),
		);

		expect(lastWrite().acknowledgements).toEqual({
			acknowledgedHistoricalEquipmentLabelChange: false,
		});
	});

	it('trap: the rename, and not the code collision when nothing is being reactivated', async () => {
		const { result } = renderHook(() => useTrapMutations());
		const current = {
			trapName: 'North Levee',
			trapCode: 'NL-1',
			description: null,
			collectionMethodId: METHOD,
			collectionLureId: null,
			addressId: null,
			isActive: true,
		};

		await firstAttempt(TRAP_SAVE_REFUSALS, (acknowledgements) =>
			result.current.save(
				RECORD,
				{ ...current, trapName: 'North Levee 1' },
				current,
				null,
				acknowledgements,
			),
		);

		expect(lastWrite().acknowledgements).toEqual({ acknowledgedHistoricalLabelChange: false });
	});

	it('trap: the code collision on a create', async () => {
		const { result } = renderHook(() => useTrapMutations());

		await firstAttempt(TRAP_SAVE_REFUSALS, async (acknowledgements) => {
			await result.current.create(
				{
					trapName: 'South Levee',
					trapCode: 'NL-1',
					description: null,
					collectionMethodId: METHOD,
					collectionLureId: null,
					addressId: null,
					isActive: true,
				},
				{ type: 'Point', coordinates: [-121.49, 38.58] },
				{ lat: 38.58, lng: -121.49, geomType: 'ST_Point' },
				acknowledgements,
			);
		});

		expect(lastWrite().acknowledgements).toEqual({
			acknowledgedDuplicateTrapCode: false,
			acknowledgedHistoricalLabelChange: false,
		});
	});

	it('service request: only when the request moves to another contact', async () => {
		const { result } = renderHook(() => useServiceRequestMutations());
		const fields = {
			intakeType: 'phone' as const,
			requestDate: '2026-08-03',
			details: 'Mosquitoes out back',
			receivedByProfileId: null,
		};

		await firstAttempt(SERVICE_REQUEST_SAVE_REFUSALS, (acknowledgements) =>
			result.current.save({
				requestId: RECORD,
				fields,
				current: fields,
				contactId: OTHER,
				currentContactId: CONTACT,
				acknowledgedHistoricalContactChange:
					acknowledgements.acknowledgedHistoricalContactChange === true,
			}),
		);

		expect(lastWrite().acknowledgements).toEqual({ acknowledgedHistoricalContactChange: false });
	});

	it('notification registration: each flag rides the intent that takes it', async () => {
		const { result } = renderHook(() => useNotificationRegistrationMutations());
		const current = {
			contactId: CONTACT,
			addressId: null,
			buffer: { distance: 500, unitId: UNIT },
			flags: { hasBees: false, isNoSpray: true },
		};

		await firstAttempt(REGISTRATION_SAVE_REFUSALS, (acknowledgements) =>
			result.current.save({
				registrationId: RECORD,
				fields: { ...current, contactId: OTHER, buffer: { distance: 800, unitId: UNIT } },
				current,
				geometry: null,
				acknowledgedFutureOnlyChange: acknowledgements.acknowledgedFutureOnlyChange === true,
				acknowledgedHistoricalContactChange:
					acknowledgements.acknowledgedHistoricalContactChange === true,
			}),
		);

		expect(lastWrite().acknowledgements).toEqual({
			acknowledgedFutureOnlyChange: false,
			acknowledgedHistoricalContactChange: false,
		});
	});

	it('notification registration: unsubscribing is a future-only change too', async () => {
		const { result } = renderHook(() => useNotificationRegistrationMutations());

		await firstAttempt(REGISTRATION_SAVE_REFUSALS, (acknowledgements) =>
			result.current.unsubscribe(RECORD, acknowledgements.acknowledgedFutureOnlyChange === true),
		);

		expect(lastWrite().acknowledgements).toEqual({ acknowledgedFutureOnlyChange: false });
	});
});

describe('the writes that clear rows without deleting a record', () => {
	// `clearanceCheck` and `collisionCheck`. Neither deletes the record on
	// screen, so neither reaches the delete registry.
	it('collection: marking a zero result clears the counts already on it', async () => {
		const { result } = renderHook(() => useCollectionMutations());

		await firstAttempt(COLLECTION_ZERO_RESULT_REFUSALS, (acknowledgements) =>
			result.current.setZeroResult(RECORD, true, acknowledgements),
		);

		expect(lastWrite().acknowledgements).toEqual({ acknowledgedSpeciesCountsClearance: false });
	});

	it('chemical application: changing the product drops batches of the old one', async () => {
		const { result } = renderHook(() => useApplicationMutations());

		await firstAttempt(APPLICATION_SAVE_REFUSALS, (acknowledgements) =>
			result.current.update(application(), {
				values: { ...applicationValues(), insecticideId: OTHER },
				acknowledgements,
			}),
		);

		expect(lastWrite().acknowledgements).toEqual({ acknowledgedBatchClearance: false });
	});

	it('chemical application: and drops the flag when the product stayed put', async () => {
		const { result } = renderHook(() => useApplicationMutations());

		await firstAttempt(APPLICATION_SAVE_REFUSALS, (acknowledgements) =>
			result.current.update(application(), {
				values: { ...applicationValues(), amountApplied: 3 },
				acknowledgements,
			}),
		);

		expect(lastWrite().acknowledgements).toEqual({});
	});
});

describe('recording against a stop that is already closed', () => {
	/**
	 * The one stop flag the server answers with a count. The other four in
	 * `STOP_ACKNOWLEDGEABLE_REFUSALS` are state refusals, which repeat a
	 * condition the form already shows, so they stay silent and are not sent.
	 */
	it('sends the closed-stop flag as false and nothing else', async () => {
		const { result } = renderHook(() => useCollectionMutations());

		await firstAttempt(STOP_RECORD_REFUSALS, (acknowledgements) =>
			result.current.collect({
				collectionId: RECORD,
				collectedAt: new Date('2026-08-03T14:00:00Z'),
				assignmentItemId: STOP,
				acknowledgements,
			}),
		);

		const request = lastTransaction().request as { readonly body: Record<string, unknown> };
		expect(request.body.acknowledgedCompletedItemAdditionalRecord).toBe(false);
	});
});

describe('the weather import', () => {
	// The one surface that answers its refusals over a REST endpoint rather than
	// through a collection, so what it sends is asserted at the callback.
	it('hands the commit both import flags withheld', async () => {
		const seen: Array<Readonly<Record<string, boolean>>> = [];

		await firstAttempt(IMPORT_REFUSALS, async (acknowledgements) => {
			seen.push(acknowledgements);
		});

		expect(seen).toEqual([{ acknowledgedUpdates: false, acknowledgedPartialImport: false }]);
	});
});
