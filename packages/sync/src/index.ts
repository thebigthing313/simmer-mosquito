import {
	type ElectricCollectionConfig,
	electricCollectionOptions,
} from '@tanstack/electric-db-collection';

export type WebSyncMode = 'eager' | 'on-demand';

export interface SyncDescriptor<TRow extends { readonly id: string }> {
	readonly id: string;
	readonly table: string;
	readonly endpointPath: string;
	readonly syncMode: WebSyncMode;
	readonly columns: readonly (keyof TRow & string)[];
	readonly getKey: (row: TRow) => string;
}

export type UnitType =
	| 'weight'
	| 'distance'
	| 'area'
	| 'volume'
	| 'temperature'
	| 'duration'
	| 'count'
	| 'speed';

export type UnitSystem = 'si' | 'imperial' | 'us_customary';

export interface UnitRow {
	readonly [key: string]: unknown;
	readonly id: string;
	readonly code: string;
	readonly unitName: string;
	readonly abbreviation: string;
	readonly unitType: UnitType;
	readonly unitSystem: UnitSystem;
	readonly createdAt: string;
}

export interface ProfileRow {
	readonly [key: string]: unknown;
	readonly id: string;
	readonly organizationId: string;
	readonly displayName: string;
	readonly isActive: boolean;
	readonly createdAt: string;
	readonly updatedAt: string;
}

export interface GenusRow {
	readonly [key: string]: unknown;
	readonly id: string;
	readonly abbreviation: string;
	readonly name: string;
	readonly createdAt: string;
	readonly updatedAt: string;
}

export interface SpeciesRow {
	readonly [key: string]: unknown;
	readonly id: string;
	readonly genusId: string | null;
	readonly epithet: string;
	readonly commonName: string | null;
	readonly displayName: string;
	readonly createdAt: string;
	readonly updatedAt: string;
}

export interface OrganizationSpeciesRow {
	readonly [key: string]: unknown;
	readonly id: string;
	readonly organizationId: string;
	readonly speciesId: string;
	readonly createdAt: string;
	readonly updatedAt: string;
}

interface OrgLookupRowBase {
	readonly [key: string]: unknown;
	readonly id: string;
	readonly organizationId: string;
	readonly name: string;
	readonly description: string | null;
	readonly isActive: boolean;
	readonly createdAt: string;
	readonly updatedAt: string;
}

export interface CollectionMethodRow extends OrgLookupRowBase {
	readonly customSchema: unknown | null;
	readonly actionThreshold: number | null;
}

export interface CollectionLureRow extends OrgLookupRowBase {}

export interface HabitatTypeRow extends OrgLookupRowBase {
	readonly customSchema: unknown | null;
}

export interface TagRow {
	readonly [key: string]: unknown;
	readonly id: string;
	readonly organizationId: string;
	readonly tagName: string;
	readonly description: string | null;
	readonly color: string | null;
	readonly isActive: boolean;
	readonly createdAt: string;
	readonly updatedAt: string;
}

export type RouteType = 'habitat' | 'trap';

export interface RouteRow {
	readonly [key: string]: unknown;
	readonly id: string;
	readonly organizationId: string;
	readonly routeName: string;
	readonly routeType: RouteType;
	readonly createdAt: string;
	readonly updatedAt: string;
}

export const unitsSyncDescriptor: SyncDescriptor<UnitRow> = {
	id: 'units',
	table: 'units',
	endpointPath: '/sync/shapes/units',
	syncMode: 'eager',
	columns: ['id', 'code', 'unitName', 'abbreviation', 'unitType', 'unitSystem', 'createdAt'],
	getKey: (row) => row.id,
};

export const profilesSyncDescriptor: SyncDescriptor<ProfileRow> = {
	id: 'profiles',
	table: 'profiles',
	endpointPath: '/sync/shapes/profiles',
	syncMode: 'eager',
	columns: ['id', 'organizationId', 'displayName', 'isActive', 'createdAt', 'updatedAt'],
	getKey: (row) => row.id,
};

export const generaSyncDescriptor: SyncDescriptor<GenusRow> = {
	id: 'genera',
	table: 'genera',
	endpointPath: '/sync/shapes/genera',
	syncMode: 'eager',
	columns: ['id', 'abbreviation', 'name', 'createdAt', 'updatedAt'],
	getKey: (row) => row.id,
};

export const speciesSyncDescriptor: SyncDescriptor<SpeciesRow> = {
	id: 'species',
	table: 'species',
	endpointPath: '/sync/shapes/species',
	syncMode: 'eager',
	columns: ['id', 'genusId', 'epithet', 'commonName', 'displayName', 'createdAt', 'updatedAt'],
	getKey: (row) => row.id,
};

export const organizationSpeciesSyncDescriptor: SyncDescriptor<OrganizationSpeciesRow> = {
	id: 'organization_species',
	table: 'organization_species',
	endpointPath: '/sync/shapes/organization-species',
	syncMode: 'eager',
	columns: ['id', 'organizationId', 'speciesId', 'createdAt', 'updatedAt'],
	getKey: (row) => row.id,
};

export const collectionMethodsSyncDescriptor: SyncDescriptor<CollectionMethodRow> = {
	id: 'collection_methods',
	table: 'collection_methods',
	endpointPath: '/sync/shapes/collection-methods',
	syncMode: 'eager',
	columns: [
		'id',
		'organizationId',
		'name',
		'description',
		'customSchema',
		'actionThreshold',
		'isActive',
		'createdAt',
		'updatedAt',
	],
	getKey: (row) => row.id,
};

export const collectionLuresSyncDescriptor: SyncDescriptor<CollectionLureRow> = {
	id: 'collection_lures',
	table: 'collection_lures',
	endpointPath: '/sync/shapes/collection-lures',
	syncMode: 'eager',
	columns: ['id', 'organizationId', 'name', 'description', 'isActive', 'createdAt', 'updatedAt'],
	getKey: (row) => row.id,
};

export const habitatTypesSyncDescriptor: SyncDescriptor<HabitatTypeRow> = {
	id: 'habitat_types',
	table: 'habitat_types',
	endpointPath: '/sync/shapes/habitat-types',
	syncMode: 'eager',
	columns: [
		'id',
		'organizationId',
		'name',
		'description',
		'customSchema',
		'isActive',
		'createdAt',
		'updatedAt',
	],
	getKey: (row) => row.id,
};

export const tagsSyncDescriptor: SyncDescriptor<TagRow> = {
	id: 'tags',
	table: 'tags',
	endpointPath: '/sync/shapes/tags',
	syncMode: 'eager',
	columns: [
		'id',
		'organizationId',
		'tagName',
		'description',
		'color',
		'isActive',
		'createdAt',
		'updatedAt',
	],
	getKey: (row) => row.id,
};

export const routesSyncDescriptor: SyncDescriptor<RouteRow> = {
	id: 'routes',
	table: 'routes',
	endpointPath: '/sync/shapes/routes',
	syncMode: 'eager',
	columns: ['id', 'organizationId', 'routeName', 'routeType', 'createdAt', 'updatedAt'],
	getKey: (row) => row.id,
};

export const webReadOnlyTracerDescriptors = [
	unitsSyncDescriptor,
	profilesSyncDescriptor,
	generaSyncDescriptor,
	speciesSyncDescriptor,
	organizationSpeciesSyncDescriptor,
	collectionMethodsSyncDescriptor,
	collectionLuresSyncDescriptor,
	habitatTypesSyncDescriptor,
	tagsSyncDescriptor,
	routesSyncDescriptor,
] as const;

export function electricShapeCollectionOptions<TRow extends { readonly id: string }>(
	input: {
		readonly descriptor: SyncDescriptor<TRow>;
		readonly url: string;
	} & Pick<ElectricCollectionConfig<TRow, never>, 'onInsert' | 'onUpdate' | 'onDelete'>,
) {
	return electricCollectionOptions<TRow>({
		id: input.descriptor.id,
		getKey: input.descriptor.getKey,
		syncMode: input.descriptor.syncMode,
		...(input.onInsert === undefined ? {} : { onInsert: input.onInsert }),
		...(input.onUpdate === undefined ? {} : { onUpdate: input.onUpdate }),
		...(input.onDelete === undefined ? {} : { onDelete: input.onDelete }),
		shapeOptions: {
			url: input.url,
			fetchClient: (request, init) =>
				fetch(request, {
					...init,
					credentials: 'include',
				}),
			params: {
				table: input.descriptor.table,
				columns: [...input.descriptor.columns],
			},
			columnMapper: snakeCamelColumnMapper,
		},
	});
}

const snakeCamelColumnMapper = {
	encode: camelToSnake,
	decode: snakeToCamel,
};

function camelToSnake(value: string): string {
	return value.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`);
}

function snakeToCamel(value: string): string {
	return value.replace(/_([a-z])/g, (_match, letter: string) => letter.toUpperCase());
}
