import { describe, expect, it } from 'vitest';
import {
	AD_HOC_COLLECTION_UPDATE_FIELDS,
	COLLECTION_FIELD_DETAILS_UPDATE_FIELDS,
	COLLECTION_SPECIES_COUNT_UPDATE_FIELDS,
	TRAP_CONFIGURATION_UPDATE_FIELDS,
	TRAP_DETAILS_UPDATE_FIELDS,
	updateAdHocCollectionConfigurationCommand,
	updateCollectionFieldDetailsCommand,
	updateCollectionSpeciesCountCommand,
	updateTrapConfigurationCommand,
	updateTrapDetailsCommand,
} from '../../adult-surveillance/index.js';
import {
	BIOCONTROL_ACTION_UPDATE_FIELDS,
	CHEMICAL_APPLICATION_UPDATE_FIELDS,
	EQUIPMENT_UPDATE_FIELDS,
	FORMULATION_INSECTICIDE_UPDATE_FIELDS,
	FORMULATION_UPDATE_FIELDS,
	INSECTICIDE_BATCH_UPDATE_FIELDS,
	INSECTICIDE_UPDATE_FIELDS,
	METHOD_UPDATE_FIELDS,
	OUTREACH_ACTION_UPDATE_FIELDS,
	REQUESTED_CONTROL_ACTION_UPDATE_FIELDS,
	SOURCE_REDUCTION_UPDATE_FIELDS,
	updateApplicationMethodCommand,
	updateBiocontrolActionFieldDetailsCommand,
	updateBiocontrolMethodCommand,
	updateChemicalApplicationFieldDetailsCommand,
	updateEquipmentCommand,
	updateFormulationDetailsCommand,
	updateFormulationInsecticideCommand,
	updateInsecticideBatchCommand,
	updateInsecticideCommand,
	updateOutreachActionFieldDetailsCommand,
	updateOutreachMethodCommand,
	updateRequestedControlActionDetailsCommand,
	updateSourceReductionFieldDetailsCommand,
	updateSourceReductionMethodCommand,
	updateVehicleCommand,
	VEHICLE_UPDATE_FIELDS,
} from '../../control-operations/index.js';
import {
	ASSIGNMENT_ITEM_UPDATE_FIELDS,
	ASSIGNMENT_UPDATE_FIELDS,
	ROUTE_ITEM_UPDATE_FIELDS,
	ROUTE_UPDATE_FIELDS,
	TAG_UPDATE_FIELDS,
	updateAssignmentDetailsCommand,
	updateAssignmentItemCommand,
	updateRouteDetailsCommand,
	updateRouteItemCommand,
	updateTagCommand,
} from '../../field-work/index.js';
import {
	ADDRESS_UPDATE_FIELDS,
	COLLECTION_LURE_UPDATE_FIELDS,
	COLLECTION_METHOD_UPDATE_FIELDS,
	GENUS_UPDATE_FIELDS,
	HABITAT_TYPE_UPDATE_FIELDS,
	REGION_FOLDER_UPDATE_FIELDS,
	REGION_UPDATE_FIELDS,
	SPECIES_UPDATE_FIELDS,
	UNIT_UPDATE_FIELDS,
	updateAddressDetailsCommand,
	updateCollectionLureCommand,
	updateCollectionMethodCommand,
	updateGenusCommand,
	updateHabitatTypeCommand,
	updateRegionDetailsCommand,
	updateRegionFolderCommand,
	updateSpeciesCommand,
	updateUnitCommand,
} from '../../foundation/index.js';
import { PROFILE_UPDATE_FIELDS, updateProfileCommand } from '../../identity/index.js';
import {
	AD_HOC_INSPECTION_LOCATION_UPDATE_FIELDS,
	HABITAT_CONFIGURATION_UPDATE_FIELDS,
	HABITAT_UPDATE_FIELDS,
	INSPECTION_SAMPLE_UPDATE_FIELDS,
	SAMPLE_SPECIES_COUNT_UPDATE_FIELDS,
	updateAdHocInspectionLocationCommand,
	updateHabitatConfigurationCommand,
	updateHabitatDetailsCommand,
	updateInspectionSampleCommand,
	updateSampleSpeciesCountCommand,
} from '../../larval-surveillance/index.js';
import {
	MISSION_DETAILS_UPDATE_FIELDS,
	MISSION_PLAN_UPDATE_FIELDS,
	MISSION_SCHEDULE_UPDATE_FIELDS,
	updateMissionDetailsCommand,
	updateMissionPlanCommand,
	updateMissionScheduleCommand,
} from '../../mission-dispatch/index.js';
import {
	CONTACT_COMMUNICATION_UPDATE_FIELDS,
	CONTACT_DETAILS_UPDATE_FIELDS,
	NOTIFICATION_REGISTRATION_FLAG_UPDATE_FIELDS,
	NOTIFICATION_TYPE_UPDATE_FIELDS,
	SERVICE_REQUEST_UPDATE_FIELDS,
	updateContactCommunicationCommand,
	updateContactDetailsCommand,
	updateNotificationRegistrationFlagsCommand,
	updateNotificationTypeCommand,
	updateServiceRequestDetailsCommand,
} from '../../public-engagement/index.js';
import { DomainValidationError } from '../../shared.js';
import type { UpdateFieldSet } from '../../update-command-fields.js';
import {
	normalizeUpdateFields,
	requiredTextField,
	type UpdateFieldsChanges,
	type UpdateFieldsInput,
} from '../../update-command-fields.js';
import {
	updateWeatherStationDetailsCommand,
	updateWeatherSummaryCommand,
	WEATHER_STATION_UPDATE_FIELDS,
	WEATHER_SUMMARY_RANGE_UPDATE_FIELDS,
} from '../../weather/index.js';

const organizationId = '11111111-1111-4111-8111-111111111111';
const actorProfileId = '22222222-2222-4222-8222-222222222222';
const operatorUserId = '33333333-3333-4333-8333-333333333333';
const recordId = '44444444-4444-4444-8444-444444444444';
const otherId = '55555555-5555-4555-8555-555555555555';

const org = { organizationId, actorProfileId };
const operator = { operatorUserId };
const point = { kind: 'geometry', geometry: { type: 'Point', coordinates: [-90, 35] } } as const;

/**
 * One update command, as this suite drives it.
 *
 * `fields` is the descriptor the command declares, `samples` a value for each
 * of its keys, and `base` whatever else the command needs before it will build
 * at all: the record's id, and any acknowledgement the change requires. The
 * cases are typed loosely on purpose, because the point is to run one assertion
 * over 50 differently-shaped commands. A sample of the wrong type is still
 * caught: the builder reports it as an issue and throws, and the case fails.
 */
interface UpdateCase {
	readonly name: string;
	readonly fields: UpdateFieldSet;
	readonly base: Readonly<Record<string, unknown>>;
	readonly samples: Readonly<Record<string, unknown>>;
	readonly build: (input: never) => { readonly payload: { readonly changes: unknown } };
}

function updateCase(entry: UpdateCase): UpdateCase {
	return entry;
}

const CASES: readonly UpdateCase[] = [
	updateCase({
		name: 'adultSurveillance.updateTrapDetails',
		fields: TRAP_DETAILS_UPDATE_FIELDS,
		base: { ...org, trapId: recordId },
		samples: { trapName: 'North culvert', trapCode: 'NC-1', description: 'Beside the gate' },
		build: updateTrapDetailsCommand,
	}),
	updateCase({
		name: 'adultSurveillance.updateTrapConfiguration',
		fields: TRAP_CONFIGURATION_UPDATE_FIELDS,
		base: {
			...org,
			trapId: recordId,
			acknowledgedTrapLocationSemanticsChange: true,
			acknowledgedTrapMethodSemanticsChange: true,
		},
		samples: {
			locationSource: point,
			collectionMethodId: otherId,
			addressId: otherId,
			collectionLureId: otherId,
		},
		build: updateTrapConfigurationCommand,
	}),
	updateCase({
		name: 'adultSurveillance.updateCollectionFieldDetails',
		fields: COLLECTION_FIELD_DETAILS_UPDATE_FIELDS,
		base: { ...org, collectionId: recordId },
		samples: {
			timing: { mode: 'exact_timestamps', startedAt: new Date('2026-01-02T03:04:05.000Z') },
			setByProfileId: otherId,
			collectedByProfileId: otherId,
			hasProblem: true,
			metadata: { note: 'wet' },
		},
		build: updateCollectionFieldDetailsCommand,
	}),
	updateCase({
		name: 'adultSurveillance.updateAdHocCollectionConfiguration',
		fields: AD_HOC_COLLECTION_UPDATE_FIELDS,
		base: { ...org, collectionId: recordId },
		samples: {
			collectionMethodId: otherId,
			locationSource: point,
			collectionLureId: otherId,
			addressId: otherId,
		},
		build: updateAdHocCollectionConfigurationCommand,
	}),
	updateCase({
		name: 'adultSurveillance.updateCollectionSpeciesCount',
		fields: COLLECTION_SPECIES_COUNT_UPDATE_FIELDS,
		base: { ...org, collectionSpeciesId: recordId },
		samples: {
			count: 4,
			speciesId: otherId,
			sex: 'female',
			status: 'gravid',
			identifiedByProfileId: otherId,
			identifiedDate: '2026-01-02',
		},
		build: updateCollectionSpeciesCountCommand,
	}),
	updateCase({
		name: 'controlOperations.updateChemicalApplicationFieldDetails',
		fields: CHEMICAL_APPLICATION_UPDATE_FIELDS,
		base: { ...org, applicationId: recordId },
		samples: {
			applicationDate: '2026-01-02',
			applicatorProfileId: otherId,
			applicationMethodId: otherId,
			insecticideId: otherId,
			amountApplied: 2.5,
			applicationUnitId: otherId,
			vehicleId: otherId,
			equipmentId: otherId,
			metadata: { note: 'windy' },
		},
		build: updateChemicalApplicationFieldDetailsCommand,
	}),
	updateCase({
		name: 'controlOperations.updateSourceReductionFieldDetails',
		fields: SOURCE_REDUCTION_UPDATE_FIELDS,
		base: { ...org, sourceReductionId: recordId },
		samples: {
			sourceReductionDate: '2026-01-02',
			technicianProfileId: otherId,
			sourceReductionMethodId: otherId,
			sourcesEliminatedAmount: 3,
			sourcesEliminatedUnitId: otherId,
			metadata: { note: 'tyres' },
		},
		build: updateSourceReductionFieldDetailsCommand,
	}),
	updateCase({
		name: 'controlOperations.updateOutreachActionFieldDetails',
		fields: OUTREACH_ACTION_UPDATE_FIELDS,
		base: { ...org, outreachActionId: recordId },
		samples: {
			outreachDate: '2026-01-02',
			technicianProfileId: otherId,
			outreachMethodId: otherId,
			reach: 30,
			reachDescription: 'Two classrooms',
			metadata: { note: 'school' },
		},
		build: updateOutreachActionFieldDetailsCommand,
	}),
	updateCase({
		name: 'controlOperations.updateBiocontrolActionFieldDetails',
		fields: BIOCONTROL_ACTION_UPDATE_FIELDS,
		base: { ...org, biocontrolActionId: recordId },
		samples: {
			biocontrolDate: '2026-01-02',
			technicianProfileId: otherId,
			biocontrolMethodId: otherId,
			amountReleased: 12,
			releaseUnitId: otherId,
			metadata: { note: 'fish' },
		},
		build: updateBiocontrolActionFieldDetailsCommand,
	}),
	updateCase({
		name: 'controlOperations.updateVehicle',
		fields: VEHICLE_UPDATE_FIELDS,
		base: { ...org, vehicleId: recordId },
		samples: { vehicleName: 'Truck 4', metadata: { plate: 'ABC' } },
		build: updateVehicleCommand,
	}),
	updateCase({
		name: 'controlOperations.updateEquipment',
		fields: EQUIPMENT_UPDATE_FIELDS,
		base: { ...org, equipmentId: recordId },
		samples: { equipmentName: 'Sprayer 2', serialNumber: 'SN-9', metadata: { bought: '2024' } },
		build: updateEquipmentCommand,
	}),
	updateCase({
		name: 'controlOperations.updateApplicationMethod',
		fields: METHOD_UPDATE_FIELDS,
		base: { ...org, applicationMethodId: recordId },
		samples: { name: 'Backpack', customSchema: { fields: [] } },
		build: updateApplicationMethodCommand,
	}),
	updateCase({
		name: 'controlOperations.updateSourceReductionMethod',
		fields: METHOD_UPDATE_FIELDS,
		base: { ...org, sourceReductionMethodId: recordId },
		samples: { name: 'Tyre removal', customSchema: { fields: [] } },
		build: updateSourceReductionMethodCommand,
	}),
	updateCase({
		name: 'controlOperations.updateOutreachMethod',
		fields: METHOD_UPDATE_FIELDS,
		base: { ...org, outreachMethodId: recordId },
		samples: { name: 'School visit', customSchema: { fields: [] } },
		build: updateOutreachMethodCommand,
	}),
	updateCase({
		name: 'controlOperations.updateBiocontrolMethod',
		fields: METHOD_UPDATE_FIELDS,
		base: { ...org, biocontrolMethodId: recordId },
		samples: { name: 'Gambusia', customSchema: { fields: [] } },
		build: updateBiocontrolMethodCommand,
	}),
	updateCase({
		name: 'controlOperations.updateInsecticide',
		fields: INSECTICIDE_UPDATE_FIELDS,
		base: { ...org, insecticideId: recordId },
		samples: {
			tradeName: 'Altosid',
			activeIngredient: 'Methoprene',
			type: 'larvicide',
			registrationNumber: '2724-375',
			defaultUnitId: otherId,
			labelUrl: 'https://example.com/label',
			msdsUrl: 'https://example.com/msds',
			shorthand: 'ALT',
			metadata: { note: 'granular' },
		},
		build: updateInsecticideCommand,
	}),
	updateCase({
		name: 'controlOperations.updateInsecticideBatch',
		fields: INSECTICIDE_BATCH_UPDATE_FIELDS,
		base: { ...org, insecticideBatchId: recordId },
		samples: { batchName: 'Lot 21' },
		build: updateInsecticideBatchCommand,
	}),
	updateCase({
		name: 'controlOperations.updateFormulationDetails',
		fields: FORMULATION_UPDATE_FIELDS,
		base: { ...org, formulationId: recordId },
		samples: {
			formulationName: 'Adulticide mix',
			description: 'Nightly fog',
			batchSize: 26,
			batchUnitId: otherId,
		},
		build: updateFormulationDetailsCommand,
	}),
	updateCase({
		name: 'controlOperations.updateFormulationInsecticide',
		fields: FORMULATION_INSECTICIDE_UPDATE_FIELDS,
		base: { ...org, formulationInsecticideId: recordId },
		samples: { insecticideId: otherId, amount: 0.5, unitId: otherId },
		build: updateFormulationInsecticideCommand,
	}),
	updateCase({
		name: 'controlOperations.updateRequestedControlActionDetails',
		fields: REQUESTED_CONTROL_ACTION_UPDATE_FIELDS,
		base: { ...org, requestedControlActionId: recordId },
		samples: {
			controlType: 'application',
			recommendedMethodId: otherId,
			summary: 'Fog the block',
			requestedByProfileId: otherId,
			requestedAt: new Date('2026-01-02T03:04:05.000Z'),
		},
		build: updateRequestedControlActionDetailsCommand,
	}),
	updateCase({
		name: 'fieldWork.updateAssignmentDetails',
		fields: ASSIGNMENT_UPDATE_FIELDS,
		base: { ...org, assignmentId: recordId },
		samples: {
			assignmentDate: '2026-01-02',
			assignmentName: 'Tuesday north',
			assignedToProfileId: otherId,
			dueAt: new Date('2026-01-02T03:04:05.000Z'),
		},
		build: updateAssignmentDetailsCommand,
	}),
	updateCase({
		name: 'fieldWork.updateAssignmentItem',
		fields: ASSIGNMENT_ITEM_UPDATE_FIELDS,
		base: { ...org, assignmentItemId: recordId },
		samples: { directionsToNextItem: 'Left at the bridge' },
		build: updateAssignmentItemCommand,
	}),
	updateCase({
		name: 'fieldWork.updateRouteDetails',
		fields: ROUTE_UPDATE_FIELDS,
		base: { ...org, routeId: recordId },
		samples: { routeName: 'North loop' },
		build: updateRouteDetailsCommand,
	}),
	updateCase({
		name: 'fieldWork.updateRouteItem',
		fields: ROUTE_ITEM_UPDATE_FIELDS,
		base: { ...org, routeItemId: recordId },
		samples: { directionsToNextItem: 'Left at the bridge' },
		build: updateRouteItemCommand,
	}),
	updateCase({
		name: 'fieldWork.updateTag',
		fields: TAG_UPDATE_FIELDS,
		base: { ...org, tagId: recordId },
		samples: { tagName: 'Priority', description: 'Watch this one', color: '#ff8800' },
		build: updateTagCommand,
	}),
	updateCase({
		name: 'foundation.updateAddressDetails',
		fields: ADDRESS_UPDATE_FIELDS,
		base: { ...org, addressId: recordId },
		samples: {
			displayName: '12 Mill Road',
			addressLine1: '12 Mill Road',
			addressLine2: 'Unit B',
			locality: 'Springfield',
			region: 'CA',
			postalCode: '95814',
			geocoderResponse: { provider: 'mapbox' },
		},
		build: updateAddressDetailsCommand,
	}),
	updateCase({
		name: 'foundation.updateCollectionMethod',
		fields: COLLECTION_METHOD_UPDATE_FIELDS,
		base: { ...org, collectionMethodId: recordId },
		samples: {
			name: 'CDC light trap',
			description: 'Overnight',
			customSchema: { fields: [] },
			actionThreshold: 25,
		},
		build: updateCollectionMethodCommand,
	}),
	updateCase({
		name: 'foundation.updateCollectionLure',
		fields: COLLECTION_LURE_UPDATE_FIELDS,
		base: { ...org, collectionLureId: recordId },
		samples: { name: 'Dry ice', description: 'One brick' },
		build: updateCollectionLureCommand,
	}),
	updateCase({
		name: 'foundation.updateHabitatType',
		fields: HABITAT_TYPE_UPDATE_FIELDS,
		base: { ...org, habitatTypeId: recordId },
		samples: { name: 'Storm drain', description: 'Roadside', customSchema: { fields: [] } },
		build: updateHabitatTypeCommand,
	}),
	updateCase({
		name: 'foundation.updateGenus',
		fields: GENUS_UPDATE_FIELDS,
		base: { ...operator, genusId: recordId },
		samples: { abbreviation: 'Cx', name: 'Culex' },
		build: updateGenusCommand,
	}),
	updateCase({
		name: 'foundation.updateSpecies',
		fields: SPECIES_UPDATE_FIELDS,
		base: { ...operator, speciesId: recordId },
		samples: {
			genusId: otherId,
			epithet: 'tarsalis',
			commonName: 'Western encephalitis mosquito',
			displayName: 'Cx. tarsalis',
		},
		build: updateSpeciesCommand,
	}),
	updateCase({
		name: 'foundation.updateRegionFolder',
		fields: REGION_FOLDER_UPDATE_FIELDS,
		base: { ...org, regionFolderId: recordId },
		samples: { name: 'Zones', description: 'Operational zones' },
		build: updateRegionFolderCommand,
	}),
	updateCase({
		name: 'foundation.updateRegionDetails',
		fields: REGION_UPDATE_FIELDS,
		base: { ...org, regionId: recordId },
		samples: { name: 'Zone 3', description: 'North of the river', metadata: { colour: 'blue' } },
		build: updateRegionDetailsCommand,
	}),
	updateCase({
		name: 'foundation.updateUnit',
		fields: UNIT_UPDATE_FIELDS,
		base: { ...operator, unitId: recordId, acknowledgedUnitCodeChange: true },
		samples: {
			code: 'gal',
			unitName: 'gallon',
			abbreviation: 'gal',
			unitType: 'volume',
			unitSystem: 'us_customary',
		},
		build: updateUnitCommand,
	}),
	updateCase({
		name: 'identity.updateProfile',
		fields: PROFILE_UPDATE_FIELDS,
		base: { ...org, profileId: recordId },
		samples: { displayName: 'Dana Reyes', isActive: true },
		build: updateProfileCommand,
	}),
	updateCase({
		name: 'larvalSurveillance.updateHabitatDetails',
		fields: HABITAT_UPDATE_FIELDS,
		base: { ...org, habitatId: recordId },
		samples: {
			habitatName: 'Mill pond',
			description: 'Standing water behind the mill',
			metadata: { access: 'gate' },
		},
		build: updateHabitatDetailsCommand,
	}),
	updateCase({
		name: 'larvalSurveillance.updateHabitatConfiguration',
		fields: HABITAT_CONFIGURATION_UPDATE_FIELDS,
		base: { ...org, habitatId: recordId, acknowledgedHabitatConfigurationSemanticsChange: true },
		samples: { addressId: otherId, habitatTypeId: otherId },
		build: updateHabitatConfigurationCommand,
	}),
	updateCase({
		name: 'larvalSurveillance.updateAdHocInspectionLocation',
		fields: AD_HOC_INSPECTION_LOCATION_UPDATE_FIELDS,
		base: { ...org, inspectionId: recordId },
		samples: { locationSource: point, addressId: otherId, habitatTypeId: otherId },
		build: updateAdHocInspectionLocationCommand,
	}),
	updateCase({
		name: 'larvalSurveillance.updateInspectionSample',
		fields: INSPECTION_SAMPLE_UPDATE_FIELDS,
		base: { ...org, sampleId: recordId },
		samples: { displayName: 'Dip 3' },
		build: updateInspectionSampleCommand,
	}),
	updateCase({
		name: 'larvalSurveillance.updateSampleSpeciesCount',
		fields: SAMPLE_SPECIES_COUNT_UPDATE_FIELDS,
		base: { ...org, sampleSpeciesId: recordId },
		samples: {
			speciesId: otherId,
			larvaeCount: 6,
			identifiedByProfileId: otherId,
			identifiedAt: '2026-01-02',
		},
		build: updateSampleSpeciesCountCommand,
	}),
	updateCase({
		name: 'missionDispatch.updateMissionDetails',
		fields: MISSION_DETAILS_UPDATE_FIELDS,
		base: { ...org, missionId: recordId },
		samples: { missionName: 'Tuesday fog' },
		build: updateMissionDetailsCommand,
	}),
	updateCase({
		name: 'missionDispatch.updateMissionSchedule',
		fields: MISSION_SCHEDULE_UPDATE_FIELDS,
		base: { ...org, missionId: recordId },
		samples: {
			scheduledStartAt: new Date('2026-06-02T03:04:05.000Z'),
			scheduledEndAt: new Date('2026-06-02T05:04:05.000Z'),
			rainDate: '2026-06-03',
		},
		build: updateMissionScheduleCommand,
	}),
	updateCase({
		name: 'missionDispatch.updateMissionPlan',
		fields: MISSION_PLAN_UPDATE_FIELDS,
		base: { ...org, missionId: recordId },
		samples: { controlType: 'application', plannedMethodId: otherId },
		build: updateMissionPlanCommand,
	}),
	updateCase({
		name: 'publicEngagement.updateContactDetails',
		fields: CONTACT_DETAILS_UPDATE_FIELDS,
		base: { ...org, contactId: recordId },
		samples: {
			contactName: 'Dana Reyes',
			company: 'Mill Works',
			department: 'Facilities',
			title: 'Manager',
		},
		build: updateContactDetailsCommand,
	}),
	updateCase({
		name: 'publicEngagement.updateContactCommunication',
		fields: CONTACT_COMMUNICATION_UPDATE_FIELDS,
		base: { ...org, contactId: recordId },
		samples: {
			preferredPhone: '555-0100',
			alternatePhone: '555-0101',
			email: 'dana@example.com',
			wantsEmail: true,
			wantsSms: true,
			wantsPhone: true,
		},
		build: updateContactCommunicationCommand,
	}),
	updateCase({
		name: 'publicEngagement.updateNotificationType',
		fields: NOTIFICATION_TYPE_UPDATE_FIELDS,
		base: { ...org, notificationTypeId: recordId },
		samples: { name: 'Spray notice', description: 'Night before' },
		build: updateNotificationTypeCommand,
	}),
	updateCase({
		name: 'publicEngagement.updateNotificationRegistrationFlags',
		fields: NOTIFICATION_REGISTRATION_FLAG_UPDATE_FIELDS,
		base: { ...org, notificationRegistrationId: recordId },
		samples: { hasBees: true, isNoSpray: true },
		build: updateNotificationRegistrationFlagsCommand,
	}),
	updateCase({
		name: 'publicEngagement.updateServiceRequestDetails',
		fields: SERVICE_REQUEST_UPDATE_FIELDS,
		base: { ...org, serviceRequestId: recordId },
		samples: {
			requestDate: '2026-01-02',
			intakeType: 'phone',
			receivedByProfileId: otherId,
			details: 'Mosquitoes in the yard',
		},
		build: updateServiceRequestDetailsCommand,
	}),
	updateCase({
		name: 'weather.updateWeatherStationDetails',
		fields: WEATHER_STATION_UPDATE_FIELDS,
		base: { ...org, weatherStationId: recordId },
		samples: { stationName: 'Mill Road', stationCode: 'MR-1', metadata: { source: 'nws' } },
		build: updateWeatherStationDetailsCommand,
	}),
	updateCase({
		name: 'weather.updateWeatherSummary',
		fields: WEATHER_SUMMARY_RANGE_UPDATE_FIELDS,
		base: { ...org, weatherSummaryId: recordId },
		samples: { startDate: '2026-01-02', endDate: '2026-01-09' },
		build: updateWeatherSummaryCommand,
	}),
];

describe('update command field descriptors', () => {
	it('covers every update command that carries a field descriptor', () => {
		expect(CASES).toHaveLength(50);
	});

	for (const testCase of CASES) {
		describe(testCase.name, () => {
			it('names a sample for every field it declares', () => {
				expect(Object.keys(testCase.samples).sort()).toEqual(Object.keys(testCase.fields).sort());
			});

			for (const field of Object.keys(testCase.fields)) {
				it(`carries ${field} into changes when it is the only field named`, () => {
					const command = testCase.build({
						...testCase.base,
						[field]: testCase.samples[field],
					} as never);
					const changes = command.payload.changes as Record<string, unknown>;
					expect(Object.keys(changes)).toEqual([field]);
					expect(changes[field]).toBeDefined();
				});
			}

			it('refuses a payload naming no field at all', () => {
				expect(() => testCase.build(testCase.base as never)).toThrow(DomainValidationError);
			});
		});
	}
});

describe('a field the descriptor leaves out', () => {
	const FIELDS = { displayName: requiredTextField(200) } satisfies UpdateFieldSet;

	it('is not on the input type, so a caller naming it fails tsc', () => {
		const input: UpdateFieldsInput<typeof FIELDS> = {
			displayName: 'Dana Reyes',
			// @ts-expect-error - `note` is not a field this descriptor declares.
			note: 'dropped',
		};
		expect(input.displayName).toBe('Dana Reyes');
	});

	it('is not on the changes type, so a reader of it fails tsc', () => {
		const changes: UpdateFieldsChanges<typeof FIELDS> = normalizeUpdateFields(
			{ displayName: 'Dana Reyes' },
			FIELDS,
			'At least one field must change.',
			[],
		);
		// @ts-expect-error - `note` is not a field this descriptor declares.
		expect(changes.note).toBeUndefined();
	});
});
