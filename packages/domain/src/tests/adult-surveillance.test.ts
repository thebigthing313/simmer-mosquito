import { describe, expect, it } from 'vitest';
import {
	addCollectionSpeciesCountCommand,
	createTrapCommand,
	DomainValidationError,
	estimateStartedAtFromTrapNights,
	recordCollectedAdHocCollectionCommand,
	setTrapCollectionCommand,
	updateCollectionFieldDetailsCommand,
	updateTrapConfigurationCommand,
} from '../adult-surveillance.js';

const organizationId = '11111111-1111-4111-8111-111111111111';
const actorProfileId = '22222222-2222-4222-8222-222222222222';
const otherProfileId = '33333333-3333-4333-8333-333333333333';
const trapId = '44444444-4444-4444-8444-444444444444';
const collectionId = '55555555-5555-4555-8555-555555555555';
const collectionSpeciesId = '66666666-6666-4666-8666-666666666666';
const collectionMethodId = '88888888-8888-4888-8888-888888888888';
const durationUnitId = '99999999-9999-4999-8999-999999999999';
const speciesId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const pointGeometry = { type: 'Point' as const, coordinates: [-90, 35] as const };

describe('adult surveillance commands', () => {
	it('normalizes create trap and carries duplicate-code acknowledgement', () => {
		expect(
			createTrapCommand({
				organizationId,
				actorProfileId,
				trapId,
				locationSource: { kind: 'geometry', geometry: pointGeometry },
				collectionMethodId,
				trapName: '  North yard  ',
				trapCode: ' LT-01 ',
				acknowledgedDuplicateTrapCode: true,
			}),
		).toEqual({
			type: 'adultSurveillance.createTrap',
			payload: {
				organizationId,
				actorProfileId,
				trapId,
				locationSource: { kind: 'geometry', geometry: pointGeometry },
				collectionMethodId,
				addressId: null,
				collectionLureId: null,
				trapName: 'North yard',
				trapCode: 'LT-01',
				description: null,
				acknowledgedDuplicateTrapCode: true,
			},
		});
	});

	it('requires a trap name or code', () => {
		expect(() =>
			createTrapCommand({
				organizationId,
				actorProfileId,
				trapId,
				locationSource: { kind: 'geometry', geometry: pointGeometry },
				collectionMethodId,
			}),
		).toThrow(DomainValidationError);
	});

	it('rejects invalid optional ids while creating traps', () => {
		expect(() =>
			createTrapCommand({
				organizationId,
				actorProfileId,
				trapId,
				locationSource: { kind: 'geometry', geometry: pointGeometry },
				collectionMethodId,
				addressId: 'not-a-uuid',
				trapName: 'North yard',
			}),
		).toThrow(DomainValidationError);
	});

	it('requires semantic acknowledgement for trap method and location changes', () => {
		expect(() =>
			updateTrapConfigurationCommand({
				organizationId,
				actorProfileId,
				trapId,
				locationSource: { kind: 'geometry', geometry: pointGeometry },
				collectionMethodId,
			}),
		).toThrow(DomainValidationError);

		expect(
			updateTrapConfigurationCommand({
				organizationId,
				actorProfileId,
				trapId,
				locationSource: { kind: 'geometry', geometry: pointGeometry },
				collectionMethodId,
				acknowledgedTrapLocationSemanticsChange: true,
				acknowledgedTrapMethodSemanticsChange: true,
			}).payload.changes,
		).toEqual({
			locationSource: { kind: 'geometry', geometry: pointGeometry },
			collectionMethodId,
		});
	});

	it('sets a trap collection as a pending exact timestamp workflow', () => {
		const startedAt = new Date('2024-05-01T20:00:00.000Z');

		expect(
			setTrapCollectionCommand({
				organizationId,
				actorProfileId,
				collectionId,
				trapId,
				startedAt,
				metadata: { batteryChecked: true },
			}),
		).toEqual({
			type: 'adultSurveillance.setTrapCollection',
			payload: {
				organizationId,
				actorProfileId,
				collectionId,
				metadata: { batteryChecked: true },
				trapId,
				timing: { mode: 'exact_timestamps', startedAt },
				setByProfileId: actorProfileId,
			},
		});
	});

	it('records collected ad hoc collections with collection date and duration timing', () => {
		expect(
			recordCollectedAdHocCollectionCommand({
				organizationId,
				actorProfileId,
				collectionId,
				collectionMethodId,
				locationSource: { kind: 'geometry', geometry: pointGeometry },
				timing: {
					mode: 'collection_date_duration',
					collectionDate: '2024-05-02',
					durationAmount: 1.5,
					durationUnitId,
				},
				setByProfileId: null,
				collectedByProfileId: otherProfileId,
				hasProblem: true,
			}).payload,
		).toMatchObject({
			collectionMethodId,
			locationSource: { kind: 'geometry', geometry: pointGeometry },
			timing: {
				mode: 'collection_date_duration',
				collectionDate: '2024-05-02',
				durationAmount: 1.5,
				durationUnitId,
			},
			setByProfileId: null,
			collectedByProfileId: otherProfileId,
			hasProblem: true,
		});
	});

	it('defaults species count sex and identifier while preserving explicit unknown sex', () => {
		expect(
			addCollectionSpeciesCountCommand({
				organizationId,
				actorProfileId,
				collectionSpeciesId,
				collectionId,
				speciesId,
				count: 12,
				identifiedDate: '2024-05-03',
			}).payload,
		).toMatchObject({
			sex: 'female',
			status: null,
			identifiedByProfileId: actorProfileId,
		});

		expect(
			addCollectionSpeciesCountCommand({
				organizationId,
				actorProfileId,
				collectionSpeciesId,
				collectionId,
				speciesId,
				count: 1,
				sex: null,
				identifiedDate: '2024-05-03',
			}).payload.sex,
		).toBeNull();
	});

	it('rejects invalid metadata and invalid count rows', () => {
		expect(() =>
			setTrapCollectionCommand({
				organizationId,
				actorProfileId,
				collectionId,
				trapId,
				startedAt: new Date('2024-05-01T20:00:00.000Z'),
				metadata: ['not', 'an', 'object'],
			}),
		).toThrow(DomainValidationError);

		expect(() =>
			addCollectionSpeciesCountCommand({
				organizationId,
				actorProfileId,
				collectionSpeciesId,
				collectionId,
				speciesId,
				count: 0,
				identifiedDate: '2024-05-03',
			}),
		).toThrow(DomainValidationError);
	});

	it('includes and validates collection metadata field patches', () => {
		expect(
			updateCollectionFieldDetailsCommand({
				organizationId,
				actorProfileId,
				collectionId,
				metadata: { batteryChecked: true },
			}).payload.changes,
		).toEqual({ metadata: { batteryChecked: true } });

		expect(() =>
			updateCollectionFieldDetailsCommand({
				organizationId,
				actorProfileId,
				collectionId,
				metadata: ['not', 'an', 'object'],
			}),
		).toThrow(DomainValidationError);
	});

	it('estimates set time from whole trap nights for back-entry UI', () => {
		expect(
			estimateStartedAtFromTrapNights({
				collectedAt: new Date('2024-05-04T12:00:00.000Z'),
				trapNights: 3,
			}).toISOString(),
		).toBe('2024-05-01T12:00:00.000Z');
	});
});
