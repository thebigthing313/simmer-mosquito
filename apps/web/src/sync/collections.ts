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
	weatherSourcesSyncDescriptor,
	weatherSummariesSyncDescriptor,
} from '@simmer-mosquito/sync';
import { BasicIndex, type Collection, createCollection } from '@tanstack/react-db';
import { createAddressMutationHandlers } from './addressMutations';
import {
	createEquipmentMutationHandlers,
	createVehicleMutationHandlers,
} from './controlAssetMutations';
import { createControlMethodMutationHandlers } from './controlMethodMutations';
import {
	createInsecticideBatchMutationHandlers,
	createInsecticideMutationHandlers,
} from './controlProductMutations';
import { createHabitatMutationHandlers } from './habitatMutations';
import { createNotificationTypeMutationHandlers } from './notificationTypeMutations';
import { createOrganizationMutationHandlers } from './organizationMutations';
import { createOrgLookupMutationHandlers } from './orgLookupMutations';
import { createProfileMutationHandlers } from './profileMutations';
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

function createReadOnlyWebCollection<TRow extends { readonly id: string }>(
	descriptor: SyncDescriptor<TRow>,
	shapeServerUrl: string,
): Collection<TRow, string | number> {
	return createCollection(
		electricShapeCollectionOptions<TRow>({
			descriptor,
			url: `${shapeServerUrl}${descriptor.endpointPath}`,
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
			url: `${shapeServerUrl}${unitsSyncDescriptor.endpointPath}`,
		}),
	);
	const profiles = createCollection(
		electricShapeCollectionOptions<ProfileRow>({
			descriptor: profilesSyncDescriptor,
			url: `${shapeServerUrl}${profilesSyncDescriptor.endpointPath}`,
			...createProfileMutationHandlers({
				serverUrl: options.serverUrl,
			}),
		}),
	);
	const memberships = createCollection(
		electricShapeCollectionOptions<MembershipRow>({
			descriptor: membershipsSyncDescriptor,
			url: `${shapeServerUrl}${membershipsSyncDescriptor.endpointPath}`,
		}),
	);
	const genera = createCollection(
		electricShapeCollectionOptions<GenusRow>({
			descriptor: generaSyncDescriptor,
			url: `${shapeServerUrl}${generaSyncDescriptor.endpointPath}`,
		}),
	);
	const species = createCollection(
		electricShapeCollectionOptions<SpeciesRow>({
			descriptor: speciesSyncDescriptor,
			url: `${shapeServerUrl}${speciesSyncDescriptor.endpointPath}`,
		}),
	);
	const organizationSpecies = createCollection(
		electricShapeCollectionOptions<OrganizationSpeciesRow>({
			descriptor: organizationSpeciesSyncDescriptor,
			url: `${shapeServerUrl}${organizationSpeciesSyncDescriptor.endpointPath}`,
		}),
	);
	const currentOrganization = createCollection(
		electricShapeCollectionOptions<OrganizationRow>({
			descriptor: currentOrganizationSyncDescriptor,
			url: `${shapeServerUrl}${currentOrganizationSyncDescriptor.endpointPath}`,
			...createOrganizationMutationHandlers({
				serverUrl: options.serverUrl,
			}),
		}),
	);
	const collectionMethods = createCollection(
		electricShapeCollectionOptions<CollectionMethodRow>({
			descriptor: collectionMethodsSyncDescriptor,
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
			url: `${shapeServerUrl}${addressesSyncDescriptor.endpointPath}`,
			...createAddressMutationHandlers({
				serverUrl: options.serverUrl,
			}),
		}),
	);
	addresses.createIndex((row) => row.displayName, { indexType: BasicIndex });
	const applicationMethods = createCollection(
		electricShapeCollectionOptions<ControlMethodRow>({
			descriptor: applicationMethodsSyncDescriptor,
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
			url: `${shapeServerUrl}${vehiclesSyncDescriptor.endpointPath}`,
			...createVehicleMutationHandlers<VehicleRow>({
				serverUrl: options.serverUrl,
			}),
		}),
	);
	const equipment = createCollection(
		electricShapeCollectionOptions<EquipmentRow>({
			descriptor: equipmentSyncDescriptor,
			url: `${shapeServerUrl}${equipmentSyncDescriptor.endpointPath}`,
			...createEquipmentMutationHandlers<EquipmentRow>({
				serverUrl: options.serverUrl,
			}),
		}),
	);
	const insecticides = createCollection(
		electricShapeCollectionOptions<InsecticideRow>({
			descriptor: insecticidesSyncDescriptor,
			url: `${shapeServerUrl}${insecticidesSyncDescriptor.endpointPath}`,
			...createInsecticideMutationHandlers<InsecticideRow>({
				serverUrl: options.serverUrl,
			}),
		}),
	);
	const insecticideBatches = createCollection(
		electricShapeCollectionOptions<InsecticideBatchRow>({
			descriptor: insecticideBatchesSyncDescriptor,
			url: `${shapeServerUrl}${insecticideBatchesSyncDescriptor.endpointPath}`,
			...createInsecticideBatchMutationHandlers<InsecticideBatchRow>({
				serverUrl: options.serverUrl,
			}),
		}),
	);
	const notificationTypes = createCollection(
		electricShapeCollectionOptions<NotificationTypeRow>({
			descriptor: notificationTypesSyncDescriptor,
			url: `${shapeServerUrl}${notificationTypesSyncDescriptor.endpointPath}`,
			...createNotificationTypeMutationHandlers<NotificationTypeRow>({
				serverUrl: options.serverUrl,
			}),
		}),
	);
	const tags = createCollection(
		electricShapeCollectionOptions<TagRow>({
			descriptor: tagsSyncDescriptor,
			url: `${shapeServerUrl}${tagsSyncDescriptor.endpointPath}`,
			...createTagMutationHandlers({
				serverUrl: options.serverUrl,
			}),
		}),
	);
	const routes = createCollection(
		electricShapeCollectionOptions<RouteRow>({
			descriptor: routesSyncDescriptor,
			url: `${shapeServerUrl}${routesSyncDescriptor.endpointPath}`,
		}),
	);
	const habitats = createCollection(
		electricShapeCollectionOptions<HabitatRow>({
			descriptor: habitatsSyncDescriptor,
			url: `${shapeServerUrl}${habitatsSyncDescriptor.endpointPath}`,
			...createHabitatMutationHandlers({
				serverUrl: options.serverUrl,
			}),
		}),
	);
	const inspections = createCollection(
		electricShapeCollectionOptions<InspectionRow>({
			descriptor: inspectionsSyncDescriptor,
			url: `${shapeServerUrl}${inspectionsSyncDescriptor.endpointPath}`,
		}),
	);
	const samples = createCollection(
		electricShapeCollectionOptions<SampleRow>({
			descriptor: samplesSyncDescriptor,
			url: `${shapeServerUrl}${samplesSyncDescriptor.endpointPath}`,
		}),
	);
	const sampleSpecies = createCollection(
		electricShapeCollectionOptions<SampleSpeciesRow>({
			descriptor: sampleSpeciesSyncDescriptor,
			url: `${shapeServerUrl}${sampleSpeciesSyncDescriptor.endpointPath}`,
		}),
	);
	const regionFolders = createReadOnlyWebCollection<RegionFolderRow>(
		regionFoldersSyncDescriptor,
		shapeServerUrl,
	);
	const regions = createReadOnlyWebCollection<RegionRow>(regionsSyncDescriptor, shapeServerUrl);
	const traps = createReadOnlyWebCollection<TrapRow>(trapsSyncDescriptor, shapeServerUrl);
	const collections = createReadOnlyWebCollection<AdultCollectionRow>(
		collectionsSyncDescriptor,
		shapeServerUrl,
	);
	const collectionSpecies = createReadOnlyWebCollection<CollectionSpeciesRow>(
		collectionSpeciesSyncDescriptor,
		shapeServerUrl,
	);
	const comments = createReadOnlyWebCollection<CommentRow>(commentsSyncDescriptor, shapeServerUrl);
	const tagItems = createReadOnlyWebCollection<TagItemRow>(tagItemsSyncDescriptor, shapeServerUrl);
	const additionalPersonnel = createReadOnlyWebCollection<AdditionalPersonnelRow>(
		additionalPersonnelSyncDescriptor,
		shapeServerUrl,
	);
	const routeItems = createReadOnlyWebCollection<RouteItemRow>(
		routeItemsSyncDescriptor,
		shapeServerUrl,
	);
	const assignments = createReadOnlyWebCollection<AssignmentRow>(
		assignmentsSyncDescriptor,
		shapeServerUrl,
	);
	const assignmentItems = createReadOnlyWebCollection<AssignmentItemRow>(
		assignmentItemsSyncDescriptor,
		shapeServerUrl,
	);
	const formulations = createReadOnlyWebCollection<FormulationRow>(
		formulationsSyncDescriptor,
		shapeServerUrl,
	);
	const formulationInsecticides = createReadOnlyWebCollection<FormulationInsecticideRow>(
		formulationInsecticidesSyncDescriptor,
		shapeServerUrl,
	);
	const applications = createReadOnlyWebCollection<ApplicationRow>(
		applicationsSyncDescriptor,
		shapeServerUrl,
	);
	const applicationBatches = createReadOnlyWebCollection<ApplicationBatchRow>(
		applicationBatchesSyncDescriptor,
		shapeServerUrl,
	);
	const sourceReductions = createReadOnlyWebCollection<SourceReductionRow>(
		sourceReductionsSyncDescriptor,
		shapeServerUrl,
	);
	const outreachActions = createReadOnlyWebCollection<OutreachActionRow>(
		outreachActionsSyncDescriptor,
		shapeServerUrl,
	);
	const biocontrolActions = createReadOnlyWebCollection<BiocontrolActionRow>(
		biocontrolActionsSyncDescriptor,
		shapeServerUrl,
	);
	const contacts = createReadOnlyWebCollection<ContactRow>(contactsSyncDescriptor, shapeServerUrl);
	const serviceRequests = createReadOnlyWebCollection<ServiceRequestRow>(
		serviceRequestsSyncDescriptor,
		shapeServerUrl,
	);
	const requestedControlActions = createReadOnlyWebCollection<RequestedControlActionRow>(
		requestedControlActionsSyncDescriptor,
		shapeServerUrl,
	);
	const missions = createReadOnlyWebCollection<MissionRow>(missionsSyncDescriptor, shapeServerUrl);
	const missionItems = createReadOnlyWebCollection<MissionItemRow>(
		missionItemsSyncDescriptor,
		shapeServerUrl,
	);
	const notificationRegistrations = createReadOnlyWebCollection<NotificationRegistrationRow>(
		notificationRegistrationsSyncDescriptor,
		shapeServerUrl,
	);
	const notificationRegistrationTypes =
		createReadOnlyWebCollection<NotificationRegistrationTypeRow>(
			notificationRegistrationTypesSyncDescriptor,
			shapeServerUrl,
		);
	const missionNotifications = createReadOnlyWebCollection<MissionNotificationRow>(
		missionNotificationsSyncDescriptor,
		shapeServerUrl,
	);
	const weatherSources = createReadOnlyWebCollection<WeatherSourceRow>(
		weatherSourcesSyncDescriptor,
		shapeServerUrl,
	);
	const weatherSummaries = createReadOnlyWebCollection<WeatherSummaryRow>(
		weatherSummariesSyncDescriptor,
		shapeServerUrl,
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
