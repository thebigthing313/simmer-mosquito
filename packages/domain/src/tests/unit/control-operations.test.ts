import { describe, expect, it } from 'vitest';
import { DomainValidationError } from '../../adult-surveillance/index.js';
import {
	locationContextChanges,
	validateLocationContextPatchBase,
} from '../../control-operations/core.js';
import {
	calculateFormulationComponentAmounts,
	createApplicationMethodCommand,
	createInsecticideCommand,
	createVehicleCommand,
	deleteTreatmentCommand,
	formulationTreatmentApplications,
	isBiocontrolUnitType,
	isSourceReductionUnitType,
	recordOutreachActionCommand,
	recordSourceReductionCommand,
	recordTreatmentCommand,
	recordTreatmentFromFormulationCommand,
	requestControlActionCommand,
	reviseTreatmentLinesCommand,
	updateRequestedControlActionDetailsCommand,
	updateTreatmentFieldDetailsCommand,
	updateTreatmentLocationAndContextCommand,
} from '../../control-operations/index.js';

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
const unitId2 = '13131313-1313-4313-8313-131313131313';
const requestedControlActionId = '13131313-1313-4313-8313-131313131313';
const outreachMethodId = '14141414-1414-4414-8414-141414141414';
const outreachActionId = '15151515-1515-4515-8515-151515151515';
const sourceReductionId = '16161616-1616-4616-8616-161616161616';
const serviceRequestId = '17171717-1717-4717-8717-171717171717';
const missionItemId = '18181818-1818-4818-8818-181818181818';
const trapId = '19191919-1919-4919-8919-191919191919';
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
	it('rejects a source reduction with an adult context', () => {
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
	it('scales component amounts by how many batches of the mix went out', () => {
		expect(
			calculateFormulationComponentAmounts({
				totalAmount: 300,
				batchSize: 100,
				components: [
					{ insecticideId, amount: 2, unitId },
					{ insecticideId: insecticideId2, amount: 1, unitId: unitId2 },
				],
			}),
		).toEqual([
			{ insecticideId, unitId, amount: 6 },
			{ insecticideId: insecticideId2, unitId: unitId2, amount: 3 },
		]);
	});

	it('keeps each component in its own unit, so a weight can come out of a volume mix', () => {
		// 0.5 lb of material into 26 gal of water, applied over three tanks.
		expect(
			calculateFormulationComponentAmounts({
				totalAmount: 78,
				batchSize: 26,
				components: [{ insecticideId, amount: 0.5, unitId }],
			}),
		).toEqual([{ insecticideId, unitId, amount: 1.5 }]);
	});

	it('scales a part-batch application down', () => {
		expect(
			calculateFormulationComponentAmounts({
				totalAmount: 13,
				batchSize: 26,
				components: [{ insecticideId, amount: 0.5, unitId }],
			}),
		).toEqual([{ insecticideId, unitId, amount: 0.25 }]);
	});

	it('exposes pure unit-type predicates for server-side validators', () => {
		expect(isSourceReductionUnitType('distance')).toBe(true);
		expect(isSourceReductionUnitType('weight')).toBe(false);
		expect(isBiocontrolUnitType('weight')).toBe(true);
		expect(isBiocontrolUnitType('distance')).toBe(false);
	});
});

/**
 * The flow constraint on the two patch helpers, which `tsc` checks rather than
 * vitest.
 *
 * The `@ts-expect-error` cases are the assertions. Both helpers used to take the
 * flow as the `LocationSourceFlow` union, which widened the location source they
 * accepted to both flows' sources, so a requested action patch carrying a
 * mission item source compiled. A signature that goes back to that would
 * suppress nothing, and `tsc` would fail on the directive itself.
 *
 * The `expect` beside each case only proves the case ran.
 */
describe('location and context patch flow constraint', () => {
	const controlActionFlow = 'controlAction';
	const requestedFlow = 'requestedControlAction';

	const controlActionSources = [
		{ kind: 'geometry', geometry: pointGeometry },
		{ kind: 'address', addressId },
		{ kind: 'serviceRequest', serviceRequestId },
		{ kind: 'habitat', habitatId },
		{ kind: 'inspection', inspectionId },
		{ kind: 'requestedControlAction', requestedControlActionId },
		{ kind: 'missionItem', missionItemId },
	] as const;

	it('takes every source kind the control action row lists', () => {
		for (const locationSource of controlActionSources) {
			const patch = { organizationId, actorProfileId, applicationId, locationSource };

			expect(validateLocationContextPatchBase(patch, 'applicationId', controlActionFlow)).toEqual(
				[],
			);
		}
	});

	it('refuses a source kind the requested action row leaves out', () => {
		const patch = {
			organizationId,
			actorProfileId,
			requestedControlActionId,
			locationSource: { kind: 'missionItem', missionItemId } as const,
		};

		// @ts-expect-error A requested action is not dispatched, so it takes no mission item.
		validateLocationContextPatchBase(patch, 'requestedControlActionId', requestedFlow);
		// @ts-expect-error The same row, and the same refusal on the changes helper.
		locationContextChanges(patch, undefined, [], requestedFlow);

		expect(patch.locationSource.kind).toBe('missionItem');
	});

	it('refuses a source kind the control action row leaves out', () => {
		const patch = {
			organizationId,
			actorProfileId,
			applicationId,
			locationSource: { kind: 'trap', trapId } as const,
		};

		// @ts-expect-error A control action reads its place from a record, and a Trap is not one.
		validateLocationContextPatchBase(patch, 'applicationId', controlActionFlow);
		// @ts-expect-error The same row, and the same refusal on the changes helper.
		locationContextChanges(patch, undefined, [], controlActionFlow);

		expect(patch.locationSource.kind).toBe('trap');
	});

	it('still refuses the unsupported kind at run time', () => {
		const issues = validateLocationContextPatchBase(
			{
				organizationId,
				actorProfileId,
				requestedControlActionId,
				// The compiler refuses this above. The cast is what lets the case reach
				// the run-time check, which stays the second line of defence for a
				// caller outside the compiler's reach.
				locationSource: { kind: 'missionItem', missionItemId } as never,
			},
			'requestedControlActionId',
			requestedFlow,
		);

		expect(issues).toContainEqual({
			path: 'locationSource.kind',
			message: 'locationSource.kind is not supported for this location source flow.',
		});
	});
});

describe('treatment commands', () => {
	const treatmentId = '1a1a1a1a-1a1a-4a1a-8a1a-1a1a1a1a1a1a';
	const formulationId = '1b1b1b1b-1b1b-4b1b-8b1b-1b1b1b1b1b1b';
	const mixUnitId = '1c1c1c1c-1c1c-4c1c-8c1c-1c1c1c1c1c1c';
	const org = { organizationId, actorProfileId };
	const header = {
		...org,
		treatmentId,
		applicationDate: '2026-05-11',
		locationSource: { kind: 'geometry', geometry: pointGeometry },
	} as const;
	const line = {
		id: applicationId,
		insecticide_id: insecticideId,
		amount_applied: 1.25,
		application_unit_id: unitId,
		application_batches: [{ id: applicationBatchId, insecticide_batch_id: batchId }],
	};
	const secondLine = {
		id: applicationId2,
		insecticide_id: insecticideId2,
		amount_applied: 3,
		application_unit_id: unitId2,
		application_batches: [{ id: applicationBatchId2, insecticide_batch_id: batchId2 }],
	};

	/** The paths a refused build names, or a failure when the build passes. */
	function refusedPaths(build: () => unknown): readonly string[] {
		try {
			build();
		} catch (error) {
			expect(error).toBeInstanceOf(DomainValidationError);
			return (error as DomainValidationError).issues.map((issue) => issue.path);
		}
		throw new Error('Expected the build to be refused.');
	}

	describe('recordTreatment', () => {
		it('carries the visit once and every line with its batches', () => {
			expect(
				recordTreatmentCommand({
					...header,
					applicatorProfileId: otherProfileId,
					addressId,
					context: { kind: 'larval', habitatId, inspectionId },
					requestedControlActionId,
					applicationMethodId,
					vehicleId,
					metadata: { basins: 12 },
					applications: [
						line,
						{
							id: applicationId2,
							insecticide_id: insecticideId2,
							amount_applied: 3,
							application_unit_id: unitId2,
						},
					],
				}),
			).toEqual({
				type: 'controlOperations.recordTreatment',
				payload: {
					...org,
					treatmentId,
					applicationDate: '2026-05-11',
					applicatorProfileId: otherProfileId,
					locationSource: { kind: 'geometry', geometry: pointGeometry },
					addressId,
					context: { kind: 'larval', habitatId, inspectionId },
					requestedControlActionId,
					applicationMethodId,
					vehicleId,
					equipmentId: null,
					metadata: { basins: 12 },
					formulationId: null,
					mixAmount: null,
					mixUnitId: null,
					applications: [line, { ...secondLine, application_batches: [] }],
				},
			});
		});

		it('refuses an empty line set', () => {
			expect(refusedPaths(() => recordTreatmentCommand({ ...header, applications: [] }))).toEqual([
				'applications',
			]);
		});

		it('refuses a payload with no line set at all', () => {
			expect(
				refusedPaths(() => recordTreatmentCommand({ ...header, applications: undefined as never })),
			).toEqual(['applications']);
		});

		it('refuses a repeated insecticide, naming the later line', () => {
			expect(
				refusedPaths(() =>
					recordTreatmentCommand({
						...header,
						applications: [
							line,
							secondLine,
							{ ...secondLine, id: missionItemId, application_batches: [] },
						],
					}),
				),
			).toEqual(['applications.2.insecticide_id']);
		});

		it('refuses a repeated line id, a repeated batch link id and a batch linked twice', () => {
			expect(
				refusedPaths(() =>
					recordTreatmentCommand({
						...header,
						applications: [
							{
								...line,
								application_batches: [
									{ id: applicationBatchId, insecticide_batch_id: batchId },
									{ id: trapId, insecticide_batch_id: batchId },
								],
							},
							{
								...secondLine,
								id: applicationId,
								application_batches: [{ id: applicationBatchId, insecticide_batch_id: batchId2 }],
							},
						],
					}),
				),
			).toEqual([
				'applications.0.application_batches.1.insecticide_batch_id',
				'applications.1.id',
				'applications.1.application_batches.0.id',
			]);
		});

		it('refuses a line with no insecticide, amount or unit', () => {
			expect(
				refusedPaths(() =>
					recordTreatmentCommand({
						...header,
						applications: [
							{ ...line, insecticide_id: '', amount_applied: 0, application_unit_id: 'nope' },
						],
					}),
				),
			).toEqual([
				'applications.0.insecticide_id',
				'applications.0.amount_applied',
				'applications.0.application_unit_id',
			]);
		});

		it('carries a whole Formulation set', () => {
			expect(
				recordTreatmentCommand({
					...header,
					formulationId,
					mixAmount: 78,
					mixUnitId,
					applications: [line],
				}).payload,
			).toMatchObject({ formulationId, mixAmount: 78, mixUnitId });
		});

		it('refuses a Formulation set that is not whole, naming each missing field', () => {
			expect(
				refusedPaths(() =>
					recordTreatmentCommand({ ...header, formulationId, applications: [line] }),
				),
			).toEqual(['mixAmount', 'mixUnitId']);
			expect(
				refusedPaths(() =>
					recordTreatmentCommand({
						...header,
						formulationId: null,
						mixAmount: 78,
						mixUnitId,
						applications: [line],
					}),
				),
			).toEqual(['formulationId']);
		});

		it('refuses a mix amount that is not positive', () => {
			for (const mixAmount of [0, -5, Number.NaN]) {
				expect(
					refusedPaths(() =>
						recordTreatmentCommand({
							...header,
							formulationId,
							mixAmount,
							mixUnitId,
							applications: [line],
						}),
					),
				).toEqual(['mixAmount']);
			}
		});
	});

	describe('the Formulation path', () => {
		const recipeComponent = {
			insecticideId,
			amount: 1,
			unitId,
			applicationId,
			applicationBatches: [{ id: applicationBatchId, insecticide_batch_id: batchId }],
		};
		const components = [
			recipeComponent,
			{ insecticideId: insecticideId2, amount: 2, unitId: unitId2, applicationId: applicationId2 },
		];

		it('builds one recordTreatment with one line per component, scaled to the mix', () => {
			const command = recordTreatmentFromFormulationCommand({
				...header,
				context: { kind: 'larval', habitatId },
				formulationId,
				mixAmount: 12,
				mixUnitId,
				batchSize: 3,
				components,
			});

			expect(command.type).toBe('controlOperations.recordTreatment');
			expect(command.payload).toMatchObject({
				treatmentId,
				context: { kind: 'larval', habitatId },
				formulationId,
				mixAmount: 12,
				mixUnitId,
			});
			expect(command.payload.applications).toEqual([
				{
					id: applicationId,
					insecticide_id: insecticideId,
					amount_applied: 4,
					application_unit_id: unitId,
					application_batches: [{ id: applicationBatchId, insecticide_batch_id: batchId }],
				},
				{
					id: applicationId2,
					insecticide_id: insecticideId2,
					amount_applied: 8,
					application_unit_id: unitId2,
					application_batches: [],
				},
			]);
		});

		it('computes the amounts calculateFormulationComponentAmounts gives', () => {
			const lines = formulationTreatmentApplications({ mixAmount: 78, batchSize: 26, components });
			const amounts = calculateFormulationComponentAmounts({
				totalAmount: 78,
				batchSize: 26,
				components,
			});

			expect(lines.map((entry) => entry.amount_applied)).toEqual(
				amounts.map((entry) => entry.amount),
			);
		});

		it('refuses a mix amount that is not positive, naming mixAmount', () => {
			expect(
				refusedPaths(() =>
					recordTreatmentFromFormulationCommand({
						...header,
						formulationId,
						mixAmount: 0,
						mixUnitId,
						batchSize: 3,
						components,
					}),
				),
			).toEqual(['mixAmount']);
		});

		it('refuses a recipe that names one insecticide twice', () => {
			expect(
				refusedPaths(() =>
					formulationTreatmentApplications({
						mixAmount: 12,
						batchSize: 3,
						components: [recipeComponent, { ...recipeComponent, applicationId: applicationId2 }],
					}),
				),
			).toEqual(['components.1.insecticideId']);
		});
	});

	describe('updateTreatmentFieldDetails', () => {
		const base = { ...org, treatmentId };

		it('sets the Formulation set as one', () => {
			expect(
				updateTreatmentFieldDetailsCommand({
					...base,
					applicationDate: '2026-05-12',
					formulationId,
					mixAmount: 26,
					mixUnitId,
				}).payload,
			).toEqual({
				...base,
				changes: { applicationDate: '2026-05-12', formulationId, mixAmount: 26, mixUnitId },
			});
		});

		it('clears the Formulation set as one', () => {
			expect(
				updateTreatmentFieldDetailsCommand({
					...base,
					formulationId: null,
					mixAmount: null,
					mixUnitId: null,
				}).payload.changes,
			).toEqual({ formulationId: null, mixAmount: null, mixUnitId: null });
		});

		it('refuses a change naming part of the Formulation set', () => {
			expect(
				refusedPaths(() => updateTreatmentFieldDetailsCommand({ ...base, mixAmount: 30 })),
			).toEqual(['formulationId', 'mixUnitId']);
		});

		it('refuses clearing part of the Formulation set', () => {
			expect(
				refusedPaths(() =>
					updateTreatmentFieldDetailsCommand({
						...base,
						formulationId,
						mixAmount: null,
						mixUnitId,
					}),
				),
			).toEqual(['mixAmount']);
		});

		it('refuses a mix amount that is not positive', () => {
			expect(
				refusedPaths(() =>
					updateTreatmentFieldDetailsCommand({
						...base,
						formulationId,
						mixAmount: -1,
						mixUnitId,
					}),
				),
			).toEqual(['mixAmount']);
		});

		it('refuses an edit that changes nothing', () => {
			expect(refusedPaths(() => updateTreatmentFieldDetailsCommand(base))).toEqual(['changes']);
		});

		it('refuses an invalid optional id', () => {
			expect(
				refusedPaths(() =>
					updateTreatmentFieldDetailsCommand({ ...base, vehicleId: 'not-a-uuid' }),
				),
			).toEqual(['vehicleId']);
		});
	});

	describe('updateTreatmentLocationAndContext', () => {
		it('carries the location and context it names', () => {
			expect(
				updateTreatmentLocationAndContextCommand({
					...org,
					treatmentId,
					context: { kind: 'adult', collectionId },
					addressId: null,
				}).payload,
			).toEqual({
				...org,
				treatmentId,
				changes: { context: { kind: 'adult', collectionId }, addressId: null },
			});
		});
	});

	describe('reviseTreatmentLines', () => {
		it('carries the whole line set', () => {
			expect(
				reviseTreatmentLinesCommand({ ...org, treatmentId, applications: [line, secondLine] }),
			).toEqual({
				type: 'controlOperations.reviseTreatmentLines',
				payload: { ...org, treatmentId, applications: [line, secondLine] },
			});
		});

		it('refuses a set with no lines', () => {
			expect(
				refusedPaths(() => reviseTreatmentLinesCommand({ ...org, treatmentId, applications: [] })),
			).toEqual(['applications']);
		});

		it('refuses a repeated insecticide, naming the later line', () => {
			expect(
				refusedPaths(() =>
					reviseTreatmentLinesCommand({
						...org,
						treatmentId,
						applications: [line, { ...secondLine, insecticide_id: insecticideId }],
					}),
				),
			).toEqual(['applications.1.insecticide_id']);
		});
	});

	describe('deleteTreatment', () => {
		it('defaults both acknowledgements to false', () => {
			expect(deleteTreatmentCommand({ ...org, treatmentId }).payload).toEqual({
				...org,
				treatmentId,
				acknowledgedSupportRecordDeletion: false,
				acknowledgedBatchDeletion: false,
			});
		});

		it('refuses a malformed id', () => {
			expect(refusedPaths(() => deleteTreatmentCommand({ ...org, treatmentId: 'x' }))).toEqual([
				'treatmentId',
			]);
		});
	});
});
