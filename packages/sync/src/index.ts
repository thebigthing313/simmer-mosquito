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

export interface OrganizationRow {
	readonly [key: string]: unknown;
	readonly id: string;
	readonly workosOrganizationId: string | null;
	readonly name: string;
	readonly slug: string | null;
	readonly mainContactEmail: string | null;
	readonly phoneNumber: string | null;
	readonly mailingCountry: string | null;
	readonly mailingAddressLine1: string | null;
	readonly mailingAddressLine2: string | null;
	readonly mailingLocality: string | null;
	readonly mailingRegion: string | null;
	readonly mailingPostalCode: string | null;
	readonly settings: unknown | null;
	readonly updatedAt: string;
	readonly updatedByProfileId: string | null;
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

export interface ControlMethodRow {
	readonly [key: string]: unknown;
	readonly id: string;
	readonly organizationId: string;
	readonly name: string;
	readonly customSchema: unknown;
	readonly isActive: boolean;
	readonly createdAt: string;
	readonly updatedAt: string;
}

export interface VehicleRow {
	readonly [key: string]: unknown;
	readonly id: string;
	readonly organizationId: string;
	readonly vehicleName: string;
	readonly metadata: unknown;
	readonly isActive: boolean;
	readonly createdAt: string;
	readonly updatedAt: string;
}

export interface EquipmentRow {
	readonly [key: string]: unknown;
	readonly id: string;
	readonly organizationId: string;
	readonly equipmentName: string;
	readonly serialNumber: string | null;
	readonly metadata: unknown;
	readonly isActive: boolean;
	readonly createdAt: string;
	readonly updatedAt: string;
}

export interface NotificationTypeRow extends OrgLookupRowBase {}

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

export const currentOrganizationSyncDescriptor: SyncDescriptor<OrganizationRow> = {
	id: 'current_organization',
	table: 'organizations',
	endpointPath: '/sync/shapes/organization',
	syncMode: 'eager',
	columns: [
		'id',
		'workosOrganizationId',
		'name',
		'slug',
		'mainContactEmail',
		'phoneNumber',
		'mailingCountry',
		'mailingAddressLine1',
		'mailingAddressLine2',
		'mailingLocality',
		'mailingRegion',
		'mailingPostalCode',
		'settings',
		'updatedAt',
		'updatedByProfileId',
	],
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

export const applicationMethodsSyncDescriptor: SyncDescriptor<ControlMethodRow> = {
	id: 'application_methods',
	table: 'application_methods',
	endpointPath: '/sync/shapes/application-methods',
	syncMode: 'eager',
	columns: ['id', 'organizationId', 'name', 'customSchema', 'isActive', 'createdAt', 'updatedAt'],
	getKey: (row) => row.id,
};

export const sourceReductionMethodsSyncDescriptor: SyncDescriptor<ControlMethodRow> = {
	id: 'source_reduction_methods',
	table: 'source_reduction_methods',
	endpointPath: '/sync/shapes/source-reduction-methods',
	syncMode: 'eager',
	columns: ['id', 'organizationId', 'name', 'customSchema', 'isActive', 'createdAt', 'updatedAt'],
	getKey: (row) => row.id,
};

export const outreachMethodsSyncDescriptor: SyncDescriptor<ControlMethodRow> = {
	id: 'outreach_methods',
	table: 'outreach_methods',
	endpointPath: '/sync/shapes/outreach-methods',
	syncMode: 'eager',
	columns: ['id', 'organizationId', 'name', 'customSchema', 'isActive', 'createdAt', 'updatedAt'],
	getKey: (row) => row.id,
};

export const biocontrolMethodsSyncDescriptor: SyncDescriptor<ControlMethodRow> = {
	id: 'biocontrol_methods',
	table: 'biocontrol_methods',
	endpointPath: '/sync/shapes/biocontrol-methods',
	syncMode: 'eager',
	columns: ['id', 'organizationId', 'name', 'customSchema', 'isActive', 'createdAt', 'updatedAt'],
	getKey: (row) => row.id,
};

export const vehiclesSyncDescriptor: SyncDescriptor<VehicleRow> = {
	id: 'vehicles',
	table: 'vehicles',
	endpointPath: '/sync/shapes/vehicles',
	syncMode: 'eager',
	columns: [
		'id',
		'organizationId',
		'vehicleName',
		'metadata',
		'isActive',
		'createdAt',
		'updatedAt',
	],
	getKey: (row) => row.id,
};

export const equipmentSyncDescriptor: SyncDescriptor<EquipmentRow> = {
	id: 'equipment',
	table: 'equipment',
	endpointPath: '/sync/shapes/equipment',
	syncMode: 'eager',
	columns: [
		'id',
		'organizationId',
		'equipmentName',
		'serialNumber',
		'metadata',
		'isActive',
		'createdAt',
		'updatedAt',
	],
	getKey: (row) => row.id,
};

export const notificationTypesSyncDescriptor: SyncDescriptor<NotificationTypeRow> = {
	id: 'notification_types',
	table: 'notification_types',
	endpointPath: '/sync/shapes/notification-types',
	syncMode: 'eager',
	columns: ['id', 'organizationId', 'name', 'description', 'isActive', 'createdAt', 'updatedAt'],
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
	applicationMethodsSyncDescriptor,
	sourceReductionMethodsSyncDescriptor,
	outreachMethodsSyncDescriptor,
	biocontrolMethodsSyncDescriptor,
	vehiclesSyncDescriptor,
	equipmentSyncDescriptor,
	notificationTypesSyncDescriptor,
	tagsSyncDescriptor,
	routesSyncDescriptor,
] as const;

export const webCommandMutationDescriptors = [
	currentOrganizationSyncDescriptor,
	collectionMethodsSyncDescriptor,
	collectionLuresSyncDescriptor,
	habitatTypesSyncDescriptor,
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
	encode: encodeShapeColumnName,
	decode: decodeShapeColumnName,
};

export function encodeShapeColumnName(value: string): string {
	if (value === 'mailingAddressLine1') {
		return 'mailing_address_line_1';
	}
	if (value === 'mailingAddressLine2') {
		return 'mailing_address_line_2';
	}

	return value.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`);
}

export function decodeShapeColumnName(value: string): string {
	if (value === 'mailing_address_line_1') {
		return 'mailingAddressLine1';
	}
	if (value === 'mailing_address_line_2') {
		return 'mailingAddressLine2';
	}

	return value.replace(/_([a-z])/g, (_match, letter: string) => letter.toUpperCase());
}
