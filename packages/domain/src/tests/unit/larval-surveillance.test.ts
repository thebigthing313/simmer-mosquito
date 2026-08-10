import { describe, expect, it } from 'vitest';
import { DomainValidationError } from '../../adult-surveillance/index.js';
import {
	addInspectionSampleCommand,
	addSampleSpeciesCountCommand,
	createHabitatCommand,
	mergeHabitatsCommand,
	normalizeLarvalInspectionResult,
	recordAdHocInspectionCommand,
	recordHabitatInspectionCommand,
	setSampleNonMosquitoPresenceCommand,
	updateHabitatDetailsCommand,
	updateHabitatLocationCommand,
} from '../../larval-surveillance/index.js';
import { validateLarvalInspectionEntryPolicy } from '../../organization-settings/index.js';

const organizationId = '11111111-1111-4111-8111-111111111111';
const actorProfileId = '22222222-2222-4222-8222-222222222222';
const otherProfileId = '33333333-3333-4333-8333-333333333333';
const habitatId = '44444444-4444-4444-8444-444444444444';
const sourceHabitatId = '45454545-4545-4545-8545-454545454545';
const inspectionId = '55555555-5555-4555-8555-555555555555';
const sampleId = '66666666-6666-4666-8666-666666666666';
const sampleSpeciesId = '77777777-7777-4777-8777-777777777777';
const habitatTypeId = '99999999-9999-4999-8999-999999999999';
const speciesId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const pointGeometry = { type: 'Point' as const, coordinates: [-90, 35] as const };
const lineGeometry = {
	type: 'LineString' as const,
	coordinates: [
		[-90, 35],
		[-90.1, 35.1],
	] as const,
};

const densityRanges = {
	light: { minInclusive: 0, maxExclusive: 1 },
	medium: { minInclusive: 1, maxExclusive: 5 },
	heavy: { minInclusive: 5, maxExclusive: 10 },
	veryHeavy: { minInclusive: 10 },
};

describe('larval surveillance commands', () => {
	it('normalizes habitat creation and collector-editable details', () => {
		expect(
			createHabitatCommand({
				organizationId,
				actorProfileId,
				habitatId,
				locationSource: { kind: 'geometry', geometry: pointGeometry },
				habitatTypeId,
				habitatName: '  CB-104 ',
				description: '  North catch basin ',
				metadata: { grate: 'round' },
			}),
		).toEqual({
			type: 'larvalSurveillance.createHabitat',
			payload: {
				organizationId,
				actorProfileId,
				habitatId,
				locationSource: { kind: 'geometry', geometry: pointGeometry },
				addressId: null,
				habitatTypeId,
				habitatName: 'CB-104',
				description: 'North catch basin',
				metadata: { grate: 'round' },
			},
		});

		expect(
			updateHabitatDetailsCommand({
				organizationId,
				actorProfileId,
				habitatId,
				habitatName: null,
				metadata: null,
			}).payload.changes,
		).toEqual({ habitatName: null, metadata: null });

		expect(() =>
			createHabitatCommand({
				organizationId,
				actorProfileId,
				habitatId,
				locationSource: { kind: 'geometry', geometry: pointGeometry },
				addressId: 'not-a-uuid',
				description: 'North catch basin',
			}),
		).toThrow(DomainValidationError);
	});

	it('requires acknowledgements for semantic habitat operations', () => {
		expect(() =>
			updateHabitatLocationCommand({
				organizationId,
				actorProfileId,
				habitatId,
				locationSource: { kind: 'geometry', geometry: pointGeometry },
			}),
		).toThrow(DomainValidationError);

		expect(() =>
			mergeHabitatsCommand({
				organizationId,
				actorProfileId,
				targetHabitatId: habitatId,
				sourceHabitatIds: [sourceHabitatId],
			}),
		).toThrow(DomainValidationError);

		expect(
			mergeHabitatsCommand({
				organizationId,
				actorProfileId,
				targetHabitatId: habitatId,
				sourceHabitatIds: [sourceHabitatId],
				acknowledgedMergeConsolidatesHistory: true,
			}).payload.sourceHabitatIds,
		).toEqual([sourceHabitatId]);
	});

	it('uses hybrid inspection entry defaults when org settings are absent', () => {
		expect(
			recordAdHocInspectionCommand({
				organizationId,
				actorProfileId,
				inspectionId,
				locationSource: { kind: 'geometry', geometry: lineGeometry },
				inspectionDate: '2024-05-02',
				isWet: true,
				density: 'none',
				dipCount: 5,
			}).payload,
		).toMatchObject({
			inspectionId,
			locationSource: { kind: 'geometry', geometry: lineGeometry },
			inspectionDate: '2024-05-02',
			inspectedByProfileId: actorProfileId,
			density: 'none',
			dipCount: 5,
			larvaeCount: null,
			isBreedingPositive: false,
		});
	});

	it('allows ad hoc inspections to snapshot location from a known habitat', () => {
		expect(
			recordAdHocInspectionCommand({
				organizationId,
				actorProfileId,
				inspectionId,
				locationSource: { kind: 'habitat', habitatId },
				habitatTypeId,
				inspectionDate: '2024-05-02',
				isWet: false,
			}).payload,
		).toMatchObject({
			inspectionId,
			locationSource: { kind: 'habitat', habitatId },
			habitatTypeId,
			isWet: false,
		});
	});

	it('infers density from configured larvae-per-dip ranges', () => {
		expect(
			normalizeLarvalInspectionResult({
				isWet: true,
				larvaeCount: 12,
				dipCount: 2,
				hasThirdInstar: true,
				policy: {
					mode: 'count_and_dips_required',
					densityRanges,
				},
			}).density,
		).toBe('heavy');

		expect(() =>
			normalizeLarvalInspectionResult({
				isWet: true,
				larvaeCount: 12,
				dipCount: 2,
				density: 'light',
				hasThirdInstar: true,
				policy: {
					mode: 'count_and_dips_required',
					densityRanges,
				},
			}),
		).toThrow(DomainValidationError);
	});

	it('requires life stages for breeding-positive inspections', () => {
		expect(() =>
			recordHabitatInspectionCommand({
				organizationId,
				actorProfileId,
				inspectionId,
				habitatId,
				inspectionDate: '2024-05-02',
				isWet: true,
				density: 'light',
			}),
		).toThrow(DomainValidationError);
	});

	it('rejects malformed density range settings before command use', () => {
		expect(() =>
			validateLarvalInspectionEntryPolicy({
				mode: 'hybrid',
				densityRanges: {
					light: { minInclusive: 0, maxExclusive: 1 },
					medium: { minInclusive: 2, maxExclusive: 5 },
					heavy: { minInclusive: 5, maxExclusive: 10 },
					veryHeavy: { minInclusive: 10 },
				},
			}),
		).toThrow(DomainValidationError);
	});

	it('keeps labeled and unlabeled samples semantically distinct', () => {
		expect(
			addInspectionSampleCommand({
				organizationId,
				actorProfileId,
				sampleId,
				inspectionId,
				displayName: ' Cup A ',
			}).payload.displayName,
		).toBe('Cup A');

		expect(() =>
			addInspectionSampleCommand({
				organizationId,
				actorProfileId,
				sampleId,
				inspectionId,
				displayName: ' ',
			}),
		).toThrow(DomainValidationError);
	});

	it('uses larval sample result language instead of bycatch', () => {
		expect(
			setSampleNonMosquitoPresenceCommand({
				organizationId,
				actorProfileId,
				sampleId,
				hasNonMosquito: true,
			}).payload,
		).toMatchObject({ sampleId, hasNonMosquito: true });
	});

	it('normalizes sample species counts with identifier defaults', () => {
		expect(
			addSampleSpeciesCountCommand({
				organizationId,
				actorProfileId,
				sampleSpeciesId,
				sampleId,
				speciesId,
				larvaeCount: 3,
				identifiedAt: '2024-05-03',
			}).payload,
		).toMatchObject({
			sampleSpeciesId,
			sampleId,
			speciesId,
			larvaeCount: 3,
			identifiedByProfileId: actorProfileId,
			identifiedAt: '2024-05-03',
		});

		expect(
			addSampleSpeciesCountCommand({
				organizationId,
				actorProfileId,
				sampleSpeciesId,
				sampleId,
				speciesId,
				larvaeCount: 3,
				identifiedByProfileId: otherProfileId,
				identifiedAt: '2024-05-03',
			}).payload.identifiedByProfileId,
		).toBe(otherProfileId);

		expect(() =>
			addSampleSpeciesCountCommand({
				organizationId,
				actorProfileId,
				sampleSpeciesId,
				sampleId,
				speciesId,
				larvaeCount: 3,
				identifiedByProfileId: 'not-a-uuid',
				identifiedAt: '2024-05-03',
			}),
		).toThrow(DomainValidationError);
	});

	// Regression: callers reached for `new Date().toISOString()` and every add was
	// rejected as invalid. identifiedAt is a calendar date, never a timestamp.
	it('rejects an ISO timestamp for identifiedAt', () => {
		expect(() =>
			addSampleSpeciesCountCommand({
				organizationId,
				actorProfileId,
				sampleSpeciesId,
				sampleId,
				speciesId,
				larvaeCount: 3,
				identifiedAt: '2024-05-03T14:22:07.123Z',
			}),
		).toThrow(DomainValidationError);
	});
});
