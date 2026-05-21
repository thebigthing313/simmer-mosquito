import {
	applicationMethodsSyncDescriptor,
	biocontrolMethodsSyncDescriptor,
	type CollectionLureRow,
	type CollectionMethodRow,
	type ControlMethodRow,
	collectionLuresSyncDescriptor,
	collectionMethodsSyncDescriptor,
	currentOrganizationSyncDescriptor,
	type EquipmentRow,
	electricShapeCollectionOptions,
	equipmentSyncDescriptor,
	type GenusRow,
	generaSyncDescriptor,
	type HabitatTypeRow,
	habitatTypesSyncDescriptor,
	type MembershipRow,
	membershipsSyncDescriptor,
	type NotificationTypeRow,
	notificationTypesSyncDescriptor,
	type OrganizationRow,
	type OrganizationSpeciesRow,
	organizationSpeciesSyncDescriptor,
	outreachMethodsSyncDescriptor,
	type ProfileRow,
	profilesSyncDescriptor,
	type RouteRow,
	routesSyncDescriptor,
	type SpeciesRow,
	sourceReductionMethodsSyncDescriptor,
	speciesSyncDescriptor,
	type TagRow,
	tagsSyncDescriptor,
	type UnitRow,
	unitsSyncDescriptor,
	type VehicleRow,
	vehiclesSyncDescriptor,
} from '@simmer-mosquito/sync';
import { type Collection, createCollection } from '@tanstack/react-db';
import {
	createEquipmentMutationHandlers,
	createVehicleMutationHandlers,
} from './controlAssetMutations';
import { createControlMethodMutationHandlers } from './controlMethodMutations';
import { createNotificationTypeMutationHandlers } from './notificationTypeMutations';
import { createOrganizationMutationHandlers } from './organizationMutations';
import { createOrgLookupMutationHandlers } from './orgLookupMutations';
import { createProfileMutationHandlers } from './profileMutations';
import { createTagMutationHandlers } from './tagMutations';

export interface WebCollections {
	readonly applicationMethods: Collection<ControlMethodRow, string | number>;
	readonly biocontrolMethods: Collection<ControlMethodRow, string | number>;
	readonly collectionLures: Collection<CollectionLureRow, string | number>;
	readonly collectionMethods: Collection<CollectionMethodRow, string | number>;
	readonly equipment: Collection<EquipmentRow, string | number>;
	readonly genera: Collection<GenusRow, string | number>;
	readonly habitatTypes: Collection<HabitatTypeRow, string | number>;
	readonly memberships: Collection<MembershipRow, string | number>;
	readonly notificationTypes: Collection<NotificationTypeRow, string | number>;
	readonly currentOrganization: Collection<OrganizationRow, string | number>;
	readonly organizationSpecies: Collection<OrganizationSpeciesRow, string | number>;
	readonly outreachMethods: Collection<ControlMethodRow, string | number>;
	readonly profiles: Collection<ProfileRow, string | number>;
	readonly routes: Collection<RouteRow, string | number>;
	readonly species: Collection<SpeciesRow, string | number>;
	readonly sourceReductionMethods: Collection<ControlMethodRow, string | number>;
	readonly tags: Collection<TagRow, string | number>;
	readonly units: Collection<UnitRow, string | number>;
	readonly vehicles: Collection<VehicleRow, string | number>;
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
	'notificationTypes',
	'tags',
	'routes',
] as const satisfies readonly (keyof WebCollections)[];

interface PreloadableCollection {
	readonly preload: () => Promise<unknown>;
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

	return {
		applicationMethods,
		biocontrolMethods,
		collectionLures,
		collectionMethods,
		equipment,
		genera,
		habitatTypes,
		memberships,
		notificationTypes,
		currentOrganization,
		organizationSpecies,
		outreachMethods,
		profiles,
		routes,
		species,
		sourceReductionMethods,
		tags,
		units,
		vehicles,
	};
}

export async function preloadWebBaselineCollections(collections: WebCollections): Promise<void> {
	await Promise.all(
		webBaselineCollectionKeys.map((key) => (collections[key] as PreloadableCollection).preload()),
	);
}
