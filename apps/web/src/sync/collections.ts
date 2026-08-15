import {
	type AdditionalPersonnelRow,
	type AddressRow,
	type AdultCollectionRow,
	type ApplicationBatchRow,
	type ApplicationRow,
	type AssignmentItemRow,
	type AssignmentRow,
	additionalPersonnelSyncDescriptor,
	addressesSyncDescriptor,
	applicationBatchesSyncDescriptor,
	applicationMethodsSyncDescriptor,
	applicationsSyncDescriptor,
	assignmentItemsSyncDescriptor,
	assignmentsSyncDescriptor,
	type BiocontrolActionRow,
	biocontrolActionsSyncDescriptor,
	biocontrolMethodsSyncDescriptor,
	type CollectionLureRow,
	type CollectionMethodRow,
	type CollectionSpeciesRow,
	type CommentRow,
	type ContactRow,
	type ControlMethodRow,
	collectionLuresSyncDescriptor,
	collectionMethodsSyncDescriptor,
	collectionSpeciesSyncDescriptor,
	collectionsSyncDescriptor,
	commentsSyncDescriptor,
	contactsSyncDescriptor,
	currentOrganizationSyncDescriptor,
	type EquipmentRow,
	electricShapeCollectionOptions,
	equipmentSyncDescriptor,
	type FormulationInsecticideRow,
	type FormulationRow,
	formulationInsecticidesSyncDescriptor,
	formulationsSyncDescriptor,
	type GenusRow,
	generaSyncDescriptor,
	type HabitatRow,
	type HabitatTypeRow,
	habitatsSyncDescriptor,
	habitatTypesSyncDescriptor,
	type InsecticideBatchRow,
	type InsecticideRow,
	type InspectionRow,
	insecticideBatchesSyncDescriptor,
	insecticidesSyncDescriptor,
	inspectionsSyncDescriptor,
	type MembershipRow,
	type MissionItemRow,
	type MissionNotificationRow,
	type MissionRow,
	membershipsSyncDescriptor,
	missionItemsSyncDescriptor,
	missionNotificationsSyncDescriptor,
	missionsSyncDescriptor,
	type NotificationRegistrationRow,
	type NotificationRegistrationTypeRow,
	type NotificationTypeRow,
	notificationRegistrationsSyncDescriptor,
	notificationRegistrationTypesSyncDescriptor,
	notificationTypesSyncDescriptor,
	type OrganizationRow,
	type OrganizationSpeciesRow,
	type OutreachActionRow,
	organizationSpeciesSyncDescriptor,
	outreachActionsSyncDescriptor,
	outreachMethodsSyncDescriptor,
	type ProfileRow,
	profilesSyncDescriptor,
	type RegionFolderRow,
	type RegionRow,
	type RequestedControlActionRow,
	type RouteItemRow,
	type RouteRow,
	regionFoldersSyncDescriptor,
	regionsSyncDescriptor,
	requestedControlActionsSyncDescriptor,
	routeItemsSyncDescriptor,
	routesSyncDescriptor,
	type SampleRow,
	type SampleSpeciesRow,
	type ServiceRequestRow,
	type SourceReductionRow,
	type SpeciesRow,
	type SyncDescriptor,
	sampleSpeciesSyncDescriptor,
	samplesSyncDescriptor,
	serviceRequestsSyncDescriptor,
	sourceReductionMethodsSyncDescriptor,
	sourceReductionsSyncDescriptor,
	speciesSyncDescriptor,
	type TagItemRow,
	type TagRow,
	type TrapRow,
	tagItemsSyncDescriptor,
	tagsSyncDescriptor,
	trapsSyncDescriptor,
	type UnitRow,
	unitsSyncDescriptor,
	type VehicleRow,
	vehiclesSyncDescriptor,
	type WeatherSourceRow,
	type WeatherSummaryRow,
	type WebSyncMode,
	weatherSourcesSyncDescriptor,
	weatherSummariesSyncDescriptor,
} from '@simmer-mosquito/sync';
import { BasicIndex, type Collection, createCollection } from '@tanstack/react-db';
import { createAddressMutationHandlers } from './addressMutations';
import {
	createCollectionMutationHandlers,
	createCollectionSpeciesMutationHandlers,
	createTrapMutationHandlers,
} from './adultSurveillanceMutations';
import {
	createEquipmentMutationHandlers,
	createVehicleMutationHandlers,
} from './controlAssetMutations';
import { createControlMethodMutationHandlers } from './controlMethodMutations';
import {
	createApplicationBatchMutationHandlers,
	createApplicationMutationHandlers,
	createBiocontrolActionMutationHandlers,
	createFormulationInsecticideMutationHandlers,
	createFormulationMutationHandlers,
	createOutreachActionMutationHandlers,
	createRequestedControlActionMutationHandlers,
	createSourceReductionMutationHandlers,
} from './controlOperationsMutations';
import {
	createInsecticideBatchMutationHandlers,
	createInsecticideMutationHandlers,
} from './controlProductMutations';
import {
	createAdditionalPersonnelMutationHandlers,
	createAssignmentItemMutationHandlers,
	createAssignmentMutationHandlers,
	createCommentMutationHandlers,
	createMissionItemMutationHandlers,
	createMissionMutationHandlers,
	createRouteItemMutationHandlers,
	createRouteMutationHandlers,
	createTagItemMutationHandlers,
} from './fieldWorkMissionMutations';
import {
	createOrganizationSpeciesMutationHandlers,
	createRegionFolderMutationHandlers,
	createRegionMutationHandlers,
} from './foundationGeographyMutations';
import { createHabitatMutationHandlers } from './habitatMutations';
import {
	createInspectionMutationHandlers,
	createSampleMutationHandlers,
	createSampleSpeciesMutationHandlers,
} from './larvalSurveillanceMutations';
import { createNotificationTypeMutationHandlers } from './notificationTypeMutations';
import { createOrganizationMutationHandlers } from './organizationMutations';
import { createOrgLookupMutationHandlers } from './orgLookupMutations';
import { createProfileMutationHandlers } from './profileMutations';
import {
	createContactMutationHandlers,
	createMissionNotificationMutationHandlers,
	createNotificationRegistrationMutationHandlers,
	createNotificationRegistrationTypeMutationHandlers,
	createServiceRequestMutationHandlers,
} from './publicEngagementMutations';
import { webSyncModes } from './sync-modes';
import { createTagMutationHandlers } from './tagMutations';

export interface WebCollections {
	readonly additionalPersonnel: Collection<AdditionalPersonnelRow, string | number>;
	readonly addresses: Collection<AddressRow, string | number>;
	readonly applicationBatches: Collection<ApplicationBatchRow, string | number>;
	readonly applicationMethods: Collection<ControlMethodRow, string | number>;
	readonly applications: Collection<ApplicationRow, string | number>;
	readonly assignmentItems: Collection<AssignmentItemRow, string | number>;
	readonly assignments: Collection<AssignmentRow, string | number>;
	readonly biocontrolActions: Collection<BiocontrolActionRow, string | number>;
	readonly biocontrolMethods: Collection<ControlMethodRow, string | number>;
	readonly collectionSpecies: Collection<CollectionSpeciesRow, string | number>;
	readonly collectionLures: Collection<CollectionLureRow, string | number>;
	readonly collectionMethods: Collection<CollectionMethodRow, string | number>;
	readonly collections: Collection<AdultCollectionRow, string | number>;
	readonly comments: Collection<CommentRow, string | number>;
	readonly contacts: Collection<ContactRow, string | number>;
	readonly equipment: Collection<EquipmentRow, string | number>;
	readonly formulationInsecticides: Collection<FormulationInsecticideRow, string | number>;
	readonly formulations: Collection<FormulationRow, string | number>;
	readonly genera: Collection<GenusRow, string | number>;
	readonly habitats: Collection<HabitatRow, string | number>;
	readonly habitatTypes: Collection<HabitatTypeRow, string | number>;
	readonly insecticideBatches: Collection<InsecticideBatchRow, string | number>;
	readonly insecticides: Collection<InsecticideRow, string | number>;
	readonly inspections: Collection<InspectionRow, string | number>;
	readonly memberships: Collection<MembershipRow, string | number>;
	readonly missionItems: Collection<MissionItemRow, string | number>;
	readonly missionNotifications: Collection<MissionNotificationRow, string | number>;
	readonly missions: Collection<MissionRow, string | number>;
	readonly notificationRegistrations: Collection<NotificationRegistrationRow, string | number>;
	readonly notificationRegistrationTypes: Collection<
		NotificationRegistrationTypeRow,
		string | number
	>;
	readonly notificationTypes: Collection<NotificationTypeRow, string | number>;
	readonly currentOrganization: Collection<OrganizationRow, string | number>;
	readonly organizationSpecies: Collection<OrganizationSpeciesRow, string | number>;
	readonly outreachActions: Collection<OutreachActionRow, string | number>;
	readonly outreachMethods: Collection<ControlMethodRow, string | number>;
	readonly profiles: Collection<ProfileRow, string | number>;
	readonly regionFolders: Collection<RegionFolderRow, string | number>;
	readonly regions: Collection<RegionRow, string | number>;
	readonly requestedControlActions: Collection<RequestedControlActionRow, string | number>;
	readonly routeItems: Collection<RouteItemRow, string | number>;
	readonly routes: Collection<RouteRow, string | number>;
	readonly samples: Collection<SampleRow, string | number>;
	readonly sampleSpecies: Collection<SampleSpeciesRow, string | number>;
	readonly serviceRequests: Collection<ServiceRequestRow, string | number>;
	readonly sourceReductions: Collection<SourceReductionRow, string | number>;
	readonly species: Collection<SpeciesRow, string | number>;
	readonly sourceReductionMethods: Collection<ControlMethodRow, string | number>;
	readonly tagItems: Collection<TagItemRow, string | number>;
	readonly tags: Collection<TagRow, string | number>;
	readonly traps: Collection<TrapRow, string | number>;
	readonly units: Collection<UnitRow, string | number>;
	readonly vehicles: Collection<VehicleRow, string | number>;
	readonly weatherSources: Collection<WeatherSourceRow, string | number>;
	readonly weatherSummaries: Collection<WeatherSummaryRow, string | number>;
}

export const webBaselineCollectionKeys = [
	'units',
	'profiles',
	'memberships',
	'genera',
	'species',
	'organizationSpecies',
	'currentOrganization',
	'collectionMethods',
	'collectionLures',
	'habitatTypes',
	'applicationMethods',
	'sourceReductionMethods',
	'outreachMethods',
	'biocontrolMethods',
	'vehicles',
	'equipment',
	'insecticides',
	'notificationTypes',
	'tags',
	'routes',
	'regionFolders',
	'traps',
	'formulations',
	'formulationInsecticides',
	'weatherSources',
] as const satisfies readonly (keyof WebCollections)[];

interface PreloadableCollection {
	readonly preload: () => Promise<unknown>;
}

/**
 * Sort indexes.
 *
 * A TanStack DB query that pairs `orderBy` with `limit` can only page lazily
 * when the sorted column is indexed. Without one it silently sorts the whole
 * collection to hand back six rows, and says so in a console warning — which is
 * how the habitat pickers were found doing it on every keystroke.
 *
 * Indexes are declared per column rather than switching the collections to
 * `autoIndex: 'eager'`: only a handful of columns are ever sorted-and-limited
 * (the typeahead pickers), and eager auto-indexing would build and maintain
 * indexes for every column of every collection to serve them. Each one is
 * written next to its collection with a note naming the surface that sorts by
 * it, so an index that outlives its picker is visible as dead weight.
 */
function createReadOnlyWebCollection<TRow extends { readonly id: string }>(
	descriptor: SyncDescriptor<TRow>,
	shapeServerUrl: string,
	syncMode: WebSyncMode,
): Collection<TRow, string | number> {
	return createCollection(
		electricShapeCollectionOptions<TRow>({
			descriptor,
			url: `${shapeServerUrl}${descriptor.endpointPath}`,
			syncMode,
		}),
	);
}

export function createWebCollections(options: {
	readonly serverUrl: string;
	readonly shapeServerUrl?: string;
}): WebCollections {
	const shapeServerUrl = options.shapeServerUrl ?? options.serverUrl;
	const units = createCollection(
		electricShapeCollectionOptions<UnitRow>({
			descriptor: unitsSyncDescriptor,
			syncMode: webSyncModes.units,
			url: `${shapeServerUrl}${unitsSyncDescriptor.endpointPath}`,
		}),
	);
	const profiles = createCollection(
		electricShapeCollectionOptions<ProfileRow>({
			descriptor: profilesSyncDescriptor,
			syncMode: webSyncModes.profiles,
			url: `${shapeServerUrl}${profilesSyncDescriptor.endpointPath}`,
			...createProfileMutationHandlers({
				serverUrl: options.serverUrl,
			}),
		}),
	);
	const memberships = createCollection(
		electricShapeCollectionOptions<MembershipRow>({
			descriptor: membershipsSyncDescriptor,
			syncMode: webSyncModes.memberships,
			url: `${shapeServerUrl}${membershipsSyncDescriptor.endpointPath}`,
		}),
	);
	const genera = createCollection(
		electricShapeCollectionOptions<GenusRow>({
			descriptor: generaSyncDescriptor,
			syncMode: webSyncModes.genera,
			url: `${shapeServerUrl}${generaSyncDescriptor.endpointPath}`,
		}),
	);
	const species = createCollection(
		electricShapeCollectionOptions<SpeciesRow>({
			descriptor: speciesSyncDescriptor,
			syncMode: webSyncModes.species,
			url: `${shapeServerUrl}${speciesSyncDescriptor.endpointPath}`,
		}),
	);
	const organizationSpecies = createCollection(
		electricShapeCollectionOptions<OrganizationSpeciesRow>({
			descriptor: organizationSpeciesSyncDescriptor,
			syncMode: webSyncModes.organization_species,
			url: `${shapeServerUrl}${organizationSpeciesSyncDescriptor.endpointPath}`,
			...createOrganizationSpeciesMutationHandlers({ serverUrl: options.serverUrl }),
		}),
	);
	const currentOrganization = createCollection(
		electricShapeCollectionOptions<OrganizationRow>({
			descriptor: currentOrganizationSyncDescriptor,
			syncMode: webSyncModes.organizations,
			url: `${shapeServerUrl}${currentOrganizationSyncDescriptor.endpointPath}`,
			...createOrganizationMutationHandlers({
				serverUrl: options.serverUrl,
			}),
		}),
	);
	const collectionMethods = createCollection(
		electricShapeCollectionOptions<CollectionMethodRow>({
			descriptor: collectionMethodsSyncDescriptor,
			syncMode: webSyncModes.collection_methods,
			url: `${shapeServerUrl}${collectionMethodsSyncDescriptor.endpointPath}`,
			...createOrgLookupMutationHandlers<CollectionMethodRow>({
				serverUrl: options.serverUrl,
				endpointPath: '/foundation/collection-methods',
				fallbackName: 'collection method',
			}),
		}),
	);
	const collectionLures = createCollection(
		electricShapeCollectionOptions<CollectionLureRow>({
			descriptor: collectionLuresSyncDescriptor,
			syncMode: webSyncModes.collection_lures,
			url: `${shapeServerUrl}${collectionLuresSyncDescriptor.endpointPath}`,
			...createOrgLookupMutationHandlers<CollectionLureRow>({
				serverUrl: options.serverUrl,
				endpointPath: '/foundation/collection-lures',
				fallbackName: 'collection lure',
			}),
		}),
	);
	const habitatTypes = createCollection(
		electricShapeCollectionOptions<HabitatTypeRow>({
			descriptor: habitatTypesSyncDescriptor,
			syncMode: webSyncModes.habitat_types,
			url: `${shapeServerUrl}${habitatTypesSyncDescriptor.endpointPath}`,
			...createOrgLookupMutationHandlers<HabitatTypeRow>({
				serverUrl: options.serverUrl,
				endpointPath: '/foundation/habitat-types',
				fallbackName: 'habitat type',
			}),
		}),
	);
	const addresses = createCollection(
		electricShapeCollectionOptions<AddressRow>({
			descriptor: addressesSyncDescriptor,
			syncMode: webSyncModes.addresses,
			url: `${shapeServerUrl}${addressesSyncDescriptor.endpointPath}`,
			...createAddressMutationHandlers({
				serverUrl: options.serverUrl,
			}),
		}),
	);
	// The address picker on every location-bearing form.
	addresses.createIndex((row) => row.displayName, { indexType: BasicIndex });
	const applicationMethods = createCollection(
		electricShapeCollectionOptions<ControlMethodRow>({
			descriptor: applicationMethodsSyncDescriptor,
			syncMode: webSyncModes.application_methods,
			url: `${shapeServerUrl}${applicationMethodsSyncDescriptor.endpointPath}`,
			...createControlMethodMutationHandlers<ControlMethodRow>({
				serverUrl: options.serverUrl,
				endpointPath: '/control-methods/application-methods',
				fallbackName: 'application method',
			}),
		}),
	);
	const sourceReductionMethods = createCollection(
		electricShapeCollectionOptions<ControlMethodRow>({
			descriptor: sourceReductionMethodsSyncDescriptor,
			syncMode: webSyncModes.source_reduction_methods,
			url: `${shapeServerUrl}${sourceReductionMethodsSyncDescriptor.endpointPath}`,
			...createControlMethodMutationHandlers<ControlMethodRow>({
				serverUrl: options.serverUrl,
				endpointPath: '/control-methods/source-reduction-methods',
				fallbackName: 'source reduction method',
			}),
		}),
	);
	const outreachMethods = createCollection(
		electricShapeCollectionOptions<ControlMethodRow>({
			descriptor: outreachMethodsSyncDescriptor,
			syncMode: webSyncModes.outreach_methods,
			url: `${shapeServerUrl}${outreachMethodsSyncDescriptor.endpointPath}`,
			...createControlMethodMutationHandlers<ControlMethodRow>({
				serverUrl: options.serverUrl,
				endpointPath: '/control-methods/outreach-methods',
				fallbackName: 'outreach method',
			}),
		}),
	);
	const biocontrolMethods = createCollection(
		electricShapeCollectionOptions<ControlMethodRow>({
			descriptor: biocontrolMethodsSyncDescriptor,
			syncMode: webSyncModes.biocontrol_methods,
			url: `${shapeServerUrl}${biocontrolMethodsSyncDescriptor.endpointPath}`,
			...createControlMethodMutationHandlers<ControlMethodRow>({
				serverUrl: options.serverUrl,
				endpointPath: '/control-methods/biocontrol-methods',
				fallbackName: 'biocontrol method',
			}),
		}),
	);
	const vehicles = createCollection(
		electricShapeCollectionOptions<VehicleRow>({
			descriptor: vehiclesSyncDescriptor,
			syncMode: webSyncModes.vehicles,
			url: `${shapeServerUrl}${vehiclesSyncDescriptor.endpointPath}`,
			...createVehicleMutationHandlers<VehicleRow>({
				serverUrl: options.serverUrl,
			}),
		}),
	);
	const equipment = createCollection(
		electricShapeCollectionOptions<EquipmentRow>({
			descriptor: equipmentSyncDescriptor,
			syncMode: webSyncModes.equipment,
			url: `${shapeServerUrl}${equipmentSyncDescriptor.endpointPath}`,
			...createEquipmentMutationHandlers<EquipmentRow>({
				serverUrl: options.serverUrl,
			}),
		}),
	);
	const insecticides = createCollection(
		electricShapeCollectionOptions<InsecticideRow>({
			descriptor: insecticidesSyncDescriptor,
			syncMode: webSyncModes.insecticides,
			url: `${shapeServerUrl}${insecticidesSyncDescriptor.endpointPath}`,
			...createInsecticideMutationHandlers<InsecticideRow>({
				serverUrl: options.serverUrl,
			}),
		}),
	);
	const insecticideBatches = createCollection(
		electricShapeCollectionOptions<InsecticideBatchRow>({
			descriptor: insecticideBatchesSyncDescriptor,
			syncMode: webSyncModes.insecticide_batches,
			url: `${shapeServerUrl}${insecticideBatchesSyncDescriptor.endpointPath}`,
			...createInsecticideBatchMutationHandlers<InsecticideBatchRow>({
				serverUrl: options.serverUrl,
			}),
		}),
	);
	const notificationTypes = createCollection(
		electricShapeCollectionOptions<NotificationTypeRow>({
			descriptor: notificationTypesSyncDescriptor,
			syncMode: webSyncModes.notification_types,
			url: `${shapeServerUrl}${notificationTypesSyncDescriptor.endpointPath}`,
			...createNotificationTypeMutationHandlers<NotificationTypeRow>({
				serverUrl: options.serverUrl,
			}),
		}),
	);
	const tags = createCollection(
		electricShapeCollectionOptions<TagRow>({
			descriptor: tagsSyncDescriptor,
			syncMode: webSyncModes.tags,
			url: `${shapeServerUrl}${tagsSyncDescriptor.endpointPath}`,
			...createTagMutationHandlers({
				serverUrl: options.serverUrl,
			}),
		}),
	);
	const routes = createCollection(
		electricShapeCollectionOptions<RouteRow>({
			descriptor: routesSyncDescriptor,
			syncMode: webSyncModes.routes,
			url: `${shapeServerUrl}${routesSyncDescriptor.endpointPath}`,
			...createRouteMutationHandlers({ serverUrl: options.serverUrl }),
		}),
	);
	const habitats = createCollection(
		electricShapeCollectionOptions<HabitatRow>({
			descriptor: habitatsSyncDescriptor,
			syncMode: webSyncModes.habitats,
			url: `${shapeServerUrl}${habitatsSyncDescriptor.endpointPath}`,
			...createHabitatMutationHandlers({
				serverUrl: options.serverUrl,
			}),
		}),
	);
	// The habitat pickers on the control-action and inspection forms.
	habitats.createIndex((row) => row.habitatName, { indexType: BasicIndex });
	const inspections = createCollection(
		electricShapeCollectionOptions<InspectionRow>({
			descriptor: inspectionsSyncDescriptor,
			syncMode: webSyncModes.inspections,
			url: `${shapeServerUrl}${inspectionsSyncDescriptor.endpointPath}`,
			...createInspectionMutationHandlers({
				serverUrl: options.serverUrl,
			}),
		}),
	);
	const samples = createCollection(
		electricShapeCollectionOptions<SampleRow>({
			descriptor: samplesSyncDescriptor,
			syncMode: webSyncModes.samples,
			url: `${shapeServerUrl}${samplesSyncDescriptor.endpointPath}`,
			...createSampleMutationHandlers({
				serverUrl: options.serverUrl,
			}),
		}),
	);
	const sampleSpecies = createCollection(
		electricShapeCollectionOptions<SampleSpeciesRow>({
			descriptor: sampleSpeciesSyncDescriptor,
			syncMode: webSyncModes.sample_species,
			url: `${shapeServerUrl}${sampleSpeciesSyncDescriptor.endpointPath}`,
			...createSampleSpeciesMutationHandlers({
				serverUrl: options.serverUrl,
			}),
		}),
	);
	const regionFolders = createCollection(
		electricShapeCollectionOptions<RegionFolderRow>({
			descriptor: regionFoldersSyncDescriptor,
			syncMode: webSyncModes.region_folders,
			url: `${shapeServerUrl}${regionFoldersSyncDescriptor.endpointPath}`,
			...createRegionFolderMutationHandlers({ serverUrl: options.serverUrl }),
		}),
	);
	const regions = createCollection(
		electricShapeCollectionOptions<RegionRow>({
			descriptor: regionsSyncDescriptor,
			syncMode: webSyncModes.regions,
			url: `${shapeServerUrl}${regionsSyncDescriptor.endpointPath}`,
			...createRegionMutationHandlers({ serverUrl: options.serverUrl }),
		}),
	);
	// The region boundary picker on the habitat and region forms.
	regions.createIndex((row) => row.name, { indexType: BasicIndex });
	const traps = createCollection(
		electricShapeCollectionOptions<TrapRow>({
			descriptor: trapsSyncDescriptor,
			syncMode: webSyncModes.traps,
			url: `${shapeServerUrl}${trapsSyncDescriptor.endpointPath}`,
			...createTrapMutationHandlers({
				serverUrl: options.serverUrl,
			}),
		}),
	);
	const collections = createCollection(
		electricShapeCollectionOptions<AdultCollectionRow>({
			descriptor: collectionsSyncDescriptor,
			syncMode: webSyncModes.collections,
			url: `${shapeServerUrl}${collectionsSyncDescriptor.endpointPath}`,
			...createCollectionMutationHandlers({
				serverUrl: options.serverUrl,
			}),
		}),
	);
	const collectionSpecies = createCollection(
		electricShapeCollectionOptions<CollectionSpeciesRow>({
			descriptor: collectionSpeciesSyncDescriptor,
			syncMode: webSyncModes.collection_species,
			url: `${shapeServerUrl}${collectionSpeciesSyncDescriptor.endpointPath}`,
			...createCollectionSpeciesMutationHandlers({
				serverUrl: options.serverUrl,
			}),
		}),
	);
	const comments = createCollection(
		electricShapeCollectionOptions<CommentRow>({
			descriptor: commentsSyncDescriptor,
			syncMode: webSyncModes.comments,
			url: `${shapeServerUrl}${commentsSyncDescriptor.endpointPath}`,
			...createCommentMutationHandlers({ serverUrl: options.serverUrl }),
		}),
	);
	const tagItems = createCollection(
		electricShapeCollectionOptions<TagItemRow>({
			descriptor: tagItemsSyncDescriptor,
			syncMode: webSyncModes.tag_items,
			url: `${shapeServerUrl}${tagItemsSyncDescriptor.endpointPath}`,
			...createTagItemMutationHandlers({ serverUrl: options.serverUrl }),
		}),
	);
	const additionalPersonnel = createCollection(
		electricShapeCollectionOptions<AdditionalPersonnelRow>({
			descriptor: additionalPersonnelSyncDescriptor,
			syncMode: webSyncModes.additional_personnel,
			url: `${shapeServerUrl}${additionalPersonnelSyncDescriptor.endpointPath}`,
			...createAdditionalPersonnelMutationHandlers({ serverUrl: options.serverUrl }),
		}),
	);
	const routeItems = createCollection(
		electricShapeCollectionOptions<RouteItemRow>({
			descriptor: routeItemsSyncDescriptor,
			syncMode: webSyncModes.route_items,
			url: `${shapeServerUrl}${routeItemsSyncDescriptor.endpointPath}`,
			...createRouteItemMutationHandlers({ serverUrl: options.serverUrl }),
		}),
	);
	const assignments = createCollection(
		electricShapeCollectionOptions<AssignmentRow>({
			descriptor: assignmentsSyncDescriptor,
			syncMode: webSyncModes.assignments,
			url: `${shapeServerUrl}${assignmentsSyncDescriptor.endpointPath}`,
			...createAssignmentMutationHandlers({ serverUrl: options.serverUrl }),
		}),
	);
	const assignmentItems = createCollection(
		electricShapeCollectionOptions<AssignmentItemRow>({
			descriptor: assignmentItemsSyncDescriptor,
			syncMode: webSyncModes.assignment_items,
			url: `${shapeServerUrl}${assignmentItemsSyncDescriptor.endpointPath}`,
			...createAssignmentItemMutationHandlers({ serverUrl: options.serverUrl }),
		}),
	);
	const formulations = createCollection(
		electricShapeCollectionOptions<FormulationRow>({
			descriptor: formulationsSyncDescriptor,
			syncMode: webSyncModes.formulations,
			url: `${shapeServerUrl}${formulationsSyncDescriptor.endpointPath}`,
			...createFormulationMutationHandlers({ serverUrl: options.serverUrl }),
		}),
	);
	const formulationInsecticides = createCollection(
		electricShapeCollectionOptions<FormulationInsecticideRow>({
			descriptor: formulationInsecticidesSyncDescriptor,
			syncMode: webSyncModes.formulation_insecticides,
			url: `${shapeServerUrl}${formulationInsecticidesSyncDescriptor.endpointPath}`,
			...createFormulationInsecticideMutationHandlers({ serverUrl: options.serverUrl }),
		}),
	);
	const applications = createCollection(
		electricShapeCollectionOptions<ApplicationRow>({
			descriptor: applicationsSyncDescriptor,
			syncMode: webSyncModes.applications,
			url: `${shapeServerUrl}${applicationsSyncDescriptor.endpointPath}`,
			...createApplicationMutationHandlers({ serverUrl: options.serverUrl }),
		}),
	);
	const applicationBatches = createCollection(
		electricShapeCollectionOptions<ApplicationBatchRow>({
			descriptor: applicationBatchesSyncDescriptor,
			syncMode: webSyncModes.application_batches,
			url: `${shapeServerUrl}${applicationBatchesSyncDescriptor.endpointPath}`,
			...createApplicationBatchMutationHandlers({ serverUrl: options.serverUrl }),
		}),
	);
	const sourceReductions = createCollection(
		electricShapeCollectionOptions<SourceReductionRow>({
			descriptor: sourceReductionsSyncDescriptor,
			syncMode: webSyncModes.source_reductions,
			url: `${shapeServerUrl}${sourceReductionsSyncDescriptor.endpointPath}`,
			...createSourceReductionMutationHandlers({ serverUrl: options.serverUrl }),
		}),
	);
	const outreachActions = createCollection(
		electricShapeCollectionOptions<OutreachActionRow>({
			descriptor: outreachActionsSyncDescriptor,
			syncMode: webSyncModes.outreach_actions,
			url: `${shapeServerUrl}${outreachActionsSyncDescriptor.endpointPath}`,
			...createOutreachActionMutationHandlers({ serverUrl: options.serverUrl }),
		}),
	);
	const biocontrolActions = createCollection(
		electricShapeCollectionOptions<BiocontrolActionRow>({
			descriptor: biocontrolActionsSyncDescriptor,
			syncMode: webSyncModes.biocontrol_actions,
			url: `${shapeServerUrl}${biocontrolActionsSyncDescriptor.endpointPath}`,
			...createBiocontrolActionMutationHandlers({ serverUrl: options.serverUrl }),
		}),
	);
	const contacts = createCollection(
		electricShapeCollectionOptions<ContactRow>({
			descriptor: contactsSyncDescriptor,
			syncMode: webSyncModes.contacts,
			url: `${shapeServerUrl}${contactsSyncDescriptor.endpointPath}`,
			...createContactMutationHandlers({ serverUrl: options.serverUrl }),
		}),
	);
	// The contact picker on the service-request and outreach forms.
	contacts.createIndex((row) => row.contactName, { indexType: BasicIndex });
	const serviceRequests = createCollection(
		electricShapeCollectionOptions<ServiceRequestRow>({
			descriptor: serviceRequestsSyncDescriptor,
			syncMode: webSyncModes.service_requests,
			url: `${shapeServerUrl}${serviceRequestsSyncDescriptor.endpointPath}`,
			...createServiceRequestMutationHandlers({ serverUrl: options.serverUrl }),
		}),
	);
	const requestedControlActions = createCollection(
		electricShapeCollectionOptions<RequestedControlActionRow>({
			descriptor: requestedControlActionsSyncDescriptor,
			syncMode: webSyncModes.requested_control_actions,
			url: `${shapeServerUrl}${requestedControlActionsSyncDescriptor.endpointPath}`,
			...createRequestedControlActionMutationHandlers({ serverUrl: options.serverUrl }),
		}),
	);
	const missions = createCollection(
		electricShapeCollectionOptions<MissionRow>({
			descriptor: missionsSyncDescriptor,
			syncMode: webSyncModes.missions,
			url: `${shapeServerUrl}${missionsSyncDescriptor.endpointPath}`,
			...createMissionMutationHandlers({ serverUrl: options.serverUrl }),
		}),
	);
	const missionItems = createCollection(
		electricShapeCollectionOptions<MissionItemRow>({
			descriptor: missionItemsSyncDescriptor,
			syncMode: webSyncModes.mission_items,
			url: `${shapeServerUrl}${missionItemsSyncDescriptor.endpointPath}`,
			...createMissionItemMutationHandlers({ serverUrl: options.serverUrl }),
		}),
	);
	const notificationRegistrations = createCollection(
		electricShapeCollectionOptions<NotificationRegistrationRow>({
			descriptor: notificationRegistrationsSyncDescriptor,
			syncMode: webSyncModes.notification_registrations,
			url: `${shapeServerUrl}${notificationRegistrationsSyncDescriptor.endpointPath}`,
			...createNotificationRegistrationMutationHandlers({ serverUrl: options.serverUrl }),
		}),
	);
	const notificationRegistrationTypes = createCollection(
		electricShapeCollectionOptions<NotificationRegistrationTypeRow>({
			descriptor: notificationRegistrationTypesSyncDescriptor,
			syncMode: webSyncModes.notification_registration_types,
			url: `${shapeServerUrl}${notificationRegistrationTypesSyncDescriptor.endpointPath}`,
			...createNotificationRegistrationTypeMutationHandlers({ serverUrl: options.serverUrl }),
		}),
	);
	const missionNotifications = createCollection(
		electricShapeCollectionOptions<MissionNotificationRow>({
			descriptor: missionNotificationsSyncDescriptor,
			syncMode: webSyncModes.mission_notifications,
			url: `${shapeServerUrl}${missionNotificationsSyncDescriptor.endpointPath}`,
			...createMissionNotificationMutationHandlers({ serverUrl: options.serverUrl }),
		}),
	);
	const weatherSources = createReadOnlyWebCollection<WeatherSourceRow>(
		weatherSourcesSyncDescriptor,
		shapeServerUrl,
		webSyncModes.weather_sources,
	);
	const weatherSummaries = createReadOnlyWebCollection<WeatherSummaryRow>(
		weatherSummariesSyncDescriptor,
		shapeServerUrl,
		webSyncModes.weather_summaries,
	);

	return {
		additionalPersonnel,
		addresses,
		applicationBatches,
		applicationMethods,
		applications,
		assignmentItems,
		assignments,
		biocontrolActions,
		biocontrolMethods,
		collectionSpecies,
		collectionLures,
		collectionMethods,
		collections,
		comments,
		contacts,
		equipment,
		formulationInsecticides,
		formulations,
		genera,
		habitats,
		habitatTypes,
		insecticideBatches,
		insecticides,
		inspections,
		memberships,
		missionItems,
		missionNotifications,
		missions,
		notificationRegistrations,
		notificationRegistrationTypes,
		notificationTypes,
		currentOrganization,
		organizationSpecies,
		outreachActions,
		outreachMethods,
		profiles,
		regionFolders,
		regions,
		requestedControlActions,
		routeItems,
		routes,
		samples,
		sampleSpecies,
		serviceRequests,
		sourceReductions,
		species,
		sourceReductionMethods,
		tagItems,
		tags,
		traps,
		units,
		vehicles,
		weatherSources,
		weatherSummaries,
	};
}

export async function preloadWebBaselineCollections(collections: WebCollections): Promise<void> {
	await Promise.all(
		webBaselineCollectionKeys.map((key) => (collections[key] as PreloadableCollection).preload()),
	);
}
