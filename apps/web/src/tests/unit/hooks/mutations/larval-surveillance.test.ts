/** @vitest-environment jsdom */

/**
 * What a larval write dispatches: habitats, inspections, samples and counts.
 *
 * The commands are named by the hook and authorized by name before any builder
 * runs, so the name is the part that decides whether a save works. Nothing else
 * in this app asserts it. `habitatUpdatePlan` is tested on its own, but the ten
 * lines that hand its result to `mutateCollection` are where a location source
 * or an acknowledgement goes missing.
 *
 * The stop recording is the one write here that posts, so it is asserted on the
 * wire rather than at the handoff. See `dispatch-harness.ts` for why the two
 * seams are different.
 */

import { renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { installMemoryCollections, seedRows } from '../../lib/collections/memory-collections';

const ORGANIZATION = '11111111-1111-4111-8111-111111111111';
const PROFILE = '22222222-2222-4222-8222-222222222222';
const RECORD = '33333333-3333-4333-8333-333333333333';
const HABITAT = '44444444-4444-4444-8444-444444444444';
const STOP = '55555555-5555-4555-8555-555555555555';
const SPECIES = '66666666-6666-4666-8666-666666666666';

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
const { assignment_items } = await import('../../../../lib/collections/assignment_items');
const { HABITAT_DELETE_REFUSALS, INSPECTION_DELETE_REFUSALS, SAMPLE_DELETE_REFUSALS } =
	await import('../../../../lib/acknowledgement-copy');
const { useHabitatMutations } = await import('../../../../hooks/mutations/use-habitat-mutations');
const { useInspectionMutations } = await import(
	'../../../../hooks/mutations/use-inspection-mutations'
);
const { useSampleMutations } = await import('../../../../hooks/mutations/use-sample-mutations');
const { useSampleSpeciesMutations } = await import(
	'../../../../hooks/mutations/use-sample-species-mutations'
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

function habitatFields(overrides: Record<string, unknown> = {}) {
	return {
		habitatName: 'North basin',
		description: 'Roadside catch basin.',
		addressId: null,
		habitatTypeId: 'catch-basin',
		metadata: null,
		...overrides,
	};
}

describe('a habitat write', () => {
	it('names the create and carries the drawn shape beside the row', async () => {
		const { result } = renderHook(() => useHabitatMutations());

		await result.current.create(habitatFields(), SHAPE, CENTROID);

		expect(lastIntents()).toEqual(['larvalSurveillance.createHabitat']);
		expect(lastWrite().locationSource).toEqual({ kind: 'geometry', geometry: SHAPE });
	});

	it('names every command the edit means, in one write', async () => {
		const { result } = renderHook(() => useHabitatMutations());

		await result.current.save(
			RECORD,
			habitatFields({ description: 'Silted over.', addressId: 'address-1' }),
			habitatFields(),
			{ geometry: SHAPE, centroid: CENTROID },
		);

		expect(dispatches()).toHaveLength(1);
		expect(lastIntents()).toEqual([
			'larvalSurveillance.updateHabitatDetails',
			'larvalSurveillance.updateHabitatConfiguration',
			'larvalSurveillance.updateHabitatLocation',
		]);
	});

	it('leaves the shape out of an edit that did not touch the map', async () => {
		// #427: the location command sits at the manager floor and the details
		// command at the collector floor, so a shape on a description edit is a
		// refusal rather than a wasted key.
		const { result } = renderHook(() => useHabitatMutations());

		await result.current.save(
			RECORD,
			habitatFields({ description: 'Silted over.' }),
			habitatFields(),
			null,
		);

		expect(lastIntents()).toEqual(['larvalSurveillance.updateHabitatDetails']);
		expect(lastWrite().locationSource).toBeUndefined();
	});

	it('dispatches nothing when the form was saved untouched', async () => {
		const { result } = renderHook(() => useHabitatMutations());

		await result.current.save(RECORD, habitatFields(), habitatFields(), null);

		expect(dispatches()).toHaveLength(0);
	});

	it('reads the accessibility switch for its direction', async () => {
		const { result } = renderHook(() => useHabitatMutations());

		await result.current.setInaccessible(RECORD, true);
		expect(lastIntents()).toEqual(['larvalSurveillance.markHabitatInaccessible']);
		expect(lastChanges().is_inaccessible).toBe(true);

		await result.current.setInaccessible(RECORD, false);
		expect(lastIntents()).toEqual(['larvalSurveillance.clearHabitatInaccessible']);
		expect(lastChanges().is_inaccessible).toBe(false);
	});

	it('reads the service switch for its direction', async () => {
		const { result } = renderHook(() => useHabitatMutations());

		await result.current.setActive(RECORD, false);
		expect(lastIntents()).toEqual(['larvalSurveillance.retireHabitat']);

		await result.current.setActive(RECORD, true);
		expect(lastIntents()).toEqual(['larvalSurveillance.reactivateHabitat']);
	});

	it('names the delete and withholds both detach flags on the first attempt', async () => {
		// deleteRegistry. Deleting a habitat keeps its inspections and the control
		// work recorded against it, and clears the link to the habitat from both.
		// The registry counts those rows and refuses; withholding the flags is what
		// makes it count them at all.
		const { result } = renderHook(() => useHabitatMutations());

		await firstAttempt(HABITAT_DELETE_REFUSALS, (acknowledgements) =>
			result.current.remove(RECORD, acknowledgements),
		);

		expect(lastIntents()).toEqual(['larvalSurveillance.deleteHabitat']);
		expect(lastWrite().acknowledgements).toEqual({
			acknowledgedInspectionDetach: false,
			acknowledgedCrossDomainDetach: false,
		});
	});
});

function inspectionResult(overrides: Record<string, unknown> = {}) {
	return {
		inspectionDate: '2026-08-03',
		inspectedByProfileId: PROFILE,
		isWet: true,
		dipCount: 4,
		density: null,
		larvaeCount: null,
		hasEggs: false,
		hasFirstInstar: false,
		hasSecondInstar: false,
		hasThirdInstar: false,
		hasFourthInstar: false,
		hasPupae: false,
		...overrides,
	} as never;
}

describe('an inspection write', () => {
	it('names the habitat recording and sends no shape, because the habitat holds one', async () => {
		const { result } = renderHook(() => useInspectionMutations());

		await result.current.record({
			inspectionId: RECORD,
			result: inspectionResult(),
			placement: { kind: 'habitat', habitatId: HABITAT },
			centroid: CENTROID,
		});

		expect(lastIntents()).toEqual(['larvalSurveillance.recordHabitatInspection']);
		expect(lastWrite().locationSource).toBeUndefined();
	});

	it('names the ad hoc recording and carries the shape it was drawn at', async () => {
		const { result } = renderHook(() => useInspectionMutations());

		await result.current.record({
			inspectionId: RECORD,
			result: inspectionResult(),
			placement: { kind: 'adhoc', geometry: SHAPE, addressId: null, habitatTypeId: null },
			centroid: CENTROID,
		});

		expect(lastIntents()).toEqual(['larvalSurveillance.recordAdHocInspection']);
		expect(lastWrite().locationSource).toEqual({ kind: 'geometry', geometry: SHAPE });
	});

	it('posts the stop recording as one request naming the stop it closes', async () => {
		// ADR 0012. Without `assignment_item_id` the server takes the ordinary
		// branch, answers 201, and sync drops the closed stop a moment later with
		// nothing thrown.
		seedRows(assignment_items, [{ id: STOP }]);
		const { result } = renderHook(() => useInspectionMutations());

		await result.current.record({
			inspectionId: RECORD,
			result: inspectionResult(),
			placement: { kind: 'stop', assignmentItemId: STOP, habitatId: HABITAT },
			centroid: CENTROID,
			acknowledgements: { acknowledgedCompletedItemAdditionalRecord: false },
		});

		expect(requests()).toHaveLength(1);
		expect(lastRequest().url).toBe(commandUrl('inspections'));
		expect(lastRequest().method).toBe('POST');
		expect(lastRequest().body).toMatchObject({
			intents: ['fieldWork.recordHabitatInspectionForAssignmentItem'],
			id: RECORD,
			assignment_item_id: STOP,
			habitat_id: HABITAT,
			acknowledgedCompletedItemAdditionalRecord: false,
		});
	});

	it('keeps the server-owned columns out of the posted body', async () => {
		// The centroid is snapshotted from the habitat at commit and the stamps are
		// the server's, so a client value for any of them reads as an intention.
		seedRows(assignment_items, [{ id: STOP }]);
		const { result } = renderHook(() => useInspectionMutations());

		await result.current.record({
			inspectionId: RECORD,
			result: inspectionResult(),
			placement: { kind: 'stop', assignmentItemId: STOP, habitatId: null },
			centroid: CENTROID,
			acknowledgements: {},
		});

		expect(Object.keys(lastRequest().body)).not.toContain('lat');
		expect(Object.keys(lastRequest().body)).not.toContain('updated_at');
		expect(Object.keys(lastRequest().body)).not.toContain('organization_id');
	});

	it('names both commands when the result and the ad hoc placement both moved', async () => {
		const { result } = renderHook(() => useInspectionMutations());

		await result.current.save({
			inspectionId: RECORD,
			result: inspectionResult({ dipCount: 6 }),
			current: inspectionResult(),
			adhoc: {
				next: { geometry: SHAPE, addressId: 'address-1', habitatTypeId: null },
				current: { geometry: null, addressId: null, habitatTypeId: null },
			},
			centroid: CENTROID,
		});

		expect(lastIntents()).toEqual([
			'larvalSurveillance.updateInspectionFieldDetails',
			'larvalSurveillance.updateAdHocInspectionLocation',
		]);
		expect(lastWrite().locationSource).toEqual({ kind: 'geometry', geometry: SHAPE });
	});

	it('states only the ad hoc fields that moved, because the server reads them by presence', async () => {
		const { result } = renderHook(() => useInspectionMutations());

		await result.current.save({
			inspectionId: RECORD,
			result: inspectionResult(),
			current: inspectionResult(),
			adhoc: {
				next: { geometry: null, addressId: 'address-1', habitatTypeId: null },
				current: { geometry: null, addressId: null, habitatTypeId: null },
			},
			centroid: null,
		});

		expect(lastIntents()).toEqual(['larvalSurveillance.updateAdHocInspectionLocation']);
		expect(lastChanges().address_id).toBe('address-1');
		expect(Object.keys(lastChanges())).not.toContain('habitat_type_id');
		expect(lastWrite().locationSource).toBeUndefined();
	});

	it('dispatches nothing when the form was saved untouched', async () => {
		const { result } = renderHook(() => useInspectionMutations());

		await result.current.save({
			inspectionId: RECORD,
			result: inspectionResult(),
			current: inspectionResult(),
			adhoc: null,
			centroid: null,
		});

		expect(dispatches()).toHaveLength(0);
	});

	it('names the delete and withholds what is filed under it and what is only unlinked', async () => {
		const { result } = renderHook(() => useInspectionMutations());

		await firstAttempt(INSPECTION_DELETE_REFUSALS, (acknowledgements) =>
			result.current.remove(RECORD, acknowledgements),
		);

		expect(lastIntents()).toEqual(['larvalSurveillance.deleteInspection']);
		expect(lastWrite().acknowledgements).toEqual({
			acknowledgedAssociatedRecordsDeletion: false,
			acknowledgedCrossDomainDetach: false,
		});
	});
});

describe('a sample write', () => {
	it('reads a missing label as a different command, not a missing field', async () => {
		const { result } = renderHook(() => useSampleMutations());

		await result.current.add({ sampleId: RECORD, inspectionId: HABITAT, displayName: 'A' });
		expect(lastIntents()).toEqual(['larvalSurveillance.addInspectionSample']);

		await result.current.add({ sampleId: RECORD, inspectionId: HABITAT, displayName: null });
		expect(lastIntents()).toEqual(['larvalSurveillance.addUnlabeledInspectionSample']);
	});

	it('names the relabel', async () => {
		const { result } = renderHook(() => useSampleMutations());

		await result.current.rename(RECORD, 'Dip 3');

		expect(lastIntents()).toEqual(['larvalSurveillance.updateInspectionSample']);
		expect(lastChanges().display_name).toBe('Dip 3');
	});

	it('reads the zero-larvae finding for its direction, because it can be taken back', async () => {
		const { result } = renderHook(() => useSampleMutations());

		await result.current.setZeroLarvae(RECORD, true);
		expect(lastIntents()).toEqual(['larvalSurveillance.markSampleZeroLarvae']);

		await result.current.setZeroLarvae(RECORD, false);
		expect(lastIntents()).toEqual(['larvalSurveillance.clearSampleZeroLarvae']);
	});

	it('names one command for the non-mosquito observation, whichever way it went', async () => {
		// An observation the field recorded, so the value is the point rather than
		// the direction. The server's intent map draws the same line.
		const { result } = renderHook(() => useSampleMutations());

		await result.current.setNonMosquito(RECORD, true);
		expect(lastIntents()).toEqual(['larvalSurveillance.setSampleNonMosquitoPresence']);

		await result.current.setNonMosquito(RECORD, false);
		expect(lastIntents()).toEqual(['larvalSurveillance.setSampleNonMosquitoPresence']);
		expect(lastChanges().has_non_mosquito).toBe(false);
	});

	it('names the unidentifiable reason, and clearing it is the same command', async () => {
		const { result } = renderHook(() => useSampleMutations());

		await result.current.setUnidentifiableReason(RECORD, null);

		expect(lastIntents()).toEqual(['larvalSurveillance.setSampleUnidentifiableReason']);
		expect(lastChanges().unidentifiable_reason).toBeNull();
	});

	it('names the delete and withholds the flag over its species counts and comments', async () => {
		const { result } = renderHook(() => useSampleMutations());

		await firstAttempt(SAMPLE_DELETE_REFUSALS, (acknowledgements) =>
			result.current.remove(RECORD, acknowledgements),
		);

		expect(lastIntents()).toEqual(['larvalSurveillance.deleteInspectionSample']);
		expect(lastWrite().acknowledgements).toEqual({
			acknowledgedAssociatedRecordsDeletion: false,
		});
	});
});

function speciesFields(overrides: Record<string, unknown> = {}) {
	return {
		speciesId: SPECIES,
		larvaeCount: 12,
		identifiedByProfileId: PROFILE,
		identifiedAt: '2026-08-04',
		...overrides,
	};
}

describe('a species count write', () => {
	it('names the create', async () => {
		const { result } = renderHook(() => useSampleSpeciesMutations());

		await result.current.add({
			sampleSpeciesId: RECORD,
			sampleId: HABITAT,
			fields: speciesFields(),
		});

		expect(lastIntents()).toEqual(['larvalSurveillance.addSampleSpeciesCount']);
	});

	it('sends only the field that moved, because the command reads them by presence', async () => {
		// A count corrected from 12 to 8 says nothing about which species it was,
		// and restating the species would be this layer inventing an edit.
		const { result } = renderHook(() => useSampleSpeciesMutations());

		await result.current.save(RECORD, speciesFields({ larvaeCount: 8 }), speciesFields());

		expect(lastIntents()).toEqual(['larvalSurveillance.updateSampleSpeciesCount']);
		expect(lastChanges().larvae_count).toBe(8);
		expect(Object.keys(lastChanges())).not.toContain('species_id');
		expect(Object.keys(lastChanges())).not.toContain('identified_at');
	});

	it('dispatches nothing when the grid saved an untouched row', async () => {
		const { result } = renderHook(() => useSampleSpeciesMutations());

		await result.current.save(RECORD, speciesFields(), speciesFields());

		expect(dispatches()).toHaveLength(0);
	});

	it('names the delete', async () => {
		const { result } = renderHook(() => useSampleSpeciesMutations());

		await result.current.remove(RECORD);

		expect(lastIntents()).toEqual(['larvalSurveillance.deleteSampleSpeciesCount']);
	});
});
