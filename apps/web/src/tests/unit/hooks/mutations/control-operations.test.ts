/** @vitest-environment jsdom */

/**
 * What a control operations write dispatches: Treatments, source reductions,
 * biocontrol releases, control requests and formulations.
 *
 * The four performed actions split every edit across two builders and the server
 * runs only the commands a write names. The field-details builder has no reader
 * for an address, so naming it alone after the address moved drops that change
 * behind a 200; naming the location command with nothing to move is refused
 * outright. `actionEditIntents` decides which it is, and nothing else asserts the
 * result.
 *
 * The `context` is the other half of the same problem. An absent one says nothing
 * about the attachment and `{ kind: 'none' }` detaches the record, so the two are
 * different requests and the tests below assert which was sent rather than only
 * that a context was.
 *
 * A Treatment create, and an edit that revises its lines, are the writes here
 * that post, because each carries its line and batch rows in the same command. It is asserted on the wire; see
 * `dispatch-harness.ts` for why the two seams are different.
 */

import { renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ActionLocation } from '../../../../hooks/mutations/performed-action-writes';
import type { BiocontrolActionValues } from '../../../../hooks/mutations/use-biocontrol-action-mutations';
import type { FormulationFields } from '../../../../hooks/mutations/use-formulation-mutations';
import type { RequestFields } from '../../../../hooks/mutations/use-requested-control-action-mutations';
import type { SourceReductionValues } from '../../../../hooks/mutations/use-source-reduction-mutations';
import type {
	TreatmentLineInput,
	TreatmentValues,
} from '../../../../hooks/mutations/use-treatment-mutations';
import type {
	BiocontrolAction,
	SourceReduction,
	TreatmentDetail,
} from '../../../../hooks/queries/control-action-view';
import { application_batches } from '../../../../lib/collections/application_batches';
import { applications } from '../../../../lib/collections/applications';
import { treatments } from '../../../../lib/collections/treatments';
import { installMemoryCollections, seedRows } from '../../lib/collections/memory-collections';

const ORGANIZATION = '11111111-1111-4111-8111-111111111111';
const PROFILE = '22222222-2222-4222-8222-222222222222';
const RECORD = '33333333-3333-4333-8333-333333333333';
const HABITAT = '44444444-4444-4444-8444-444444444444';
const INSPECTION = '55555555-5555-4555-8555-555555555555';
const UNIT = '66666666-6666-4666-8666-666666666666';
const METHOD = '77777777-7777-4777-8777-777777777777';
const OTHER = '88888888-8888-4888-8888-888888888888';
const STOP = '99999999-9999-4999-8999-999999999999';
const ADDRESS = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const INSECTICIDE = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const BATCH_A = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const BATCH_B = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const BATCH_C = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
const LINK_A = 'ffffffff-ffff-4fff-8fff-ffffffffffff';
const LINE_ONE = '13131313-1313-4313-8313-131313131313';
const LINE_TWO = '14141414-1414-4414-8414-141414141414';
const FORMULATION = '15151515-1515-4515-8515-151515151515';

vi.mock('../../../../lib/collections/mutate', async () => {
	const { recordDispatch } = await import('./dispatch-harness');
	return { mutateCollection: recordDispatch };
});
/**
 * The profile the auth snapshot has resolved, which a test can take away.
 *
 * Hoisted because `vi.mock` runs before the module body, and mutable because the
 * window this file has to cover is the one before a profile arrives.
 */
const snapshot = vi.hoisted(() => ({ profileId: null as string | null }));

vi.mock('../../../../hooks/use-auth-snapshot', async () => {
	const { signedInSnapshot } = await import('../../routes/route-mock-stand-ins');
	return { useAuthSnapshot: () => signedInSnapshot(ORGANIZATION, snapshot.profileId) };
});

const {
	commandUrl,
	dispatches,
	firstAttempt,
	lastChanges,
	lastIntents,
	lastRow,
	lastRequest,
	lastWrite,
	requests,
	resetDispatches,
	stubApi,
} = await import('./dispatch-harness');
const {
	CONTROL_ACTION_DELETE_REFUSALS,
	CONTROL_REQUEST_DELETE_REFUSALS,
	TREATMENT_DELETE_REFUSALS,
} = await import('../../../../lib/acknowledgement-copy');
const { useTreatmentMutations } = await import(
	'../../../../hooks/mutations/use-treatment-mutations'
);
const { useSourceReductionMutations } = await import(
	'../../../../hooks/mutations/use-source-reduction-mutations'
);
const { useBiocontrolActionMutations } = await import(
	'../../../../hooks/mutations/use-biocontrol-action-mutations'
);
const { useRequestedControlActionMutations } = await import(
	'../../../../hooks/mutations/use-requested-control-action-mutations'
);
const { useFormulationMutations } = await import(
	'../../../../hooks/mutations/use-formulation-mutations'
);

const SHAPE = { type: 'Point', coordinates: [-121.49, 38.58] } as const;

/** A point the user redrew this session, so the server is told where to take it from. */
const DRAWN: ActionLocation = {
	lat: 38.58,
	lng: -121.49,
	geomType: 'st_point',
	locationSource: { kind: 'geometry', geometry: SHAPE },
};

/** The same point, resolved but not redrawn — no instruction, so nothing to state. */
const UNMOVED: ActionLocation = { lat: 38.58, lng: -121.49, geomType: 'st_point' };

beforeEach(() => {
	snapshot.profileId = PROFILE;
	installMemoryCollections();
	resetDispatches();
	stubApi();
});

afterEach(() => {
	vi.unstubAllGlobals();
});

/** What every performed action carries, whichever record it is. */
function actionBase() {
	return {
		id: RECORD,
		actionDate: '2026-08-03',
		addressId: null,
		address: {
			id: undefined,
			displayName: undefined,
			addressLine1: undefined,
			addressLine2: undefined,
			locality: undefined,
			region: undefined,
			postalCode: undefined,
		},
		habitatId: null,
		inspectionId: null,
		requestedControlActionId: null,
		missionItemId: null,
		latitude: 38.58,
		longitude: -121.49,
		geometryKind: 'ST_Point',
		metadata: null,
		createdAt: new Date('2026-08-03T14:00:00Z'),
		updatedAt: new Date('2026-08-03T14:00:00Z'),
		createdByProfileId: PROFILE,
		updatedByProfileId: PROFILE,
	};
}

/** The visit's fields an edit is compared against. */
function treatmentValues(overrides: Partial<TreatmentValues> = {}): TreatmentValues {
	return {
		actionDate: '2026-08-03',
		methodId: null,
		applicatorProfileId: null,
		vehicleId: null,
		equipmentId: null,
		addressId: null,
		habitatId: null,
		metadata: null,
		...overrides,
	};
}

/** One line as the form saves it. */
function lineInput(overrides: Partial<TreatmentLineInput> = {}): TreatmentLineInput {
	return {
		id: LINE_ONE,
		insecticideId: INSECTICIDE,
		amountApplied: 2,
		unitId: UNIT,
		insecticideBatchIds: [],
		...overrides,
	};
}

/**
 * The stored Treatment an edit is diffed against.
 *
 * Written out rather than cast, because the diff is the whole point: a field the
 * fixture leaves undefined would read as moved and name a command the test did
 * not mean.
 */
function treatment(overrides: Partial<TreatmentDetail> = {}): TreatmentDetail {
	return {
		...actionBase(),
		...treatmentValues(),
		methodName: null,
		applicatorName: null,
		vehicleName: null,
		equipmentName: null,
		collectionId: null,
		formulationId: null,
		formulationName: null,
		mixAmount: null,
		mixUnitId: null,
		mixUnitAbbreviation: null,
		lines: [
			{
				id: LINE_ONE,
				insecticideId: INSECTICIDE,
				insecticideName: 'Aqua-Reslin',
				amount: 2,
				unitId: UNIT,
				unitAbbreviation: 'gal',
			},
		],
		...overrides,
	};
}

/** The stored rows a revise writes against, so its optimistic updates have something to change. */
function seedStoredTreatment(links: readonly { id: string; insecticideBatchId: string }[] = []) {
	seedRows(treatments, [{ id: RECORD }]);
	seedRows(applications, [{ id: LINE_ONE, treatment_id: RECORD }]);
	seedRows(
		application_batches,
		links.map((link) => ({
			id: link.id,
			application_id: LINE_ONE,
			insecticide_batch_id: link.insecticideBatchId,
		})),
	);
}

describe('recording a treatment', () => {
	it('posts one recordTreatment carrying every line and batch link', async () => {
		// The lines and their links name the Treatment, so they cannot be posted
		// first. One command carries all of them, and the old loop over separate
		// creates, with its partial-failure count, is gone.
		const { result } = renderHook(() => useTreatmentMutations());

		await result.current.record({
			treatmentId: RECORD,
			values: treatmentValues(),
			mix: null,
			lines: [
				lineInput({ insecticideBatchIds: [BATCH_A, BATCH_B] }),
				lineInput({ id: LINE_TWO, insecticideId: OTHER, insecticideBatchIds: [BATCH_C] }),
			],
			location: DRAWN,
			missionItemId: null,
		});

		expect(requests()).toHaveLength(1);
		expect(lastRequest().url).toBe(commandUrl('treatments'));
		expect(lastRequest().method).toBe('POST');
		expect(lastRequest().body).toMatchObject({
			intents: ['controlOperations.recordTreatment'],
			id: RECORD,
			formulation_id: null,
			locationSource: { kind: 'geometry', geometry: SHAPE },
		});
		const lines = lastRequest().body.applications as readonly {
			readonly id: string;
			readonly insecticide_id: string;
			readonly application_batches: readonly { readonly insecticide_batch_id: string }[];
		}[];
		expect(lines.map((line) => line.id)).toEqual([LINE_ONE, LINE_TWO]);
		expect(lines[0]?.application_batches.map((link) => link.insecticide_batch_id)).toEqual([
			BATCH_A,
			BATCH_B,
		]);
		expect(lines[1]?.insecticide_id).toBe(OTHER);
	});

	it('writes optimistic rows in all three collections while the command is out', async () => {
		const { result } = renderHook(() => useTreatmentMutations());

		// The rows are applied synchronously, before the request goes out.
		const saving = result.current.record({
			treatmentId: RECORD,
			values: treatmentValues(),
			mix: null,
			lines: [lineInput({ insecticideBatchIds: [BATCH_A] })],
			location: DRAWN,
			missionItemId: null,
		});

		expect(treatments().has(RECORD)).toBe(true);
		expect(applications().get(LINE_ONE)?.treatment_id).toBe(RECORD);
		expect([...application_batches().values()].map((link) => link.application_id)).toEqual([
			LINE_ONE,
		]);
		await saving;
	});

	it('sends the Formulation set whole', async () => {
		const { result } = renderHook(() => useTreatmentMutations());

		await result.current.record({
			treatmentId: RECORD,
			values: treatmentValues(),
			mix: { formulationId: FORMULATION, mixAmount: 78, mixUnitId: UNIT },
			lines: [lineInput()],
			location: DRAWN,
			missionItemId: null,
		});

		expect(lastRequest().body).toMatchObject({
			formulation_id: FORMULATION,
			mix_amount: 78,
			mix_unit_id: UNIT,
		});
	});

	it('names the mission command when the treatment closed a stop', async () => {
		const { result } = renderHook(() => useTreatmentMutations());

		await result.current.record({
			treatmentId: RECORD,
			values: treatmentValues(),
			mix: null,
			lines: [lineInput()],
			location: DRAWN,
			missionItemId: STOP,
			acknowledgements: { acknowledgedCompletedItemAdditionalRecord: false },
		});

		expect(lastRequest().body).toMatchObject({
			intents: ['missionDispatch.recordTreatmentForMissionItem'],
			mission_item_id: STOP,
			acknowledgedCompletedItemAdditionalRecord: false,
		});
	});

	it('states the attachment either way, because a create has one to state', async () => {
		const { result } = renderHook(() => useTreatmentMutations());
		const input = { mix: null, lines: [lineInput()], location: DRAWN, missionItemId: null };

		await result.current.record({ treatmentId: RECORD, values: treatmentValues(), ...input });
		expect(lastRequest().body.context).toEqual({ kind: 'none' });

		await result.current.record({
			treatmentId: OTHER,
			values: treatmentValues({ habitatId: HABITAT }),
			...input,
			lines: [lineInput({ id: LINE_TWO })],
		});
		expect(lastRequest().body.context).toEqual({ kind: 'larval', habitatId: HABITAT });
	});

	it('keeps the server-owned columns and the location instruction out when there is none', async () => {
		const { result } = renderHook(() => useTreatmentMutations());

		await result.current.record({
			treatmentId: RECORD,
			values: treatmentValues(),
			mix: null,
			lines: [lineInput()],
			location: UNMOVED,
			missionItemId: null,
		});

		const keys = Object.keys(lastRequest().body);
		expect(keys).not.toContain('locationSource');
		expect(keys).not.toContain('lat');
		expect(keys).not.toContain('updated_at');
		expect(keys).not.toContain('organization_id');
	});
});

describe('correcting a treatment', () => {
	const unchangedLines = { lines: [lineInput()], savedLinks: [] } as const;

	it('names both header commands on a PATCH that leaves the lines alone', async () => {
		const { result } = renderHook(() => useTreatmentMutations());

		await result.current.update(treatment(), {
			values: treatmentValues({ methodId: METHOD, addressId: ADDRESS }),
			mix: null,
			...unchangedLines,
			location: DRAWN,
		});

		expect(requests()).toHaveLength(0);
		expect(dispatches()).toHaveLength(1);
		expect(lastIntents()).toEqual([
			'controlOperations.updateTreatmentFieldDetails',
			'controlOperations.updateTreatmentLocationAndContext',
		]);
		expect(lastWrite().locationSource).toEqual({ kind: 'geometry', geometry: SHAPE });
	});

	it('names only the field details when the placement stood still', async () => {
		const { result } = renderHook(() => useTreatmentMutations());

		await result.current.update(treatment(), {
			values: treatmentValues({ methodId: METHOD }),
			mix: null,
			...unchangedLines,
		});

		expect(lastIntents()).toEqual(['controlOperations.updateTreatmentFieldDetails']);
		expect(lastChanges().application_method_id).toBe(METHOD);
		expect(Object.keys(lastChanges())).not.toContain('address_id');
	});

	it('clears the Formulation set whole when the crew switched to product by product', async () => {
		const { result } = renderHook(() => useTreatmentMutations());

		await result.current.update(
			treatment({ formulationId: FORMULATION, mixAmount: 78, mixUnitId: UNIT }),
			{ values: treatmentValues(), mix: null, ...unchangedLines },
		);

		expect(lastIntents()).toEqual(['controlOperations.updateTreatmentFieldDetails']);
		expect(lastChanges()).toMatchObject({
			formulation_id: null,
			mix_amount: null,
			mix_unit_id: null,
		});
	});

	it('carries the inspection through a habitat change', async () => {
		const { result } = renderHook(() => useTreatmentMutations());

		await result.current.update(treatment({ habitatId: HABITAT, inspectionId: INSPECTION }), {
			values: treatmentValues({ habitatId: OTHER }),
			mix: null,
			...unchangedLines,
		});

		expect(lastIntents()).toEqual(['controlOperations.updateTreatmentLocationAndContext']);
		expect(lastWrite().context).toEqual({
			kind: 'larval',
			habitatId: OTHER,
			inspectionId: INSPECTION,
		});
	});

	it('sends nothing when the form was saved untouched', async () => {
		const { result } = renderHook(() => useTreatmentMutations());

		await result.current.update(treatment(), {
			values: treatmentValues(),
			mix: null,
			...unchangedLines,
		});

		expect(dispatches()).toHaveLength(0);
		expect(requests()).toHaveLength(0);
	});

	it('sends one PATCH naming the header intents beside reviseTreatmentLines', async () => {
		// The lines and the header are confirmed together, so the save is one
		// request rather than a header write and a line write.
		seedStoredTreatment();
		const { result } = renderHook(() => useTreatmentMutations());

		await result.current.update(treatment(), {
			values: treatmentValues({ methodId: METHOD }),
			mix: null,
			lines: [lineInput({ amountApplied: 3 }), lineInput({ id: LINE_TWO, insecticideId: OTHER })],
			savedLinks: [],
		});

		expect(dispatches()).toHaveLength(0);
		expect(requests()).toHaveLength(1);
		expect(lastRequest().url).toBe(commandUrl('treatments', RECORD));
		expect(lastRequest().method).toBe('PATCH');
		expect(lastRequest().body).toMatchObject({
			intents: [
				'controlOperations.updateTreatmentFieldDetails',
				'controlOperations.reviseTreatmentLines',
			],
			application_method_id: METHOD,
		});
		const lines = lastRequest().body.applications as readonly { readonly id: string }[];
		expect(lines.map((line) => line.id)).toEqual([LINE_ONE, LINE_TWO]);
	});

	it('names only the revise when the lines alone moved, keeping a kept lot on its link', async () => {
		seedStoredTreatment([{ id: LINK_A, insecticideBatchId: BATCH_A }]);
		const { result } = renderHook(() => useTreatmentMutations());

		await result.current.update(treatment(), {
			values: treatmentValues(),
			mix: null,
			lines: [lineInput({ insecticideBatchIds: [BATCH_A, BATCH_B] })],
			savedLinks: [{ id: LINK_A, applicationId: LINE_ONE, insecticideBatchId: BATCH_A }],
		});

		expect(lastRequest().body.intents).toEqual(['controlOperations.reviseTreatmentLines']);
		const [only] = lastRequest().body.applications as readonly {
			readonly application_batches: readonly {
				readonly id: string;
				readonly insecticide_batch_id: string;
			}[];
		}[];
		expect(only?.application_batches[0]).toEqual({ id: LINK_A, insecticide_batch_id: BATCH_A });
		expect(only?.application_batches[1]?.id).not.toBe(LINK_A);
	});

	it('leaves a removed line out of the set', async () => {
		seedStoredTreatment([{ id: LINK_A, insecticideBatchId: BATCH_A }]);
		const { result } = renderHook(() => useTreatmentMutations());

		await result.current.update(treatment(), {
			values: treatmentValues(),
			mix: null,
			lines: [lineInput({ id: LINE_TWO, insecticideId: OTHER })],
			savedLinks: [{ id: LINK_A, applicationId: LINE_ONE, insecticideBatchId: BATCH_A }],
		});

		const lines = lastRequest().body.applications as readonly { readonly id: string }[];
		expect(lines.map((line) => line.id)).toEqual([LINE_TWO]);
	});

	it('names the delete and withholds the batch and support flags', async () => {
		// deleteRegistry. A Treatment's lines go with it unasked; the batch links and
		// support records are what the registry counts while the flags are false.
		const { result } = renderHook(() => useTreatmentMutations());

		await firstAttempt(TREATMENT_DELETE_REFUSALS, (acknowledgements) =>
			result.current.remove(RECORD, acknowledgements),
		);

		expect(lastIntents()).toEqual(['controlOperations.deleteTreatment']);
		expect(lastWrite().acknowledgements).toEqual({
			acknowledgedBatchDeletion: false,
			acknowledgedSupportRecordDeletion: false,
		});
	});
});

/** What a source reduction form collects. */
function sourceReductionValues(
	overrides: Partial<SourceReductionValues> = {},
): SourceReductionValues {
	return {
		methodId: METHOD,
		technicianProfileId: null,
		actionDate: '2026-08-03',
		addressId: null,
		habitatId: null,
		sourcesEliminated: 4,
		unitId: UNIT,
		metadata: null,
		...overrides,
	};
}

/** The stored row an edit is diffed against — written out, as the application is. */
function sourceReduction(overrides: Partial<SourceReduction> = {}): SourceReduction {
	return {
		...actionBase(),
		...sourceReductionValues(),
		methodName: 'Ditch clearing',
		technicianName: null,
		unitAbbreviation: null,
		...overrides,
	};
}

describe('recording a source reduction', () => {
	it('reads the mission stop for which create it is', async () => {
		const { result } = renderHook(() => useSourceReductionMutations());

		await result.current.record({
			sourceReductionId: RECORD,
			values: sourceReductionValues(),
			location: DRAWN,
			missionItemId: null,
		});
		expect(lastIntents()).toEqual(['controlOperations.recordSourceReduction']);

		await result.current.record({
			sourceReductionId: RECORD,
			values: sourceReductionValues(),
			location: DRAWN,
			missionItemId: STOP,
			acknowledgements: { acknowledgedCompletedItemAdditionalRecord: false },
		});
		expect(lastIntents()).toEqual(['missionDispatch.recordSourceReductionForMissionItem']);
		expect(lastWrite().acknowledgements).toEqual({
			acknowledgedCompletedItemAdditionalRecord: false,
		});
	});

	it('states the drawn point and the attachment beside the row', async () => {
		const { result } = renderHook(() => useSourceReductionMutations());

		await result.current.record({
			sourceReductionId: RECORD,
			values: sourceReductionValues({ habitatId: HABITAT }),
			location: DRAWN,
			missionItemId: null,
		});

		expect(lastWrite().locationSource).toEqual({ kind: 'geometry', geometry: SHAPE });
		expect(lastWrite().context).toEqual({ kind: 'larval', habitatId: HABITAT });
		expect(lastRow().lat).toBe(38.58);
	});

	it('leaves the location instruction out when the form resolved no source', async () => {
		const { result } = renderHook(() => useSourceReductionMutations());

		await result.current.record({
			sourceReductionId: RECORD,
			values: sourceReductionValues(),
			location: UNMOVED,
			missionItemId: null,
		});

		expect(lastWrite().locationSource).toBeUndefined();
		expect(lastWrite().context).toEqual({ kind: 'none' });
	});
});

describe('correcting a source reduction', () => {
	it('names both commands when the field details and the placement both moved', async () => {
		const { result } = renderHook(() => useSourceReductionMutations());

		await result.current.update(sourceReduction(), {
			values: sourceReductionValues({ sourcesEliminated: 9, addressId: ADDRESS }),
			location: DRAWN,
		});

		expect(dispatches()).toHaveLength(1);
		expect(lastIntents()).toEqual([
			'controlOperations.updateSourceReductionFieldDetails',
			'controlOperations.updateSourceReductionLocationAndContext',
		]);
	});

	it('names only the one that moved', async () => {
		const { result } = renderHook(() => useSourceReductionMutations());

		await result.current.update(sourceReduction(), {
			values: sourceReductionValues({ sourcesEliminated: 9 }),
		});
		expect(lastIntents()).toEqual(['controlOperations.updateSourceReductionFieldDetails']);
		expect(lastWrite().locationSource).toBeUndefined();

		await result.current.update(sourceReduction(), {
			values: sourceReductionValues({ addressId: ADDRESS }),
		});
		expect(lastIntents()).toEqual(['controlOperations.updateSourceReductionLocationAndContext']);
		expect(Object.keys(lastChanges())).not.toContain('sources_eliminated_amount');
	});

	it('names the location command for a redrawn point alone', async () => {
		const { result } = renderHook(() => useSourceReductionMutations());

		await result.current.update(sourceReduction(), {
			values: sourceReductionValues(),
			location: DRAWN,
		});

		expect(lastIntents()).toEqual(['controlOperations.updateSourceReductionLocationAndContext']);
		expect(lastWrite().locationSource).toEqual({ kind: 'geometry', geometry: SHAPE });
		expect(lastChanges().lat).toBe(38.58);
	});

	it('reads a rewritten custom field bag by its contents, not its identity', async () => {
		// `metadata` is arbitrary JSON with no known keys, so the comparison is
		// structural. A form that rebuilds the bag on every render would otherwise
		// name a command on every save.
		const { result } = renderHook(() => useSourceReductionMutations());

		await result.current.update(sourceReduction({ metadata: { crew: 2 } }), {
			values: sourceReductionValues({ metadata: { crew: 2 } }),
		});
		expect(dispatches()).toHaveLength(0);

		await result.current.update(sourceReduction({ metadata: { crew: 2 } }), {
			values: sourceReductionValues({ metadata: { crew: 3 } }),
		});
		expect(lastIntents()).toEqual(['controlOperations.updateSourceReductionFieldDetails']);
	});

	it('carries the inspection through a habitat change', async () => {
		const { result } = renderHook(() => useSourceReductionMutations());

		await result.current.update(sourceReduction({ habitatId: HABITAT, inspectionId: INSPECTION }), {
			values: sourceReductionValues({ habitatId: OTHER }),
		});

		expect(lastWrite().context).toEqual({
			kind: 'larval',
			habitatId: OTHER,
			inspectionId: INSPECTION,
		});
	});

	it('dispatches nothing when the form was saved untouched', async () => {
		const { result } = renderHook(() => useSourceReductionMutations());

		await result.current.update(sourceReduction(), { values: sourceReductionValues() });

		expect(dispatches()).toHaveLength(0);
	});

	it('names the delete and withholds the flag over its notes and crew', async () => {
		const { result } = renderHook(() => useSourceReductionMutations());

		await firstAttempt(CONTROL_ACTION_DELETE_REFUSALS, (acknowledgements) =>
			result.current.remove(RECORD, acknowledgements),
		);

		expect(lastIntents()).toEqual(['controlOperations.deleteSourceReduction']);
		expect(lastWrite().acknowledgements).toEqual({ acknowledgedSupportRecordDeletion: false });
	});
});

/** What a biocontrol form collects. */
function biocontrolValues(overrides: Partial<BiocontrolActionValues> = {}): BiocontrolActionValues {
	return {
		methodId: METHOD,
		technicianProfileId: null,
		actionDate: '2026-08-03',
		addressId: null,
		habitatId: null,
		amountReleased: 500,
		unitId: UNIT,
		metadata: null,
		...overrides,
	};
}

/** The stored row an edit is diffed against. */
function biocontrolAction(overrides: Partial<BiocontrolAction> = {}): BiocontrolAction {
	return {
		...actionBase(),
		...biocontrolValues(),
		methodName: 'Mosquitofish stocking',
		technicianName: null,
		unitAbbreviation: null,
		...overrides,
	};
}

describe('recording a biocontrol release', () => {
	it('reads the mission stop for which create it is', async () => {
		const { result } = renderHook(() => useBiocontrolActionMutations());

		await result.current.record({
			biocontrolActionId: RECORD,
			values: biocontrolValues(),
			location: DRAWN,
			missionItemId: null,
		});
		expect(lastIntents()).toEqual(['controlOperations.recordBiocontrolAction']);

		await result.current.record({
			biocontrolActionId: RECORD,
			values: biocontrolValues(),
			location: DRAWN,
			missionItemId: STOP,
		});
		expect(lastIntents()).toEqual(['missionDispatch.recordBiocontrolActionForMissionItem']);
		expect(lastRow().mission_item_id).toBe(STOP);
	});

	it('states the drawn shape and the attachment beside the row', async () => {
		const { result } = renderHook(() => useBiocontrolActionMutations());

		await result.current.record({
			biocontrolActionId: RECORD,
			values: biocontrolValues({ habitatId: HABITAT }),
			location: DRAWN,
			missionItemId: null,
		});

		expect(lastWrite().locationSource).toEqual({ kind: 'geometry', geometry: SHAPE });
		expect(lastWrite().context).toEqual({ kind: 'larval', habitatId: HABITAT });
	});

	it('states no attachment as a context rather than leaving it out', async () => {
		const { result } = renderHook(() => useBiocontrolActionMutations());

		await result.current.record({
			biocontrolActionId: RECORD,
			values: biocontrolValues(),
			location: UNMOVED,
			missionItemId: null,
		});

		expect(lastWrite().context).toEqual({ kind: 'none' });
		expect(lastWrite().locationSource).toBeUndefined();
	});
});

describe('correcting a biocontrol release', () => {
	it('names both commands when the field details and the placement both moved', async () => {
		const { result } = renderHook(() => useBiocontrolActionMutations());

		await result.current.update(biocontrolAction(), {
			values: biocontrolValues({ amountReleased: 900, addressId: ADDRESS }),
			location: DRAWN,
		});

		expect(dispatches()).toHaveLength(1);
		expect(lastIntents()).toEqual([
			'controlOperations.updateBiocontrolActionFieldDetails',
			'controlOperations.updateBiocontrolActionLocationAndContext',
		]);
		expect(lastWrite().locationSource).toEqual({ kind: 'geometry', geometry: SHAPE });
	});

	it('names only the one that moved', async () => {
		const { result } = renderHook(() => useBiocontrolActionMutations());

		await result.current.update(biocontrolAction(), {
			values: biocontrolValues({ amountReleased: 900 }),
		});
		expect(lastIntents()).toEqual(['controlOperations.updateBiocontrolActionFieldDetails']);
		expect(lastChanges().amount_released).toBe(900);
		expect(lastWrite().locationSource).toBeUndefined();
		expect(lastWrite().context).toBeUndefined();

		await result.current.update(biocontrolAction(), {
			values: biocontrolValues({ addressId: ADDRESS }),
		});
		expect(lastIntents()).toEqual(['controlOperations.updateBiocontrolActionLocationAndContext']);
		expect(Object.keys(lastChanges())).not.toContain('amount_released');
	});

	it('carries the inspection through a habitat change', async () => {
		const { result } = renderHook(() => useBiocontrolActionMutations());

		await result.current.update(
			biocontrolAction({ habitatId: HABITAT, inspectionId: INSPECTION }),
			{ values: biocontrolValues({ habitatId: null }) },
		);

		expect(lastWrite().context).toEqual({ kind: 'larval', inspectionId: INSPECTION });
	});

	it('dispatches nothing when the form was saved untouched', async () => {
		const { result } = renderHook(() => useBiocontrolActionMutations());

		await result.current.update(biocontrolAction(), { values: biocontrolValues() });

		expect(dispatches()).toHaveLength(0);
	});

	it('names the delete and withholds the flag over its notes and crew', async () => {
		const { result } = renderHook(() => useBiocontrolActionMutations());

		await firstAttempt(CONTROL_ACTION_DELETE_REFUSALS, (acknowledgements) =>
			result.current.remove(RECORD, acknowledgements),
		);

		expect(lastIntents()).toEqual(['controlOperations.deleteBiocontrolAction']);
		expect(lastWrite().acknowledgements).toEqual({ acknowledgedSupportRecordDeletion: false });
	});
});

/** What a request form holds. */
function requestFields(overrides: Partial<RequestFields> = {}): RequestFields {
	return {
		controlType: 'source_reduction',
		summary: 'Standing water behind the levee.',
		recommendedMethodId: null,
		addressId: null,
		habitatId: null,
		...overrides,
	};
}

describe('a request for control', () => {
	it('names the create and seeds the pin from the shape it was drawn at', async () => {
		const { result } = renderHook(() => useRequestedControlActionMutations());

		await result.current.create(RECORD, requestFields({ habitatId: HABITAT }), SHAPE);

		expect(lastIntents()).toEqual(['controlOperations.requestControlAction']);
		expect(lastWrite().locationSource).toEqual({ kind: 'geometry', geometry: SHAPE });
		expect(lastWrite().context).toEqual({ kind: 'larval', habitatId: HABITAT });
		expect(lastRow().lat).toBe(38.58);
		expect(lastRow().geom_type).toBe('st_point');
	});

	it('names only the details command when the summary was reworded', async () => {
		const { result } = renderHook(() => useRequestedControlActionMutations());

		await result.current.update(
			RECORD,
			requestFields({ summary: 'Levee drained.' }),
			requestFields(),
			null,
		);

		expect(lastIntents()).toEqual(['controlOperations.updateRequestedControlActionDetails']);
		expect(lastChanges().summary).toBe('Levee drained.');
		expect(lastWrite().locationSource).toBeUndefined();
		expect(lastWrite().context).toBeUndefined();
	});

	it('names the location command for a redrawn shape and states where it came from', async () => {
		const { result } = renderHook(() => useRequestedControlActionMutations());

		await result.current.update(RECORD, requestFields(), requestFields(), SHAPE);

		expect(lastIntents()).toEqual([
			'controlOperations.updateRequestedControlActionLocationAndContext',
		]);
		expect(lastWrite().locationSource).toEqual({ kind: 'geometry', geometry: SHAPE });
		expect(lastChanges().lat).toBe(38.58);
	});

	it('leaves the shape out when only the address moved', async () => {
		// The server re-resolves `geom` from whatever source it is handed, so
		// re-sending an unchanged shape is a write with no edit behind it.
		const { result } = renderHook(() => useRequestedControlActionMutations());

		await result.current.update(
			RECORD,
			requestFields({ addressId: ADDRESS }),
			requestFields(),
			null,
		);

		expect(lastIntents()).toEqual([
			'controlOperations.updateRequestedControlActionLocationAndContext',
		]);
		expect(lastWrite().locationSource).toBeUndefined();
		expect(Object.keys(lastChanges())).not.toContain('lat');
	});

	it('states the context only when the larval site moved', async () => {
		const { result } = renderHook(() => useRequestedControlActionMutations());

		await result.current.update(
			RECORD,
			requestFields({ habitatId: HABITAT }),
			requestFields(),
			null,
		);
		expect(lastWrite().context).toEqual({ kind: 'larval', habitatId: HABITAT });
		expect(lastChanges().habitat_id).toBe(HABITAT);

		await result.current.update(
			RECORD,
			requestFields({ addressId: ADDRESS }),
			requestFields(),
			null,
		);
		expect(lastWrite().context).toBeUndefined();
		expect(Object.keys(lastChanges())).not.toContain('habitat_id');
	});

	it('names both commands over one body when both halves moved', async () => {
		// Two writes to one key would merge and keep only the last `metadata`, so
		// the details would travel under the location command's name.
		const { result } = renderHook(() => useRequestedControlActionMutations());

		await result.current.update(
			RECORD,
			requestFields({ summary: 'Levee drained.', habitatId: HABITAT }),
			requestFields(),
			SHAPE,
		);

		expect(dispatches()).toHaveLength(1);
		expect(lastIntents()).toEqual([
			'controlOperations.updateRequestedControlActionDetails',
			'controlOperations.updateRequestedControlActionLocationAndContext',
		]);
	});

	it('dispatches nothing when the form was saved untouched', async () => {
		const { result } = renderHook(() => useRequestedControlActionMutations());

		await result.current.update(RECORD, requestFields(), requestFields(), null);

		expect(dispatches()).toHaveLength(0);
	});

	it('names closing out and picking back up as their own commands', async () => {
		// The old endpoint folded both into one payload and read the direction off
		// two keys, so clearing the date reopened the request.
		const { result } = renderHook(() => useRequestedControlActionMutations());

		await result.current.resolve(RECORD);
		expect(lastIntents()).toEqual(['controlOperations.resolveRequestedControlAction']);
		expect(lastChanges().resolved_at).toBeInstanceOf(Date);
		expect(lastChanges().resolved_by_profile_id).toBe(PROFILE);

		await result.current.reopen(RECORD);
		expect(lastIntents()).toEqual(['controlOperations.reopenRequestedControlAction']);
		expect(lastChanges().resolved_at).toBeNull();
		expect(lastChanges().resolved_by_profile_id).toBeNull();
	});

	it('refuses raising, editing and closing out while the profile is still resolving', async () => {
		// The requester is the domain answer to who asked for the control action, not
		// a stamp the server fills in, so a write sent before the profile arrives
		// stores a null nothing later replaces. Refusing before the dispatch is what
		// keeps an optimistic row off the screen as well as off the wire.
		snapshot.profileId = null;
		const { result } = renderHook(() => useRequestedControlActionMutations());

		await expect(result.current.create(RECORD, requestFields(), SHAPE)).rejects.toThrow(
			'Your profile is still loading.',
		);
		await expect(
			result.current.update(
				RECORD,
				requestFields({ summary: 'Levee drained.' }),
				requestFields(),
				null,
			),
		).rejects.toThrow('Your profile is still loading.');
		await expect(result.current.resolve(RECORD)).rejects.toThrow('Your profile is still loading.');

		expect(dispatches()).toHaveLength(0);
		expect(requests()).toHaveLength(0);
	});

	it('names the delete and withholds both detach flags', async () => {
		const { result } = renderHook(() => useRequestedControlActionMutations());

		await firstAttempt(CONTROL_REQUEST_DELETE_REFUSALS, (acknowledgements) =>
			result.current.remove(RECORD, acknowledgements),
		);

		expect(lastIntents()).toEqual(['controlOperations.deleteRequestedControlAction']);
		expect(lastWrite().acknowledgements).toEqual({
			acknowledgedActionDetach: false,
			acknowledgedMissionDetach: false,
		});
	});
});

/** A recipe as its drawer holds one. */
function formulationFields(overrides: Partial<FormulationFields> = {}): FormulationFields {
	return {
		formulationName: 'Summer adulticide mix',
		description: null,
		batchSize: 100,
		batchUnitId: UNIT,
		isActive: true,
		...overrides,
	};
}

describe('a formulation write', () => {
	it('names the deactivation alongside the create when the dialog left it off', async () => {
		// A recipe with nothing in it cannot be mixed, so a new inactive one says so
		// rather than being written active and flicking back.
		const { result } = renderHook(() => useFormulationMutations());

		await result.current.create(formulationFields());
		expect(lastIntents()).toEqual(['controlOperations.createFormulation']);

		await result.current.create(formulationFields({ isActive: false }));
		expect(lastIntents()).toEqual([
			'controlOperations.createFormulation',
			'controlOperations.deactivateFormulation',
		]);
	});

	it('names only the details command when the recipe was renamed', async () => {
		const { result } = renderHook(() => useFormulationMutations());

		await result.current.save(
			RECORD,
			formulationFields({ formulationName: 'Winter mix' }),
			formulationFields(),
		);

		expect(lastIntents()).toEqual(['controlOperations.updateFormulationDetails']);
		expect(lastChanges().formulation_name).toBe('Winter mix');
	});

	it('reads the service switch on a save for its direction', async () => {
		// `activate` rather than `reactivate`: emptying a recipe deactivates it, so
		// turning one back on is not always undoing a person's decision.
		const { result } = renderHook(() => useFormulationMutations());

		await result.current.save(RECORD, formulationFields({ isActive: false }), formulationFields());
		expect(lastIntents()).toEqual(['controlOperations.deactivateFormulation']);

		await result.current.save(RECORD, formulationFields(), formulationFields({ isActive: false }));
		expect(lastIntents()).toEqual(['controlOperations.activateFormulation']);
	});

	it('names both when the details and the switch moved together', async () => {
		const { result } = renderHook(() => useFormulationMutations());

		await result.current.save(
			RECORD,
			formulationFields({ batchSize: 250, isActive: false }),
			formulationFields(),
		);

		expect(lastIntents()).toEqual([
			'controlOperations.updateFormulationDetails',
			'controlOperations.deactivateFormulation',
		]);
		expect(lastChanges().batch_size).toBe(250);
	});

	it('dispatches nothing when the drawer was saved untouched', async () => {
		const { result } = renderHook(() => useFormulationMutations());

		await result.current.save(RECORD, formulationFields(), formulationFields());

		expect(dispatches()).toHaveLength(0);
	});

	it('reads the switch on its own for its direction', async () => {
		const { result } = renderHook(() => useFormulationMutations());

		await result.current.setActive(RECORD, false);
		expect(lastIntents()).toEqual(['controlOperations.deactivateFormulation']);
		expect(lastChanges().is_active).toBe(false);

		await result.current.setActive(RECORD, true);
		expect(lastIntents()).toEqual(['controlOperations.activateFormulation']);
		expect(lastChanges().is_active).toBe(true);
	});

	it('answers the component deletion where the dialog asked it', async () => {
		const { result } = renderHook(() => useFormulationMutations());

		await result.current.remove(RECORD);

		expect(lastIntents()).toEqual(['controlOperations.deleteFormulation']);
		expect(lastWrite().acknowledgements).toEqual({ acknowledgedComponentDeletion: true });
	});
});

describe('a formulation component write', () => {
	it('names the add and carries the amount it takes', async () => {
		const { result } = renderHook(() => useFormulationMutations());

		await result.current.addComponent(RECORD, {
			insecticideId: INSECTICIDE,
			amount: 3,
			unitId: UNIT,
		});

		expect(lastIntents()).toEqual(['controlOperations.addFormulationInsecticide']);
		expect(lastRow().formulation_id).toBe(RECORD);
		expect(lastRow().amount).toBe(3);
	});

	it('answers the empty-recipe deactivation on the edit as well as the removal', async () => {
		// Changing a component's product or amount can leave the recipe with
		// nothing in it, just as removing it can.
		const { result } = renderHook(() => useFormulationMutations());

		await result.current.saveComponent(RECORD, {
			insecticideId: OTHER,
			amount: 5,
			unitId: UNIT,
		});
		expect(lastIntents()).toEqual(['controlOperations.updateFormulationInsecticide']);
		expect(lastChanges().insecticide_id).toBe(OTHER);
		expect(lastWrite().acknowledgements).toEqual({ acknowledgedDeactivateEmptyFormulation: true });

		await result.current.removeComponent(RECORD);
		expect(lastIntents()).toEqual(['controlOperations.removeFormulationInsecticide']);
		expect(lastWrite().acknowledgements).toEqual({ acknowledgedDeactivateEmptyFormulation: true });
	});
});
