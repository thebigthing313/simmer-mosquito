import {
	createIssues,
	jsonObject as normalizeJsonObject,
	nullableText as normalizeNullableText,
	optionalUuid as normalizeOptionalUuid,
	requiredText as normalizeRequiredText,
	requiredUuid as requireUuid,
	throwIfIssues,
} from '../command-validation.js';
import type { DomainId, GeoJsonPolygon, JsonObject } from '../shared.js';
import {
	type AgencyFoundationCommandInput,
	type AgencyFoundationCommandPayload,
	agencyPayload,
	type FoundationDomainCommand,
	normalizeRequiredDomainId,
	validateAgencyBase,
	validateAgencyIdCommand,
	validatePolygonGeometry,
} from './shared.js';

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
			regionFolderId: normalizeRequiredDomainId(input.regionFolderId),
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
			regionFolderId: normalizeRequiredDomainId(input.regionFolderId),
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
			regionFolderId: normalizeRequiredDomainId(input.regionFolderId),
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
			regionId: normalizeRequiredDomainId(input.regionId),
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
			regionId: normalizeRequiredDomainId(input.regionId),
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
			regionId: normalizeRequiredDomainId(input.regionId),
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
			regionId: normalizeRequiredDomainId(input.regionId),
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
			regionId: normalizeRequiredDomainId(input.regionId),
			acknowledgedRegionDelete: true,
		},
	};
}
