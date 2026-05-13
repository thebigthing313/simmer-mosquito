import {
	type DomainId,
	DomainValidationError,
	type DomainValidationIssue,
	type GeoJsonPoint,
	type GeoJsonPolygon,
	type JsonObject,
	normalizePointGeometry,
	normalizePolygonGeometry,
} from './shared.js';

export type FoundationCommandType =
	| 'foundation.createAddress'
	| 'foundation.updateAddressDetails'
	| 'foundation.updateAddressLocation'
	| 'foundation.deleteAddress'
	| 'foundation.mergeAddresses'
	| 'foundation.createRegionFolder'
	| 'foundation.updateRegionFolder'
	| 'foundation.deleteRegionFolder'
	| 'foundation.createRegion'
	| 'foundation.updateRegionDetails'
	| 'foundation.moveRegionToFolder'
	| 'foundation.updateRegionGeometry'
	| 'foundation.deleteRegion'
	| 'foundation.createGenus'
	| 'foundation.updateGenus'
	| 'foundation.deleteGenus'
	| 'foundation.createSpecies'
	| 'foundation.updateSpecies'
	| 'foundation.deleteSpecies'
	| 'foundation.selectOrganizationSpecies'
	| 'foundation.unselectOrganizationSpecies'
	| 'foundation.createCollectionMethod'
	| 'foundation.updateCollectionMethod'
	| 'foundation.deactivateCollectionMethod'
	| 'foundation.reactivateCollectionMethod'
	| 'foundation.deleteCollectionMethod'
	| 'foundation.createCollectionLure'
	| 'foundation.updateCollectionLure'
	| 'foundation.deactivateCollectionLure'
	| 'foundation.reactivateCollectionLure'
	| 'foundation.deleteCollectionLure'
	| 'foundation.createHabitatType'
	| 'foundation.updateHabitatType'
	| 'foundation.deactivateHabitatType'
	| 'foundation.reactivateHabitatType'
	| 'foundation.deleteHabitatType';

export type FoundationWarningCode =
	| 'duplicateAddressDisplayName'
	| 'duplicateAddressFeature'
	| 'duplicateRegionNameInFolder'
	| 'duplicateRegionFeatureInFolder'
	| 'duplicateSpeciesDisplayName'
	| 'mergedAddressLocationDiffers';

export interface FoundationCommandWarning {
	readonly code: FoundationWarningCode;
	readonly path: string;
	readonly message: string;
}

export interface FoundationDomainCommand<TType extends FoundationCommandType, TPayload> {
	readonly type: TType;
	readonly payload: TPayload;
}

interface AgencyFoundationCommandInput {
	readonly organizationId: DomainId;
	readonly actorProfileId: DomainId;
}

interface AgencyFoundationCommandPayload {
	readonly organizationId: DomainId;
	readonly actorProfileId: DomainId;
}

interface OperatorFoundationCommandInput {
	readonly operatorUserId: DomainId;
}

interface OperatorFoundationCommandPayload {
	readonly operatorUserId: DomainId;
}

export interface CreateAddressCommandInput extends AgencyFoundationCommandInput {
	readonly addressId: DomainId;
	readonly displayName: string;
	readonly geometry: unknown;
	readonly country?: string | null;
	readonly addressLine1?: string | null;
	readonly addressLine2?: string | null;
	readonly locality?: string | null;
	readonly region?: string | null;
	readonly postalCode?: string | null;
	readonly geocoderResponse?: unknown | null;
}

export type CreateAddressCommand = FoundationDomainCommand<
	'foundation.createAddress',
	AgencyFoundationCommandPayload & {
		readonly addressId: DomainId;
		readonly displayName: string;
		readonly geometry: GeoJsonPoint;
		readonly country: 'US';
		readonly addressLine1: string | null;
		readonly addressLine2: string | null;
		readonly locality: string | null;
		readonly region: string | null;
		readonly postalCode: string | null;
		readonly geocoderResponse: JsonObject | null;
	}
>;

export interface UpdateAddressDetailsCommandInput extends AgencyFoundationCommandInput {
	readonly addressId: DomainId;
	readonly displayName?: string;
	readonly addressLine1?: string | null;
	readonly addressLine2?: string | null;
	readonly locality?: string | null;
	readonly region?: string | null;
	readonly postalCode?: string | null;
	readonly geocoderResponse?: unknown | null;
}

export type UpdateAddressDetailsCommand = FoundationDomainCommand<
	'foundation.updateAddressDetails',
	AgencyFoundationCommandPayload & {
		readonly addressId: DomainId;
		readonly changes: Readonly<{
			readonly displayName?: string;
			readonly addressLine1?: string | null;
			readonly addressLine2?: string | null;
			readonly locality?: string | null;
			readonly region?: string | null;
			readonly postalCode?: string | null;
			readonly geocoderResponse?: JsonObject | null;
		}>;
	}
>;

export interface UpdateAddressLocationCommandInput extends AgencyFoundationCommandInput {
	readonly addressId: DomainId;
	readonly geometry: unknown;
}

export type UpdateAddressLocationCommand = FoundationDomainCommand<
	'foundation.updateAddressLocation',
	AgencyFoundationCommandPayload & {
		readonly addressId: DomainId;
		readonly geometry: GeoJsonPoint;
	}
>;

export interface AddressIdCommandInput extends AgencyFoundationCommandInput {
	readonly addressId: DomainId;
}

export type DeleteAddressCommand = FoundationDomainCommand<
	'foundation.deleteAddress',
	AgencyFoundationCommandPayload & { readonly addressId: DomainId }
>;

export interface MergeAddressesCommandInput extends AgencyFoundationCommandInput {
	readonly targetAddressId: DomainId;
	readonly sourceAddressIds: readonly DomainId[];
	readonly acknowledgedMergeConsolidatesHistory?: boolean;
}

export type MergeAddressesCommand = FoundationDomainCommand<
	'foundation.mergeAddresses',
	AgencyFoundationCommandPayload & {
		readonly targetAddressId: DomainId;
		readonly sourceAddressIds: readonly DomainId[];
		readonly acknowledgedMergeConsolidatesHistory: true;
	}
>;

export interface CreateRegionFolderCommandInput extends AgencyFoundationCommandInput {
	readonly regionFolderId: DomainId;
	readonly name: string;
	readonly description?: string | null;
}

export type CreateRegionFolderCommand = FoundationDomainCommand<
	'foundation.createRegionFolder',
	AgencyFoundationCommandPayload & {
		readonly regionFolderId: DomainId;
		readonly name: string;
		readonly description: string | null;
	}
>;

export interface UpdateRegionFolderCommandInput extends AgencyFoundationCommandInput {
	readonly regionFolderId: DomainId;
	readonly name?: string;
	readonly description?: string | null;
}

export type UpdateRegionFolderCommand = FoundationDomainCommand<
	'foundation.updateRegionFolder',
	AgencyFoundationCommandPayload & {
		readonly regionFolderId: DomainId;
		readonly changes: Readonly<{
			readonly name?: string;
			readonly description?: string | null;
		}>;
	}
>;

export interface DeleteRegionFolderCommandInput extends AgencyFoundationCommandInput {
	readonly regionFolderId: DomainId;
	readonly acknowledgedRegionDetach?: boolean;
}

export type DeleteRegionFolderCommand = FoundationDomainCommand<
	'foundation.deleteRegionFolder',
	AgencyFoundationCommandPayload & {
		readonly regionFolderId: DomainId;
		readonly acknowledgedRegionDetach: boolean;
	}
>;

export interface CreateRegionCommandInput extends AgencyFoundationCommandInput {
	readonly regionId: DomainId;
	readonly regionFolderId?: DomainId | null;
	readonly name: string;
	readonly description?: string | null;
	readonly metadata?: unknown | null;
	readonly geometry: unknown;
}

export type CreateRegionCommand = FoundationDomainCommand<
	'foundation.createRegion',
	AgencyFoundationCommandPayload & {
		readonly regionId: DomainId;
		readonly regionFolderId: DomainId | null;
		readonly name: string;
		readonly description: string | null;
		readonly metadata: JsonObject | null;
		readonly geometry: GeoJsonPolygon;
	}
>;

export interface UpdateRegionDetailsCommandInput extends AgencyFoundationCommandInput {
	readonly regionId: DomainId;
	readonly name?: string;
	readonly description?: string | null;
	readonly metadata?: unknown | null;
}

export type UpdateRegionDetailsCommand = FoundationDomainCommand<
	'foundation.updateRegionDetails',
	AgencyFoundationCommandPayload & {
		readonly regionId: DomainId;
		readonly changes: Readonly<{
			readonly name?: string;
			readonly description?: string | null;
			readonly metadata?: JsonObject | null;
		}>;
	}
>;

export interface MoveRegionToFolderCommandInput extends AgencyFoundationCommandInput {
	readonly regionId: DomainId;
	readonly regionFolderId: DomainId | null;
}

export type MoveRegionToFolderCommand = FoundationDomainCommand<
	'foundation.moveRegionToFolder',
	AgencyFoundationCommandPayload & {
		readonly regionId: DomainId;
		readonly regionFolderId: DomainId | null;
	}
>;

export interface UpdateRegionGeometryCommandInput extends AgencyFoundationCommandInput {
	readonly regionId: DomainId;
	readonly geometry: unknown;
	readonly acknowledgedRegionBoundaryChange?: boolean;
}

export type UpdateRegionGeometryCommand = FoundationDomainCommand<
	'foundation.updateRegionGeometry',
	AgencyFoundationCommandPayload & {
		readonly regionId: DomainId;
		readonly geometry: GeoJsonPolygon;
		readonly acknowledgedRegionBoundaryChange: true;
	}
>;

export interface DeleteRegionCommandInput extends AgencyFoundationCommandInput {
	readonly regionId: DomainId;
	readonly acknowledgedRegionDelete?: boolean;
}

export type DeleteRegionCommand = FoundationDomainCommand<
	'foundation.deleteRegion',
	AgencyFoundationCommandPayload & {
		readonly regionId: DomainId;
		readonly acknowledgedRegionDelete: true;
	}
>;

export interface CreateGenusCommandInput extends OperatorFoundationCommandInput {
	readonly genusId: DomainId;
	readonly abbreviation: string;
	readonly name: string;
}

export type CreateGenusCommand = FoundationDomainCommand<
	'foundation.createGenus',
	OperatorFoundationCommandPayload & {
		readonly genusId: DomainId;
		readonly abbreviation: string;
		readonly name: string;
	}
>;

export interface UpdateGenusCommandInput extends OperatorFoundationCommandInput {
	readonly genusId: DomainId;
	readonly abbreviation?: string;
	readonly name?: string;
	readonly acknowledgedTaxonomyLabelChange?: boolean;
}

export type UpdateGenusCommand = FoundationDomainCommand<
	'foundation.updateGenus',
	OperatorFoundationCommandPayload & {
		readonly genusId: DomainId;
		readonly changes: Readonly<{
			readonly abbreviation?: string;
			readonly name?: string;
		}>;
		readonly acknowledgedTaxonomyLabelChange: boolean;
	}
>;

export interface GenusIdCommandInput extends OperatorFoundationCommandInput {
	readonly genusId: DomainId;
}

export type DeleteGenusCommand = FoundationDomainCommand<
	'foundation.deleteGenus',
	OperatorFoundationCommandPayload & { readonly genusId: DomainId }
>;

export interface CreateSpeciesCommandInput extends OperatorFoundationCommandInput {
	readonly speciesId: DomainId;
	readonly genusId?: DomainId | null;
	readonly epithet: string;
	readonly commonName?: string | null;
	readonly displayName: string;
}

export type CreateSpeciesCommand = FoundationDomainCommand<
	'foundation.createSpecies',
	OperatorFoundationCommandPayload & {
		readonly speciesId: DomainId;
		readonly genusId: DomainId | null;
		readonly epithet: string;
		readonly commonName: string | null;
		readonly displayName: string;
	}
>;

export interface UpdateSpeciesCommandInput extends OperatorFoundationCommandInput {
	readonly speciesId: DomainId;
	readonly genusId?: DomainId | null;
	readonly epithet?: string;
	readonly commonName?: string | null;
	readonly displayName?: string;
	readonly acknowledgedTaxonomyMeaningChange?: boolean;
}

export type UpdateSpeciesCommand = FoundationDomainCommand<
	'foundation.updateSpecies',
	OperatorFoundationCommandPayload & {
		readonly speciesId: DomainId;
		readonly changes: Readonly<{
			readonly genusId?: DomainId | null;
			readonly epithet?: string;
			readonly commonName?: string | null;
			readonly displayName?: string;
		}>;
		readonly acknowledgedTaxonomyMeaningChange: boolean;
	}
>;

export interface SpeciesIdCommandInput extends OperatorFoundationCommandInput {
	readonly speciesId: DomainId;
}

export type DeleteSpeciesCommand = FoundationDomainCommand<
	'foundation.deleteSpecies',
	OperatorFoundationCommandPayload & { readonly speciesId: DomainId }
>;

export interface SelectOrganizationSpeciesCommandInput extends AgencyFoundationCommandInput {
	readonly organizationSpeciesId: DomainId;
	readonly speciesId: DomainId;
}

export type SelectOrganizationSpeciesCommand = FoundationDomainCommand<
	'foundation.selectOrganizationSpecies',
	AgencyFoundationCommandPayload & {
		readonly organizationSpeciesId: DomainId;
		readonly speciesId: DomainId;
	}
>;

export interface UnselectOrganizationSpeciesCommandInput extends AgencyFoundationCommandInput {
	readonly organizationSpeciesId: DomainId;
}

export type UnselectOrganizationSpeciesCommand = FoundationDomainCommand<
	'foundation.unselectOrganizationSpecies',
	AgencyFoundationCommandPayload & { readonly organizationSpeciesId: DomainId }
>;

interface CreateCollectionMethodCommandInputBase extends AgencyFoundationCommandInput {
	readonly collectionMethodId: DomainId;
	readonly name: string;
	readonly description?: string | null;
	readonly customSchema?: unknown | null;
	readonly actionThreshold?: number | null;
}

export interface CreateCollectionMethodCommandInput
	extends CreateCollectionMethodCommandInputBase {}

export type CreateCollectionMethodCommand = FoundationDomainCommand<
	'foundation.createCollectionMethod',
	AgencyFoundationCommandPayload & {
		readonly collectionMethodId: DomainId;
		readonly name: string;
		readonly description: string | null;
		readonly customSchema: JsonObject | null;
		readonly actionThreshold: number | null;
	}
>;

export interface UpdateCollectionMethodCommandInput extends AgencyFoundationCommandInput {
	readonly collectionMethodId: DomainId;
	readonly name?: string;
	readonly description?: string | null;
	readonly customSchema?: unknown | null;
	readonly actionThreshold?: number | null;
	readonly acknowledgedHistoricalLabelChange?: boolean;
}

export type UpdateCollectionMethodCommand = FoundationDomainCommand<
	'foundation.updateCollectionMethod',
	AgencyFoundationCommandPayload & {
		readonly collectionMethodId: DomainId;
		readonly changes: Readonly<{
			readonly name?: string;
			readonly description?: string | null;
			readonly customSchema?: JsonObject | null;
			readonly actionThreshold?: number | null;
		}>;
		readonly acknowledgedHistoricalLabelChange: boolean;
	}
>;

export interface CollectionMethodIdCommandInput extends AgencyFoundationCommandInput {
	readonly collectionMethodId: DomainId;
}

export type DeactivateCollectionMethodCommand = FoundationDomainCommand<
	'foundation.deactivateCollectionMethod',
	AgencyFoundationCommandPayload & { readonly collectionMethodId: DomainId }
>;

export type ReactivateCollectionMethodCommand = FoundationDomainCommand<
	'foundation.reactivateCollectionMethod',
	AgencyFoundationCommandPayload & { readonly collectionMethodId: DomainId }
>;

export type DeleteCollectionMethodCommand = FoundationDomainCommand<
	'foundation.deleteCollectionMethod',
	AgencyFoundationCommandPayload & { readonly collectionMethodId: DomainId }
>;

export interface CreateCollectionLureCommandInput extends AgencyFoundationCommandInput {
	readonly collectionLureId: DomainId;
	readonly name: string;
	readonly description?: string | null;
}

export type CreateCollectionLureCommand = FoundationDomainCommand<
	'foundation.createCollectionLure',
	AgencyFoundationCommandPayload & {
		readonly collectionLureId: DomainId;
		readonly name: string;
		readonly description: string | null;
	}
>;

export interface UpdateCollectionLureCommandInput extends AgencyFoundationCommandInput {
	readonly collectionLureId: DomainId;
	readonly name?: string;
	readonly description?: string | null;
	readonly acknowledgedHistoricalLabelChange?: boolean;
}

export type UpdateCollectionLureCommand = FoundationDomainCommand<
	'foundation.updateCollectionLure',
	AgencyFoundationCommandPayload & {
		readonly collectionLureId: DomainId;
		readonly changes: Readonly<{
			readonly name?: string;
			readonly description?: string | null;
		}>;
		readonly acknowledgedHistoricalLabelChange: boolean;
	}
>;

export interface CollectionLureIdCommandInput extends AgencyFoundationCommandInput {
	readonly collectionLureId: DomainId;
}

export type DeactivateCollectionLureCommand = FoundationDomainCommand<
	'foundation.deactivateCollectionLure',
	AgencyFoundationCommandPayload & { readonly collectionLureId: DomainId }
>;

export type ReactivateCollectionLureCommand = FoundationDomainCommand<
	'foundation.reactivateCollectionLure',
	AgencyFoundationCommandPayload & { readonly collectionLureId: DomainId }
>;

export type DeleteCollectionLureCommand = FoundationDomainCommand<
	'foundation.deleteCollectionLure',
	AgencyFoundationCommandPayload & { readonly collectionLureId: DomainId }
>;

export interface CreateHabitatTypeCommandInput extends AgencyFoundationCommandInput {
	readonly habitatTypeId: DomainId;
	readonly name: string;
	readonly description?: string | null;
	readonly customSchema?: unknown | null;
}

export type CreateHabitatTypeCommand = FoundationDomainCommand<
	'foundation.createHabitatType',
	AgencyFoundationCommandPayload & {
		readonly habitatTypeId: DomainId;
		readonly name: string;
		readonly description: string | null;
		readonly customSchema: JsonObject | null;
	}
>;

export interface UpdateHabitatTypeCommandInput extends AgencyFoundationCommandInput {
	readonly habitatTypeId: DomainId;
	readonly name?: string;
	readonly description?: string | null;
	readonly customSchema?: unknown | null;
	readonly acknowledgedHistoricalLabelChange?: boolean;
}

export type UpdateHabitatTypeCommand = FoundationDomainCommand<
	'foundation.updateHabitatType',
	AgencyFoundationCommandPayload & {
		readonly habitatTypeId: DomainId;
		readonly changes: Readonly<{
			readonly name?: string;
			readonly description?: string | null;
			readonly customSchema?: JsonObject | null;
		}>;
		readonly acknowledgedHistoricalLabelChange: boolean;
	}
>;

export interface HabitatTypeIdCommandInput extends AgencyFoundationCommandInput {
	readonly habitatTypeId: DomainId;
}

export type DeactivateHabitatTypeCommand = FoundationDomainCommand<
	'foundation.deactivateHabitatType',
	AgencyFoundationCommandPayload & { readonly habitatTypeId: DomainId }
>;

export type ReactivateHabitatTypeCommand = FoundationDomainCommand<
	'foundation.reactivateHabitatType',
	AgencyFoundationCommandPayload & { readonly habitatTypeId: DomainId }
>;

export type DeleteHabitatTypeCommand = FoundationDomainCommand<
	'foundation.deleteHabitatType',
	AgencyFoundationCommandPayload & { readonly habitatTypeId: DomainId }
>;

export type FoundationCommand =
	| CreateAddressCommand
	| UpdateAddressDetailsCommand
	| UpdateAddressLocationCommand
	| DeleteAddressCommand
	| MergeAddressesCommand
	| CreateRegionFolderCommand
	| UpdateRegionFolderCommand
	| DeleteRegionFolderCommand
	| CreateRegionCommand
	| UpdateRegionDetailsCommand
	| MoveRegionToFolderCommand
	| UpdateRegionGeometryCommand
	| DeleteRegionCommand
	| CreateGenusCommand
	| UpdateGenusCommand
	| DeleteGenusCommand
	| CreateSpeciesCommand
	| UpdateSpeciesCommand
	| DeleteSpeciesCommand
	| SelectOrganizationSpeciesCommand
	| UnselectOrganizationSpeciesCommand
	| CreateCollectionMethodCommand
	| UpdateCollectionMethodCommand
	| DeactivateCollectionMethodCommand
	| ReactivateCollectionMethodCommand
	| DeleteCollectionMethodCommand
	| CreateCollectionLureCommand
	| UpdateCollectionLureCommand
	| DeactivateCollectionLureCommand
	| ReactivateCollectionLureCommand
	| DeleteCollectionLureCommand
	| CreateHabitatTypeCommand
	| UpdateHabitatTypeCommand
	| DeactivateHabitatTypeCommand
	| ReactivateHabitatTypeCommand
	| DeleteHabitatTypeCommand;

export function createAddressCommand(input: CreateAddressCommandInput): CreateAddressCommand {
	const issues = createIssues();
	validateAgencyBase(input, issues);
	requireUuid(input.addressId, 'addressId', issues);
	const displayName = normalizeRequiredText(input.displayName, 'displayName', issues, 200);
	const geometry = validatePointGeometry(input.geometry, 'geometry', issues);
	const country = normalizeCountry(input.country, issues);
	const region = normalizeUsRegion(input.region, 'region', issues);
	const postalCode = normalizePostalCode(input.postalCode, 'postalCode', issues);
	const geocoderResponse = normalizeJsonObject(input.geocoderResponse, 'geocoderResponse', issues);
	throwIfIssues('Create address command is invalid.', issues);

	return {
		type: 'foundation.createAddress',
		payload: {
			...agencyPayload(input),
			addressId: normalizeRequiredId(input.addressId),
			displayName,
			geometry,
			country,
			addressLine1: normalizeNullableText(input.addressLine1, 'addressLine1', issues, 200),
			addressLine2: normalizeNullableText(input.addressLine2, 'addressLine2', issues, 200),
			locality: normalizeNullableText(input.locality, 'locality', issues, 200),
			region,
			postalCode,
			geocoderResponse,
		},
	};
}

export function updateAddressDetailsCommand(
	input: UpdateAddressDetailsCommandInput,
): UpdateAddressDetailsCommand {
	const issues = validateAgencyIdCommand(input, 'addressId');
	const hasDisplayName = input.displayName !== undefined;
	const hasAddress1 = input.addressLine1 !== undefined;
	const hasAddress2 = input.addressLine2 !== undefined;
	const hasLocality = input.locality !== undefined;
	const hasRegion = input.region !== undefined;
	const hasPostal = input.postalCode !== undefined;
	const hasGeocoder = input.geocoderResponse !== undefined;
	if (
		!hasDisplayName &&
		!hasAddress1 &&
		!hasAddress2 &&
		!hasLocality &&
		!hasRegion &&
		!hasPostal &&
		!hasGeocoder
	) {
		issues.push({ path: 'changes', message: 'At least one address detail must change.' });
	}
	const displayName = hasDisplayName
		? normalizeRequiredText(input.displayName, 'displayName', issues, 200)
		: undefined;
	const region = hasRegion ? normalizeUsRegion(input.region, 'region', issues) : undefined;
	const postalCode = hasPostal
		? normalizePostalCode(input.postalCode, 'postalCode', issues)
		: undefined;
	const geocoderResponse = hasGeocoder
		? normalizeJsonObject(input.geocoderResponse, 'geocoderResponse', issues)
		: undefined;
	throwIfIssues('Update address details command is invalid.', issues);

	return {
		type: 'foundation.updateAddressDetails',
		payload: {
			...agencyPayload(input),
			addressId: normalizeRequiredId(input.addressId),
			changes: {
				...(displayName !== undefined ? { displayName } : {}),
				...(hasAddress1
					? { addressLine1: normalizeNullableText(input.addressLine1, 'addressLine1', issues, 200) }
					: {}),
				...(hasAddress2
					? { addressLine2: normalizeNullableText(input.addressLine2, 'addressLine2', issues, 200) }
					: {}),
				...(hasLocality
					? { locality: normalizeNullableText(input.locality, 'locality', issues, 200) }
					: {}),
				...(hasRegion ? { region: region ?? null } : {}),
				...(hasPostal ? { postalCode: postalCode ?? null } : {}),
				...(hasGeocoder ? { geocoderResponse: geocoderResponse ?? null } : {}),
			},
		},
	};
}

export function updateAddressLocationCommand(
	input: UpdateAddressLocationCommandInput,
): UpdateAddressLocationCommand {
	const issues = validateAgencyIdCommand(input, 'addressId');
	const geometry = validatePointGeometry(input.geometry, 'geometry', issues);
	throwIfIssues('Update address location command is invalid.', issues);
	return {
		type: 'foundation.updateAddressLocation',
		payload: { ...agencyPayload(input), addressId: normalizeRequiredId(input.addressId), geometry },
	};
}

export function deleteAddressCommand(input: AddressIdCommandInput): DeleteAddressCommand {
	const issues = validateAgencyIdCommand(input, 'addressId');
	throwIfIssues('Delete address command is invalid.', issues);
	return {
		type: 'foundation.deleteAddress',
		payload: { ...agencyPayload(input), addressId: normalizeRequiredId(input.addressId) },
	};
}

export function mergeAddressesCommand(input: MergeAddressesCommandInput): MergeAddressesCommand {
	const issues = createIssues();
	validateAgencyBase(input, issues);
	requireUuid(input.targetAddressId, 'targetAddressId', issues);
	const sourceAddressIds = validateIdList(input.sourceAddressIds, 'sourceAddressIds', issues);
	const targetAddressId = normalizeRequiredId(input.targetAddressId);
	if (sourceAddressIds.includes(targetAddressId)) {
		issues.push({
			path: 'sourceAddressIds',
			message: 'sourceAddressIds cannot include targetAddressId.',
		});
	}
	if (input.acknowledgedMergeConsolidatesHistory !== true) {
		issues.push({
			path: 'acknowledgedMergeConsolidatesHistory',
			message: 'Address merge requires acknowledgement.',
		});
	}
	throwIfIssues('Merge addresses command is invalid.', issues);
	return {
		type: 'foundation.mergeAddresses',
		payload: {
			...agencyPayload(input),
			targetAddressId,
			sourceAddressIds,
			acknowledgedMergeConsolidatesHistory: true,
		},
	};
}

export function createRegionFolderCommand(
	input: CreateRegionFolderCommandInput,
): CreateRegionFolderCommand {
	const issues = createIssues();
	validateAgencyBase(input, issues);
	requireUuid(input.regionFolderId, 'regionFolderId', issues);
	const name = normalizeRequiredText(input.name, 'name', issues, 200);
	throwIfIssues('Create region folder command is invalid.', issues);
	return {
		type: 'foundation.createRegionFolder',
		payload: {
			...agencyPayload(input),
			regionFolderId: normalizeRequiredId(input.regionFolderId),
			name,
			description: normalizeNullableText(input.description, 'description', issues, 2_000),
		},
	};
}

export function updateRegionFolderCommand(
	input: UpdateRegionFolderCommandInput,
): UpdateRegionFolderCommand {
	const issues = validateAgencyIdCommand(input, 'regionFolderId');
	const hasName = input.name !== undefined;
	const hasDescription = input.description !== undefined;
	if (!hasName && !hasDescription) {
		issues.push({ path: 'changes', message: 'At least one region folder field must change.' });
	}
	const name = hasName ? normalizeRequiredText(input.name, 'name', issues, 200) : undefined;
	throwIfIssues('Update region folder command is invalid.', issues);
	return {
		type: 'foundation.updateRegionFolder',
		payload: {
			...agencyPayload(input),
			regionFolderId: normalizeRequiredId(input.regionFolderId),
			changes: {
				...(name !== undefined ? { name } : {}),
				...(hasDescription
					? { description: normalizeNullableText(input.description, 'description', issues, 2_000) }
					: {}),
			},
		},
	};
}

export function deleteRegionFolderCommand(
	input: DeleteRegionFolderCommandInput,
): DeleteRegionFolderCommand {
	const issues = validateAgencyIdCommand(input, 'regionFolderId');
	throwIfIssues('Delete region folder command is invalid.', issues);
	return {
		type: 'foundation.deleteRegionFolder',
		payload: {
			...agencyPayload(input),
			regionFolderId: normalizeRequiredId(input.regionFolderId),
			acknowledgedRegionDetach: input.acknowledgedRegionDetach ?? false,
		},
	};
}

export function createRegionCommand(input: CreateRegionCommandInput): CreateRegionCommand {
	const issues = createIssues();
	validateAgencyBase(input, issues);
	requireUuid(input.regionId, 'regionId', issues);
	const regionFolderId = normalizeOptionalUuid(input.regionFolderId, 'regionFolderId', issues);
	const name = normalizeRequiredText(input.name, 'name', issues, 200);
	const metadata = normalizeJsonObject(input.metadata, 'metadata', issues);
	const geometry = validatePolygonGeometry(input.geometry, 'geometry', issues);
	throwIfIssues('Create region command is invalid.', issues);
	return {
		type: 'foundation.createRegion',
		payload: {
			...agencyPayload(input),
			regionId: normalizeRequiredId(input.regionId),
			regionFolderId,
			name,
			description: normalizeNullableText(input.description, 'description', issues, 2_000),
			metadata,
			geometry,
		},
	};
}

export function updateRegionDetailsCommand(
	input: UpdateRegionDetailsCommandInput,
): UpdateRegionDetailsCommand {
	const issues = validateAgencyIdCommand(input, 'regionId');
	const hasName = input.name !== undefined;
	const hasDescription = input.description !== undefined;
	const hasMetadata = input.metadata !== undefined;
	if (!hasName && !hasDescription && !hasMetadata) {
		issues.push({ path: 'changes', message: 'At least one region detail must change.' });
	}
	const name = hasName ? normalizeRequiredText(input.name, 'name', issues, 200) : undefined;
	const metadata = hasMetadata
		? normalizeJsonObject(input.metadata, 'metadata', issues)
		: undefined;
	throwIfIssues('Update region details command is invalid.', issues);
	return {
		type: 'foundation.updateRegionDetails',
		payload: {
			...agencyPayload(input),
			regionId: normalizeRequiredId(input.regionId),
			changes: {
				...(name !== undefined ? { name } : {}),
				...(hasDescription
					? { description: normalizeNullableText(input.description, 'description', issues, 2_000) }
					: {}),
				...(hasMetadata ? { metadata: metadata ?? null } : {}),
			},
		},
	};
}

export function moveRegionToFolderCommand(
	input: MoveRegionToFolderCommandInput,
): MoveRegionToFolderCommand {
	const issues = validateAgencyIdCommand(input, 'regionId');
	const regionFolderId = normalizeOptionalUuid(input.regionFolderId, 'regionFolderId', issues);
	throwIfIssues('Move region to folder command is invalid.', issues);
	return {
		type: 'foundation.moveRegionToFolder',
		payload: {
			...agencyPayload(input),
			regionId: normalizeRequiredId(input.regionId),
			regionFolderId,
		},
	};
}

export function updateRegionGeometryCommand(
	input: UpdateRegionGeometryCommandInput,
): UpdateRegionGeometryCommand {
	const issues = validateAgencyIdCommand(input, 'regionId');
	const geometry = validatePolygonGeometry(input.geometry, 'geometry', issues);
	if (input.acknowledgedRegionBoundaryChange !== true) {
		issues.push({
			path: 'acknowledgedRegionBoundaryChange',
			message: 'Region boundary changes require acknowledgement.',
		});
	}
	throwIfIssues('Update region geometry command is invalid.', issues);
	return {
		type: 'foundation.updateRegionGeometry',
		payload: {
			...agencyPayload(input),
			regionId: normalizeRequiredId(input.regionId),
			geometry,
			acknowledgedRegionBoundaryChange: true,
		},
	};
}

export function deleteRegionCommand(input: DeleteRegionCommandInput): DeleteRegionCommand {
	const issues = validateAgencyIdCommand(input, 'regionId');
	if (input.acknowledgedRegionDelete !== true) {
		issues.push({
			path: 'acknowledgedRegionDelete',
			message: 'Region delete requires acknowledgement.',
		});
	}
	throwIfIssues('Delete region command is invalid.', issues);
	return {
		type: 'foundation.deleteRegion',
		payload: {
			...agencyPayload(input),
			regionId: normalizeRequiredId(input.regionId),
			acknowledgedRegionDelete: true,
		},
	};
}

export function createGenusCommand(input: CreateGenusCommandInput): CreateGenusCommand {
	const issues = createIssues();
	validateOperatorBase(input, issues);
	requireUuid(input.genusId, 'genusId', issues);
	const abbreviation = normalizeRequiredText(input.abbreviation, 'abbreviation', issues, 20);
	const name = normalizeRequiredText(input.name, 'name', issues, 200);
	throwIfIssues('Create genus command is invalid.', issues);
	return {
		type: 'foundation.createGenus',
		payload: {
			...operatorPayload(input),
			genusId: normalizeRequiredId(input.genusId),
			abbreviation,
			name,
		},
	};
}

export function updateGenusCommand(input: UpdateGenusCommandInput): UpdateGenusCommand {
	const issues = validateOperatorIdCommand(input, 'genusId');
	const hasAbbreviation = input.abbreviation !== undefined;
	const hasName = input.name !== undefined;
	if (!hasAbbreviation && !hasName) {
		issues.push({ path: 'changes', message: 'At least one genus field must change.' });
	}
	const abbreviation = hasAbbreviation
		? normalizeRequiredText(input.abbreviation, 'abbreviation', issues, 20)
		: undefined;
	const name = hasName ? normalizeRequiredText(input.name, 'name', issues, 200) : undefined;
	throwIfIssues('Update genus command is invalid.', issues);
	return {
		type: 'foundation.updateGenus',
		payload: {
			...operatorPayload(input),
			genusId: normalizeRequiredId(input.genusId),
			changes: {
				...(abbreviation !== undefined ? { abbreviation } : {}),
				...(name !== undefined ? { name } : {}),
			},
			acknowledgedTaxonomyLabelChange: input.acknowledgedTaxonomyLabelChange ?? false,
		},
	};
}

export function deleteGenusCommand(input: GenusIdCommandInput): DeleteGenusCommand {
	const issues = validateOperatorIdCommand(input, 'genusId');
	throwIfIssues('Delete genus command is invalid.', issues);
	return {
		type: 'foundation.deleteGenus',
		payload: { ...operatorPayload(input), genusId: normalizeRequiredId(input.genusId) },
	};
}

export function createSpeciesCommand(input: CreateSpeciesCommandInput): CreateSpeciesCommand {
	const issues = createIssues();
	validateOperatorBase(input, issues);
	requireUuid(input.speciesId, 'speciesId', issues);
	const genusId = normalizeOptionalUuid(input.genusId, 'genusId', issues);
	const epithet = normalizeRequiredText(input.epithet, 'epithet', issues, 200);
	const commonName = normalizeNullableText(input.commonName, 'commonName', issues, 200);
	const displayName = normalizeRequiredText(input.displayName, 'displayName', issues, 200);
	throwIfIssues('Create species command is invalid.', issues);
	return {
		type: 'foundation.createSpecies',
		payload: {
			...operatorPayload(input),
			speciesId: normalizeRequiredId(input.speciesId),
			genusId,
			epithet,
			commonName,
			displayName,
		},
	};
}

export function updateSpeciesCommand(input: UpdateSpeciesCommandInput): UpdateSpeciesCommand {
	const issues = validateOperatorIdCommand(input, 'speciesId');
	const hasGenus = input.genusId !== undefined;
	const hasEpithet = input.epithet !== undefined;
	const hasCommon = input.commonName !== undefined;
	const hasDisplay = input.displayName !== undefined;
	if (!hasGenus && !hasEpithet && !hasCommon && !hasDisplay) {
		issues.push({ path: 'changes', message: 'At least one species field must change.' });
	}
	const genusId = hasGenus ? normalizeOptionalUuid(input.genusId, 'genusId', issues) : undefined;
	const epithet = hasEpithet
		? normalizeRequiredText(input.epithet, 'epithet', issues, 200)
		: undefined;
	const commonName = hasCommon
		? normalizeNullableText(input.commonName, 'commonName', issues, 200)
		: undefined;
	const displayName = hasDisplay
		? normalizeRequiredText(input.displayName, 'displayName', issues, 200)
		: undefined;
	throwIfIssues('Update species command is invalid.', issues);
	return {
		type: 'foundation.updateSpecies',
		payload: {
			...operatorPayload(input),
			speciesId: normalizeRequiredId(input.speciesId),
			changes: {
				...(hasGenus ? { genusId: genusId ?? null } : {}),
				...(epithet !== undefined ? { epithet } : {}),
				...(hasCommon ? { commonName: commonName ?? null } : {}),
				...(displayName !== undefined ? { displayName } : {}),
			},
			acknowledgedTaxonomyMeaningChange: input.acknowledgedTaxonomyMeaningChange ?? false,
		},
	};
}

export function deleteSpeciesCommand(input: SpeciesIdCommandInput): DeleteSpeciesCommand {
	const issues = validateOperatorIdCommand(input, 'speciesId');
	throwIfIssues('Delete species command is invalid.', issues);
	return {
		type: 'foundation.deleteSpecies',
		payload: { ...operatorPayload(input), speciesId: normalizeRequiredId(input.speciesId) },
	};
}

export function selectOrganizationSpeciesCommand(
	input: SelectOrganizationSpeciesCommandInput,
): SelectOrganizationSpeciesCommand {
	const issues = createIssues();
	validateAgencyBase(input, issues);
	requireUuid(input.organizationSpeciesId, 'organizationSpeciesId', issues);
	requireUuid(input.speciesId, 'speciesId', issues);
	throwIfIssues('Select organization species command is invalid.', issues);
	return {
		type: 'foundation.selectOrganizationSpecies',
		payload: {
			...agencyPayload(input),
			organizationSpeciesId: normalizeRequiredId(input.organizationSpeciesId),
			speciesId: normalizeRequiredId(input.speciesId),
		},
	};
}

export function unselectOrganizationSpeciesCommand(
	input: UnselectOrganizationSpeciesCommandInput,
): UnselectOrganizationSpeciesCommand {
	const issues = validateAgencyIdCommand(input, 'organizationSpeciesId');
	throwIfIssues('Unselect organization species command is invalid.', issues);
	return {
		type: 'foundation.unselectOrganizationSpecies',
		payload: {
			...agencyPayload(input),
			organizationSpeciesId: normalizeRequiredId(input.organizationSpeciesId),
		},
	};
}

export function createCollectionMethodCommand(
	input: CreateCollectionMethodCommandInput,
): CreateCollectionMethodCommand {
	const issues = createIssues();
	validateAgencyBase(input, issues);
	requireUuid(input.collectionMethodId, 'collectionMethodId', issues);
	const name = normalizeRequiredText(input.name, 'name', issues, 200);
	const customSchema = normalizeJsonObject(input.customSchema, 'customSchema', issues);
	const actionThreshold = normalizeNullableNonnegativeInteger(
		input.actionThreshold,
		'actionThreshold',
		issues,
	);
	throwIfIssues('Create collection method command is invalid.', issues);
	return {
		type: 'foundation.createCollectionMethod',
		payload: {
			...agencyPayload(input),
			collectionMethodId: normalizeRequiredId(input.collectionMethodId),
			name,
			description: normalizeNullableText(input.description, 'description', issues, 2_000),
			customSchema,
			actionThreshold,
		},
	};
}

export function updateCollectionMethodCommand(
	input: UpdateCollectionMethodCommandInput,
): UpdateCollectionMethodCommand {
	const issues = validateAgencyIdCommand(input, 'collectionMethodId');
	const hasName = input.name !== undefined;
	const hasDescription = input.description !== undefined;
	const hasSchema = input.customSchema !== undefined;
	const hasThreshold = input.actionThreshold !== undefined;
	if (!hasName && !hasDescription && !hasSchema && !hasThreshold) {
		issues.push({ path: 'changes', message: 'At least one collection method field must change.' });
	}
	const name = hasName ? normalizeRequiredText(input.name, 'name', issues, 200) : undefined;
	const customSchema = hasSchema
		? normalizeJsonObject(input.customSchema, 'customSchema', issues)
		: undefined;
	const actionThreshold = hasThreshold
		? normalizeNullableNonnegativeInteger(input.actionThreshold, 'actionThreshold', issues)
		: undefined;
	throwIfIssues('Update collection method command is invalid.', issues);
	return {
		type: 'foundation.updateCollectionMethod',
		payload: {
			...agencyPayload(input),
			collectionMethodId: normalizeRequiredId(input.collectionMethodId),
			changes: {
				...(name !== undefined ? { name } : {}),
				...(hasDescription
					? { description: normalizeNullableText(input.description, 'description', issues, 2_000) }
					: {}),
				...(hasSchema ? { customSchema: customSchema ?? null } : {}),
				...(hasThreshold ? { actionThreshold: actionThreshold ?? null } : {}),
			},
			acknowledgedHistoricalLabelChange: input.acknowledgedHistoricalLabelChange ?? false,
		},
	};
}

export function deactivateCollectionMethodCommand(
	input: CollectionMethodIdCommandInput,
): DeactivateCollectionMethodCommand {
	return collectionMethodIdCommand(
		'foundation.deactivateCollectionMethod',
		input,
		'Deactivate collection method command is invalid.',
	);
}

export function reactivateCollectionMethodCommand(
	input: CollectionMethodIdCommandInput,
): ReactivateCollectionMethodCommand {
	return collectionMethodIdCommand(
		'foundation.reactivateCollectionMethod',
		input,
		'Reactivate collection method command is invalid.',
	);
}

export function deleteCollectionMethodCommand(
	input: CollectionMethodIdCommandInput,
): DeleteCollectionMethodCommand {
	return collectionMethodIdCommand(
		'foundation.deleteCollectionMethod',
		input,
		'Delete collection method command is invalid.',
	);
}

export function createCollectionLureCommand(
	input: CreateCollectionLureCommandInput,
): CreateCollectionLureCommand {
	const issues = createIssues();
	validateAgencyBase(input, issues);
	requireUuid(input.collectionLureId, 'collectionLureId', issues);
	const name = normalizeRequiredText(input.name, 'name', issues, 200);
	throwIfIssues('Create collection lure command is invalid.', issues);
	return {
		type: 'foundation.createCollectionLure',
		payload: {
			...agencyPayload(input),
			collectionLureId: normalizeRequiredId(input.collectionLureId),
			name,
			description: normalizeNullableText(input.description, 'description', issues, 2_000),
		},
	};
}

export function updateCollectionLureCommand(
	input: UpdateCollectionLureCommandInput,
): UpdateCollectionLureCommand {
	const issues = validateAgencyIdCommand(input, 'collectionLureId');
	const hasName = input.name !== undefined;
	const hasDescription = input.description !== undefined;
	if (!hasName && !hasDescription) {
		issues.push({ path: 'changes', message: 'At least one collection lure field must change.' });
	}
	const name = hasName ? normalizeRequiredText(input.name, 'name', issues, 200) : undefined;
	throwIfIssues('Update collection lure command is invalid.', issues);
	return {
		type: 'foundation.updateCollectionLure',
		payload: {
			...agencyPayload(input),
			collectionLureId: normalizeRequiredId(input.collectionLureId),
			changes: {
				...(name !== undefined ? { name } : {}),
				...(hasDescription
					? { description: normalizeNullableText(input.description, 'description', issues, 2_000) }
					: {}),
			},
			acknowledgedHistoricalLabelChange: input.acknowledgedHistoricalLabelChange ?? false,
		},
	};
}

export function deactivateCollectionLureCommand(
	input: CollectionLureIdCommandInput,
): DeactivateCollectionLureCommand {
	return collectionLureIdCommand(
		'foundation.deactivateCollectionLure',
		input,
		'Deactivate collection lure command is invalid.',
	);
}

export function reactivateCollectionLureCommand(
	input: CollectionLureIdCommandInput,
): ReactivateCollectionLureCommand {
	return collectionLureIdCommand(
		'foundation.reactivateCollectionLure',
		input,
		'Reactivate collection lure command is invalid.',
	);
}

export function deleteCollectionLureCommand(
	input: CollectionLureIdCommandInput,
): DeleteCollectionLureCommand {
	return collectionLureIdCommand(
		'foundation.deleteCollectionLure',
		input,
		'Delete collection lure command is invalid.',
	);
}

export function createHabitatTypeCommand(
	input: CreateHabitatTypeCommandInput,
): CreateHabitatTypeCommand {
	const issues = createIssues();
	validateAgencyBase(input, issues);
	requireUuid(input.habitatTypeId, 'habitatTypeId', issues);
	const name = normalizeRequiredText(input.name, 'name', issues, 200);
	const customSchema = normalizeJsonObject(input.customSchema, 'customSchema', issues);
	throwIfIssues('Create habitat type command is invalid.', issues);
	return {
		type: 'foundation.createHabitatType',
		payload: {
			...agencyPayload(input),
			habitatTypeId: normalizeRequiredId(input.habitatTypeId),
			name,
			description: normalizeNullableText(input.description, 'description', issues, 2_000),
			customSchema,
		},
	};
}

export function updateHabitatTypeCommand(
	input: UpdateHabitatTypeCommandInput,
): UpdateHabitatTypeCommand {
	const issues = validateAgencyIdCommand(input, 'habitatTypeId');
	const hasName = input.name !== undefined;
	const hasDescription = input.description !== undefined;
	const hasSchema = input.customSchema !== undefined;
	if (!hasName && !hasDescription && !hasSchema) {
		issues.push({ path: 'changes', message: 'At least one habitat type field must change.' });
	}
	const name = hasName ? normalizeRequiredText(input.name, 'name', issues, 200) : undefined;
	const customSchema = hasSchema
		? normalizeJsonObject(input.customSchema, 'customSchema', issues)
		: undefined;
	throwIfIssues('Update habitat type command is invalid.', issues);
	return {
		type: 'foundation.updateHabitatType',
		payload: {
			...agencyPayload(input),
			habitatTypeId: normalizeRequiredId(input.habitatTypeId),
			changes: {
				...(name !== undefined ? { name } : {}),
				...(hasDescription
					? { description: normalizeNullableText(input.description, 'description', issues, 2_000) }
					: {}),
				...(hasSchema ? { customSchema: customSchema ?? null } : {}),
			},
			acknowledgedHistoricalLabelChange: input.acknowledgedHistoricalLabelChange ?? false,
		},
	};
}

export function deactivateHabitatTypeCommand(
	input: HabitatTypeIdCommandInput,
): DeactivateHabitatTypeCommand {
	return habitatTypeIdCommand(
		'foundation.deactivateHabitatType',
		input,
		'Deactivate habitat type command is invalid.',
	);
}

export function reactivateHabitatTypeCommand(
	input: HabitatTypeIdCommandInput,
): ReactivateHabitatTypeCommand {
	return habitatTypeIdCommand(
		'foundation.reactivateHabitatType',
		input,
		'Reactivate habitat type command is invalid.',
	);
}

export function deleteHabitatTypeCommand(
	input: HabitatTypeIdCommandInput,
): DeleteHabitatTypeCommand {
	return habitatTypeIdCommand(
		'foundation.deleteHabitatType',
		input,
		'Delete habitat type command is invalid.',
	);
}

function collectionMethodIdCommand<
	TType extends
		| 'foundation.deactivateCollectionMethod'
		| 'foundation.reactivateCollectionMethod'
		| 'foundation.deleteCollectionMethod',
>(
	type: TType,
	input: CollectionMethodIdCommandInput,
	message: string,
): FoundationDomainCommand<
	TType,
	AgencyFoundationCommandPayload & { readonly collectionMethodId: DomainId }
> {
	const issues = validateAgencyIdCommand(input, 'collectionMethodId');
	throwIfIssues(message, issues);
	return {
		type,
		payload: {
			...agencyPayload(input),
			collectionMethodId: normalizeRequiredId(input.collectionMethodId),
		},
	};
}

function collectionLureIdCommand<
	TType extends
		| 'foundation.deactivateCollectionLure'
		| 'foundation.reactivateCollectionLure'
		| 'foundation.deleteCollectionLure',
>(
	type: TType,
	input: CollectionLureIdCommandInput,
	message: string,
): FoundationDomainCommand<
	TType,
	AgencyFoundationCommandPayload & { readonly collectionLureId: DomainId }
> {
	const issues = validateAgencyIdCommand(input, 'collectionLureId');
	throwIfIssues(message, issues);
	return {
		type,
		payload: {
			...agencyPayload(input),
			collectionLureId: normalizeRequiredId(input.collectionLureId),
		},
	};
}

function habitatTypeIdCommand<
	TType extends
		| 'foundation.deactivateHabitatType'
		| 'foundation.reactivateHabitatType'
		| 'foundation.deleteHabitatType',
>(
	type: TType,
	input: HabitatTypeIdCommandInput,
	message: string,
): FoundationDomainCommand<
	TType,
	AgencyFoundationCommandPayload & { readonly habitatTypeId: DomainId }
> {
	const issues = validateAgencyIdCommand(input, 'habitatTypeId');
	throwIfIssues(message, issues);
	return {
		type,
		payload: { ...agencyPayload(input), habitatTypeId: normalizeRequiredId(input.habitatTypeId) },
	};
}

function validateAgencyBase(
	input: AgencyFoundationCommandInput,
	issues: DomainValidationIssue[],
): void {
	requireUuid(input.organizationId, 'organizationId', issues);
	requireUuid(input.actorProfileId, 'actorProfileId', issues);
}

function validateOperatorBase(
	input: OperatorFoundationCommandInput,
	issues: DomainValidationIssue[],
): void {
	requireUuid(input.operatorUserId, 'operatorUserId', issues);
}

function validateAgencyIdCommand<T extends AgencyFoundationCommandInput>(
	input: T,
	idKey: keyof T & string,
): DomainValidationIssue[] {
	const issues = createIssues();
	validateAgencyBase(input, issues);
	requireUuid(input[idKey] as string | undefined, idKey, issues);
	return issues;
}

function validateOperatorIdCommand<T extends OperatorFoundationCommandInput>(
	input: T,
	idKey: keyof T & string,
): DomainValidationIssue[] {
	const issues = createIssues();
	validateOperatorBase(input, issues);
	requireUuid(input[idKey] as string | undefined, idKey, issues);
	return issues;
}

function validatePointGeometry(
	value: unknown,
	path: string,
	issues: DomainValidationIssue[],
): GeoJsonPoint {
	try {
		return normalizePointGeometry(value, path);
	} catch (error) {
		if (error instanceof DomainValidationError) {
			issues.push(...error.issues);
			return { type: 'Point', coordinates: [0, 0] };
		}
		throw error;
	}
}

function validatePolygonGeometry(
	value: unknown,
	path: string,
	issues: DomainValidationIssue[],
): GeoJsonPolygon {
	try {
		return normalizePolygonGeometry(value, path);
	} catch (error) {
		if (error instanceof DomainValidationError) {
			issues.push(...error.issues);
			return {
				type: 'Polygon',
				coordinates: [
					[
						[0, 0],
						[0, 1],
						[1, 1],
						[0, 0],
					],
				],
			};
		}
		throw error;
	}
}

function validateIdList(
	values: readonly DomainId[],
	path: string,
	issues: DomainValidationIssue[],
): readonly DomainId[] {
	if (!Array.isArray(values) || values.length === 0) {
		issues.push({ path, message: `${path} must include at least one id.` });
		return [];
	}
	const seen = new Set<string>();
	return values.map((value, index) => {
		requireUuid(value, `${path}.${index}`, issues);
		const normalized = normalizeRequiredId(value);
		if (seen.has(normalized)) {
			issues.push({ path: `${path}.${index}`, message: `${path} must not contain duplicates.` });
		}
		seen.add(normalized);
		return normalized;
	});
}

function normalizeCountry(value: string | null | undefined, issues: DomainValidationIssue[]): 'US' {
	const normalized = value === undefined || value === null ? 'US' : value.trim().toUpperCase();
	if (normalized !== 'US') {
		issues.push({ path: 'country', message: 'country must be US for v1.' });
	}
	return 'US';
}

function normalizeUsRegion(
	value: string | null | undefined,
	path: string,
	issues: DomainValidationIssue[],
): string | null {
	const normalized = normalizeNullableText(value, path, issues, 2);
	if (normalized === null) {
		return null;
	}
	const upper = normalized.toUpperCase();
	if (!/^[A-Z]{2}$/.test(upper)) {
		issues.push({ path, message: `${path} must be a two-letter state or territory code.` });
	}
	return upper;
}

function normalizePostalCode(
	value: string | null | undefined,
	path: string,
	issues: DomainValidationIssue[],
): string | null {
	const normalized = normalizeNullableText(value, path, issues, 10);
	if (normalized === null) {
		return null;
	}
	if (!/^\d{5}(-\d{4})?$/.test(normalized)) {
		issues.push({ path, message: `${path} must be a ZIP or ZIP+4 postal code.` });
	}
	return normalized;
}

function normalizeJsonObject(
	value: unknown | null | undefined,
	path: string,
	issues: DomainValidationIssue[],
): JsonObject | null {
	if (value === undefined || value === null) {
		return null;
	}
	if (typeof value !== 'object' || Array.isArray(value)) {
		issues.push({ path, message: `${path} must be a JSON object or null.` });
		return null;
	}
	return value as JsonObject;
}

function normalizeNullableNonnegativeInteger(
	value: number | null | undefined,
	path: string,
	issues: DomainValidationIssue[],
): number | null {
	if (value === undefined || value === null) {
		return null;
	}
	if (!Number.isInteger(value) || value < 0) {
		issues.push({ path, message: `${path} must be a nonnegative integer or null.` });
		return null;
	}
	return value;
}

function normalizeRequiredText(
	value: string | null | undefined,
	path: string,
	issues: DomainValidationIssue[],
	maxLength: number,
): string {
	const normalized = normalizeNullableText(value, path, issues, maxLength);
	if (normalized === null) {
		issues.push({ path, message: `${path} is required.` });
		return '';
	}
	return normalized;
}

function normalizeNullableText(
	value: string | null | undefined,
	path: string,
	issues: DomainValidationIssue[],
	maxLength: number,
): string | null {
	if (value === undefined || value === null) {
		return null;
	}
	const trimmed = value.trim();
	if (trimmed.length === 0) {
		return null;
	}
	if (trimmed.length > maxLength) {
		issues.push({ path, message: `${path} must be ${maxLength} characters or fewer.` });
	}
	return trimmed;
}

function requireUuid(
	value: string | null | undefined,
	path: string,
	issues: DomainValidationIssue[],
): void {
	const normalized = normalizeOptionalId(value);
	if (normalized === null) {
		issues.push({ path, message: `${path} is required.` });
		return;
	}
	if (!isUuid(normalized)) {
		issues.push({ path, message: `${path} must be a UUID.` });
	}
}

function normalizeOptionalUuid(
	value: string | null | undefined,
	path: string,
	issues: DomainValidationIssue[],
): string | null {
	const normalized = normalizeOptionalId(value);
	if (normalized !== null && !isUuid(normalized)) {
		issues.push({ path, message: `${path} must be a UUID.` });
	}
	return normalized;
}

function normalizeRequiredId(value: string | null | undefined): string {
	return normalizeOptionalId(value) ?? '';
}

function normalizeOptionalId(value: string | null | undefined): string | null {
	if (value === undefined || value === null) {
		return null;
	}
	const trimmed = value.trim();
	return trimmed.length === 0 ? null : trimmed;
}

function agencyPayload(input: AgencyFoundationCommandInput): AgencyFoundationCommandPayload {
	return {
		organizationId: normalizeRequiredId(input.organizationId),
		actorProfileId: normalizeRequiredId(input.actorProfileId),
	};
}

function operatorPayload(input: OperatorFoundationCommandInput): OperatorFoundationCommandPayload {
	return {
		operatorUserId: normalizeRequiredId(input.operatorUserId),
	};
}

function isUuid(value: string): boolean {
	return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function createIssues(): DomainValidationIssue[] {
	return [];
}

function throwIfIssues(message: string, issues: readonly DomainValidationIssue[]): void {
	if (issues.length > 0) {
		throw new DomainValidationError(message, issues);
	}
}
