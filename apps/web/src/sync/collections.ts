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
import { type Collection, createCollection } from '@tanstack/db';
import { createOrganizationMutationHandlers } from './organizationMutations';
import { createOrgLookupMutationHandlers } from './orgLookupMutations';

export interface WebCollections {
	readonly applicationMethods: Collection<ControlMethodRow, string | number>;
	readonly biocontrolMethods: Collection<ControlMethodRow, string | number>;
	readonly collectionLures: Collection<CollectionLureRow, string | number>;
	readonly collectionMethods: Collection<CollectionMethodRow, string | number>;
	readonly equipment: Collection<EquipmentRow, string | number>;
	readonly genera: Collection<GenusRow, string | number>;
	readonly habitatTypes: Collection<HabitatTypeRow, string | number>;
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

export function createWebCollections(options: { readonly serverUrl: string }): WebCollections {
	const units = createCollection(
		electricShapeCollectionOptions<UnitRow>({
			descriptor: unitsSyncDescriptor,
			url: `${options.serverUrl}${unitsSyncDescriptor.endpointPath}`,
		}),
	);
	const profiles = createCollection(
		electricShapeCollectionOptions<ProfileRow>({
			descriptor: profilesSyncDescriptor,
			url: `${options.serverUrl}${profilesSyncDescriptor.endpointPath}`,
		}),
	);
	const genera = createCollection(
		electricShapeCollectionOptions<GenusRow>({
			descriptor: generaSyncDescriptor,
			url: `${options.serverUrl}${generaSyncDescriptor.endpointPath}`,
		}),
	);
	const species = createCollection(
		electricShapeCollectionOptions<SpeciesRow>({
			descriptor: speciesSyncDescriptor,
			url: `${options.serverUrl}${speciesSyncDescriptor.endpointPath}`,
		}),
	);
	const organizationSpecies = createCollection(
		electricShapeCollectionOptions<OrganizationSpeciesRow>({
			descriptor: organizationSpeciesSyncDescriptor,
			url: `${options.serverUrl}${organizationSpeciesSyncDescriptor.endpointPath}`,
		}),
	);
	const currentOrganization = createCollection(
		electricShapeCollectionOptions<OrganizationRow>({
			descriptor: currentOrganizationSyncDescriptor,
			url: `${options.serverUrl}${currentOrganizationSyncDescriptor.endpointPath}`,
			...createOrganizationMutationHandlers({
				serverUrl: options.serverUrl,
			}),
		}),
	);
	const collectionMethods = createCollection(
		electricShapeCollectionOptions<CollectionMethodRow>({
			descriptor: collectionMethodsSyncDescriptor,
			url: `${options.serverUrl}${collectionMethodsSyncDescriptor.endpointPath}`,
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
			url: `${options.serverUrl}${collectionLuresSyncDescriptor.endpointPath}`,
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
			url: `${options.serverUrl}${habitatTypesSyncDescriptor.endpointPath}`,
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
			url: `${options.serverUrl}${applicationMethodsSyncDescriptor.endpointPath}`,
		}),
	);
	const sourceReductionMethods = createCollection(
		electricShapeCollectionOptions<ControlMethodRow>({
			descriptor: sourceReductionMethodsSyncDescriptor,
			url: `${options.serverUrl}${sourceReductionMethodsSyncDescriptor.endpointPath}`,
		}),
	);
	const outreachMethods = createCollection(
		electricShapeCollectionOptions<ControlMethodRow>({
			descriptor: outreachMethodsSyncDescriptor,
			url: `${options.serverUrl}${outreachMethodsSyncDescriptor.endpointPath}`,
		}),
	);
	const biocontrolMethods = createCollection(
		electricShapeCollectionOptions<ControlMethodRow>({
			descriptor: biocontrolMethodsSyncDescriptor,
			url: `${options.serverUrl}${biocontrolMethodsSyncDescriptor.endpointPath}`,
		}),
	);
	const vehicles = createCollection(
		electricShapeCollectionOptions<VehicleRow>({
			descriptor: vehiclesSyncDescriptor,
			url: `${options.serverUrl}${vehiclesSyncDescriptor.endpointPath}`,
		}),
	);
	const equipment = createCollection(
		electricShapeCollectionOptions<EquipmentRow>({
			descriptor: equipmentSyncDescriptor,
			url: `${options.serverUrl}${equipmentSyncDescriptor.endpointPath}`,
		}),
	);
	const notificationTypes = createCollection(
		electricShapeCollectionOptions<NotificationTypeRow>({
			descriptor: notificationTypesSyncDescriptor,
			url: `${options.serverUrl}${notificationTypesSyncDescriptor.endpointPath}`,
		}),
	);
	const tags = createCollection(
		electricShapeCollectionOptions<TagRow>({
			descriptor: tagsSyncDescriptor,
			url: `${options.serverUrl}${tagsSyncDescriptor.endpointPath}`,
		}),
	);
	const routes = createCollection(
		electricShapeCollectionOptions<RouteRow>({
			descriptor: routesSyncDescriptor,
			url: `${options.serverUrl}${routesSyncDescriptor.endpointPath}`,
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
