import { describe, expect, it } from 'vitest';
import { DomainValidationError } from '../adult-surveillance.js';
import {
	calculateFormulationComponentAmounts,
	createApplicationMethodCommand,
	createInsecticideCommand,
	createVehicleCommand,
	expandFormulationApplicationCommands,
	isBiocontrolUnitType,
	isSourceReductionUnitType,
	recordChemicalApplicationCommand,
	recordOutreachActionCommand,
	recordSourceReductionCommand,
	requestControlActionCommand,
	updateChemicalApplicationFieldDetailsCommand,
	updateRequestedControlActionDetailsCommand,
} from '../control-operations.js';

const organizationId = '11111111-1111-4111-8111-111111111111';
const actorProfileId = '22222222-2222-4222-8222-222222222222';
const otherProfileId = '33333333-3333-4333-8333-333333333333';
const applicationMethodId = '44444444-4444-4444-8444-444444444444';
const sourceReductionMethodId = '55555555-5555-4555-8555-555555555555';
const vehicleId = '66666666-6666-4666-8666-666666666666';
const insecticideId = '77777777-7777-4777-8777-777777777777';
const insecticideId2 = '78787878-7878-4787-8787-787878787878';
const batchId = '88888888-8888-4888-8888-888888888888';
const batchId2 = '89898989-8989-4898-8989-898989898989';
const applicationBatchId = '99999999-9999-4999-8999-999999999999';
const applicationBatchId2 = '9aaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const applicationId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const applicationId2 = 'abababab-abab-4aba-8bab-abababababab';
const addressId = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const habitatId = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const inspectionId = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
const collectionId = 'ffffffff-ffff-4fff-8fff-ffffffffffff';
const unitId = '12121212-1212-4212-8212-121212121212';
const requestedControlActionId = '13131313-1313-4313-8313-131313131313';
const outreachMethodId = '14141414-1414-4414-8414-141414141414';
const outreachActionId = '15151515-1515-4515-8515-151515151515';
const sourceReductionId = '16161616-1616-4616-8616-161616161616';
const pointGeometry = { type: 'Point' as const, coordinates: [-90, 35] as const };
const polygonGeometry = {
	type: 'Polygon' as const,
	coordinates: [
		[
			[-90, 35],
			[-89.9, 35],
			[-89.9, 35.1],
			[-90, 35],
		],
	] as const,
};

describe('control operations catalog commands', () => {
	it('normalizes method catalog text and custom schema', () => {
		expect(
			createApplicationMethodCommand({
				organizationId,
				actorProfileId,
				applicationMethodId,
				name: '  Backpack spray ',
				customSchema: { nozzle: 'text' },
			}),
		).toEqual({
			type: 'controlOperations.createApplicationMethod',
			payload: {
				organizationId,
				actorProfileId,
				applicationMethodId,
				name: 'Backpack spray',
				customSchema: { nozzle: 'text' },
			},
		});

		expect(() =>
			createApplicationMethodCommand({
				organizationId,
				actorProfileId,
				applicationMethodId,
				name: ' ',
				customSchema: ['not', 'object'],
			}),
		).toThrow(DomainValidationError);
	});

	it('normalizes vehicle metadata and insecticide product fields', () => {
		expect(
			createVehicleCommand({
				organizationId,
				actorProfileId,
				vehicleId,
				vehicleName: ' Truck 7 ',
				metadata: { plate: 'ABC' },
			}).payload,
		).toMatchObject({
			vehicleName: 'Truck 7',
			metadata: { plate: 'ABC' },
		});

		expect(
			createInsecticideCommand({
				organizationId,
				actorProfileId,
				insecticideId,
				tradeName: '  VectoPrime ',
				activeIngredient: '  Bti ',
				type: 'larvicide',
				registrationNumber: ' EPA-123 ',
				defaultUnitId: unitId,
				labelUrl: ' https://example.com/label.pdf ',
				msdsUrl: '',
				shorthand: ' VP ',
			}).payload,
		).toMatchObject({
			tradeName: 'VectoPrime',
			activeIngredient: 'Bti',
			registrationNumber: 'EPA-123',
			labelUrl: 'https://example.com/label.pdf',
			msdsUrl: null,
			shorthand: 'VP',
		});

		expect(() =>
			createInsecticideCommand({
				organizationId,
				actorProfileId,
				insecticideId,
				tradeName: 'VectoPrime',
				activeIngredient: 'Bti',
				type: 'larvicide',
				registrationNumber: 'EPA-123',
				defaultUnitId: unitId,
				labelUrl: 'ftp://example.com/label.pdf',
			}),
		).toThrow(DomainValidationError);
	});
});

describe('control operations action commands', () => {
	it('records a chemical application with explicit units, context, and batch mappings', () => {
		expect(
			recordChemicalApplicationCommand({
				organizationId,
				actorProfileId,
				applicationId,
				insecticideId,
				amountApplied: 1.25,
				applicationUnitId: unitId,
				applicationDate: '2026-05-11',
				applicatorProfileId: otherProfileId,
				locationSource: { kind: 'geometry', geometry: pointGeometry },
				addressId,
				context: { kind: 'larval', habitatId, inspectionId },
				requestedControlActionId,
				applicationMethodId,
				vehicleId,
				applicationBatches: [{ applicationBatchId, insecticideBatchId: batchId }],
				metadata: { wind: 'calm' },
			}).payload,
		).toMatchObject({
			applicationId,
			insecticideId,
			amountApplied: 1.25,
			applicationUnitId: unitId,
			applicationDate: '2026-05-11',
			applicatorProfileId: otherProfileId,
			locationSource: { kind: 'geometry', geometry: pointGeometry },
			addressId,
			context: { kind: 'larval', habitatId, inspectionId },
			requestedControlActionId,
			applicationMethodId,
			vehicleId,
			applicationBatches: [{ applicationBatchId, insecticideBatchId: batchId }],
			metadata: { wind: 'calm' },
		});
	});

	it('rejects duplicate application batch mappings and invalid context shapes', () => {
		expect(() =>
			recordChemicalApplicationCommand({
				organizationId,
				actorProfileId,
				applicationId,
				insecticideId,
				amountApplied: 1,
				applicationUnitId: unitId,
				applicationDate: '2026-05-11',
				locationSource: { kind: 'geometry', geometry: pointGeometry },
				applicationBatches: [
					{ applicationBatchId, insecticideBatchId: batchId },
					{ applicationBatchId: applicationBatchId2, insecticideBatchId: batchId },
				],
			}),
		).toThrow(DomainValidationError);

		expect(() =>
			recordSourceReductionCommand({
				organizationId,
				actorProfileId,
				sourceReductionId,
				sourceReductionMethodId,
				sourceReductionDate: '2026-05-11',
				locationSource: { kind: 'geometry', geometry: polygonGeometry },
				context: { kind: 'adult', collectionId },
				sourcesEliminatedAmount: 200.5,
				sourcesEliminatedUnitId: unitId,
			}),
		).toThrow(DomainValidationError);
	});

	it('records source reduction and outreach with their quantity rules', () => {
		expect(
			recordSourceReductionCommand({
				organizationId,
				actorProfileId,
				sourceReductionId,
				sourceReductionMethodId,
				sourceReductionDate: '2026-05-11',
				locationSource: { kind: 'geometry', geometry: polygonGeometry },
				context: { kind: 'larval', habitatId },
				sourcesEliminatedAmount: 200.5,
				sourcesEliminatedUnitId: unitId,
			}).payload,
		).toMatchObject({
			technicianProfileId: actorProfileId,
			sourcesEliminatedAmount: 200.5,
			context: { kind: 'larval', habitatId },
		});

		expect(
			recordOutreachActionCommand({
				organizationId,
				actorProfileId,
				outreachActionId,
				outreachMethodId,
				outreachDate: '2026-05-11',
				locationSource: { kind: 'geometry', geometry: pointGeometry },
				context: { kind: 'larval', inspectionId },
				reach: 3,
				reachDescription: ' Door hangers ',
			}).payload,
		).toMatchObject({
			reach: 3,
			reachDescription: 'Door hangers',
			context: { kind: 'larval', inspectionId },
		});

		expect(() =>
			recordOutreachActionCommand({
				organizationId,
				actorProfileId,
				outreachActionId,
				outreachMethodId,
				outreachDate: '2026-05-11',
				locationSource: { kind: 'geometry', geometry: pointGeometry },
				context: { kind: 'larval', habitatId },
				reach: 1,
			}),
		).toThrow(DomainValidationError);
	});

	it('builds guarded patch commands with acknowledgement flags', () => {
		expect(
			updateChemicalApplicationFieldDetailsCommand({
				organizationId,
				actorProfileId,
				applicationId,
				insecticideId: insecticideId2,
				amountApplied: 2.5,
				acknowledgedBatchClearance: true,
			}).payload,
		).toMatchObject({
			applicationId,
			changes: { insecticideId: insecticideId2, amountApplied: 2.5 },
			acknowledgedBatchClearance: true,
		});
	});

	it('rejects invalid optional ids in chemical application field patches', () => {
		expect(() =>
			updateChemicalApplicationFieldDetailsCommand({
				organizationId,
				actorProfileId,
				applicationId,
				vehicleId: 'not-a-uuid',
			}),
		).toThrow(DomainValidationError);
	});
});

describe('requested control action commands', () => {
	it('records requested actions with timestamp and source context', () => {
		const requestedAt = new Date('2026-05-11T14:00:00.000Z');

		expect(
			requestControlActionCommand({
				organizationId,
				actorProfileId,
				requestedControlActionId,
				controlType: 'application',
				locationSource: { kind: 'geometry', geometry: pointGeometry },
				addressId,
				context: { kind: 'adult', collectionId },
				recommendedMethodId: applicationMethodId,
				summary: ' Treat near trap ',
				requestedAt,
			}).payload,
		).toMatchObject({
			controlType: 'application',
			context: { kind: 'adult', collectionId },
			recommendedMethodId: applicationMethodId,
			summary: 'Treat near trap',
			requestedByProfileId: actorProfileId,
			requestedAt,
		});
	});

	it('rejects incompatible requested-action context and normalizes detail patches', () => {
		expect(() =>
			requestControlActionCommand({
				organizationId,
				actorProfileId,
				requestedControlActionId,
				controlType: 'source_reduction',
				locationSource: { kind: 'geometry', geometry: pointGeometry },
				context: { kind: 'adult', collectionId },
			}),
		).toThrow(DomainValidationError);

		expect(
			updateRequestedControlActionDetailsCommand({
				organizationId,
				actorProfileId,
				requestedControlActionId,
				controlType: 'biocontrol',
				recommendedMethodId: null,
				summary: ' ',
			}).payload.changes,
		).toEqual({
			controlType: 'biocontrol',
			recommendedMethodId: null,
			summary: null,
		});
	});
});

describe('formulation helpers', () => {
	it('calculates component amounts using relative ratios and diluent ratio', () => {
		expect(
			calculateFormulationComponentAmounts({
				totalAmount: 100,
				diluentRatio: 1,
				components: [
					{ insecticideId, ratio: 2 },
					{ insecticideId: insecticideId2, ratio: 1 },
				],
			}),
		).toEqual([
			{ insecticideId, ratio: 2, amount: 50 },
			{ insecticideId: insecticideId2, ratio: 1, amount: 25 },
		]);
	});

	it('expands formulation input into ordinary single-insecticide application commands', () => {
		const commands = expandFormulationApplicationCommands({
			organizationId,
			actorProfileId,
			totalAmount: 12,
			components: [
				{
					insecticideId,
					ratio: 1,
					applicationId,
					applicationUnitId: unitId,
					applicationBatches: [{ applicationBatchId, insecticideBatchId: batchId }],
				},
				{
					insecticideId: insecticideId2,
					ratio: 2,
					applicationId: applicationId2,
					applicationUnitId: unitId,
					applicationBatches: [
						{ applicationBatchId: applicationBatchId2, insecticideBatchId: batchId2 },
					],
				},
			],
			applicationDate: '2026-05-11',
			locationSource: { kind: 'geometry', geometry: pointGeometry },
			context: { kind: 'larval', habitatId },
		});

		expect(commands.map((command) => command.type)).toEqual([
			'controlOperations.recordChemicalApplication',
			'controlOperations.recordChemicalApplication',
		]);
		expect(commands.map((command) => command.payload.amountApplied)).toEqual([4, 8]);
		expect(commands[0]?.payload).toMatchObject({
			applicationId,
			insecticideId,
			context: { kind: 'larval', habitatId },
			applicationBatches: [{ applicationBatchId, insecticideBatchId: batchId }],
		});
	});

	it('exposes pure unit-type predicates for server-side validators', () => {
		expect(isSourceReductionUnitType('distance')).toBe(true);
		expect(isSourceReductionUnitType('weight')).toBe(false);
		expect(isBiocontrolUnitType('weight')).toBe(true);
		expect(isBiocontrolUnitType('distance')).toBe(false);
	});
});
