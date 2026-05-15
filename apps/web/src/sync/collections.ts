import {
	type CollectionLureRow,
	type CollectionMethodRow,
	collectionLuresSyncDescriptor,
	collectionMethodsSyncDescriptor,
	electricShapeCollectionOptions,
	type GenusRow,
	generaSyncDescriptor,
	type HabitatTypeRow,
	habitatTypesSyncDescriptor,
	type OrganizationSpeciesRow,
	organizationSpeciesSyncDescriptor,
	type ProfileRow,
	profilesSyncDescriptor,
	type RouteRow,
	routesSyncDescriptor,
	type SpeciesRow,
	speciesSyncDescriptor,
	type TagRow,
	tagsSyncDescriptor,
	type UnitRow,
	unitsSyncDescriptor,
} from '@simmer-mosquito/sync';
import { type Collection, createCollection } from '@tanstack/db';

export interface WebCollections {
	readonly collectionLures: Collection<CollectionLureRow, string | number>;
	readonly collectionMethods: Collection<CollectionMethodRow, string | number>;
	readonly genera: Collection<GenusRow, string | number>;
	readonly habitatTypes: Collection<HabitatTypeRow, string | number>;
	readonly organizationSpecies: Collection<OrganizationSpeciesRow, string | number>;
	readonly profiles: Collection<ProfileRow, string | number>;
	readonly routes: Collection<RouteRow, string | number>;
	readonly species: Collection<SpeciesRow, string | number>;
	readonly tags: Collection<TagRow, string | number>;
	readonly units: Collection<UnitRow, string | number>;
}

export const webBaselineCollectionKeys = [
	'units',
	'profiles',
	'genera',
	'species',
	'organizationSpecies',
	'collectionMethods',
	'collectionLures',
	'habitatTypes',
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
	const collectionMethods = createCollection(
		electricShapeCollectionOptions<CollectionMethodRow>({
			descriptor: collectionMethodsSyncDescriptor,
			url: `${options.serverUrl}${collectionMethodsSyncDescriptor.endpointPath}`,
		}),
	);
	const collectionLures = createCollection(
		electricShapeCollectionOptions<CollectionLureRow>({
			descriptor: collectionLuresSyncDescriptor,
			url: `${options.serverUrl}${collectionLuresSyncDescriptor.endpointPath}`,
		}),
	);
	const habitatTypes = createCollection(
		electricShapeCollectionOptions<HabitatTypeRow>({
			descriptor: habitatTypesSyncDescriptor,
			url: `${options.serverUrl}${habitatTypesSyncDescriptor.endpointPath}`,
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
		collectionLures,
		collectionMethods,
		genera,
		habitatTypes,
		organizationSpecies,
		profiles,
		routes,
		species,
		tags,
		units,
	};
}

export async function preloadWebBaselineCollections(collections: WebCollections): Promise<void> {
	await Promise.all(
		webBaselineCollectionKeys.map((key) => (collections[key] as PreloadableCollection).preload()),
	);
}
