import {
	createIssues,
	jsonObject as normalizeJsonObject,
	nullableText as normalizeNullableText,
	optionalUuid as normalizeOptionalUuid,
	normalizeRequiredDomainId,
	requiredText as normalizeRequiredText,
	organizationPayload,
	requiredUuid as requireUuid,
	throwIfIssues,
	validateOrganizationBase,
	validateOrganizationIdCommand,
} from '../command-validation.js';
import type { DomainId, JsonObject } from '../shared.js';
import {
	jsonObjectField,
	nullableTextField,
	requiredTextField,
	type UpdateFieldSet,
	type UpdateFieldsChanges,
	type UpdateFieldsInput,
	updateFieldsCommand,
} from '../update-command-fields.js';
import {
	type FoundationDomainCommand,
	type OrganizationFoundationCommandInput,
	type OrganizationFoundationCommandPayload,
	type RegionGeometry,
	validateRegionGeometry,
} from './shared.js';

export interface CreateRegionFolderCommandInput extends OrganizationFoundationCommandInput {
	readonly regionFolderId: DomainId;
	readonly name: string;
	readonly description?: string | null;
}

export type CreateRegionFolderCommand = FoundationDomainCommand<
	'foundation.createRegionFolder',
	OrganizationFoundationCommandPayload & {
		readonly regionFolderId: DomainId;
		readonly name: string;
		readonly description: string | null;
	}
>;

export const REGION_FOLDER_UPDATE_FIELDS = {
	name: requiredTextField(200),
	description: nullableTextField(2_000),
} satisfies UpdateFieldSet;

export type UpdateRegionFolderCommandInput = OrganizationFoundationCommandInput &
	UpdateFieldsInput<typeof REGION_FOLDER_UPDATE_FIELDS> & {
		readonly regionFolderId: DomainId;
	};

export type UpdateRegionFolderCommand = FoundationDomainCommand<
	'foundation.updateRegionFolder',
	OrganizationFoundationCommandPayload & {
		readonly regionFolderId: DomainId;
		readonly changes: UpdateFieldsChanges<typeof REGION_FOLDER_UPDATE_FIELDS>;
	}
>;

export interface DeleteRegionFolderCommandInput extends OrganizationFoundationCommandInput {
	readonly regionFolderId: DomainId;
	readonly acknowledgedRegionDetach?: boolean;
}

export type DeleteRegionFolderCommand = FoundationDomainCommand<
	'foundation.deleteRegionFolder',
	OrganizationFoundationCommandPayload & {
		readonly regionFolderId: DomainId;
		readonly acknowledgedRegionDetach: boolean;
	}
>;

export interface CreateRegionCommandInput extends OrganizationFoundationCommandInput {
	readonly regionId: DomainId;
	readonly regionFolderId?: DomainId | null;
	readonly name: string;
	readonly description?: string | null;
	readonly metadata?: unknown | null;
	readonly geometry: unknown;
}

export type CreateRegionCommand = FoundationDomainCommand<
	'foundation.createRegion',
	OrganizationFoundationCommandPayload & {
		readonly regionId: DomainId;
		readonly regionFolderId: DomainId | null;
		readonly name: string;
		readonly description: string | null;
		readonly metadata: JsonObject | null;
		readonly geometry: RegionGeometry;
	}
>;

export const REGION_UPDATE_FIELDS = {
	name: requiredTextField(200),
	description: nullableTextField(2_000),
	metadata: jsonObjectField,
} satisfies UpdateFieldSet;

export type UpdateRegionDetailsCommandInput = OrganizationFoundationCommandInput &
	UpdateFieldsInput<typeof REGION_UPDATE_FIELDS> & {
		readonly regionId: DomainId;
	};

export type UpdateRegionDetailsCommand = FoundationDomainCommand<
	'foundation.updateRegionDetails',
	OrganizationFoundationCommandPayload & {
		readonly regionId: DomainId;
		readonly changes: UpdateFieldsChanges<typeof REGION_UPDATE_FIELDS>;
	}
>;

export interface MoveRegionToFolderCommandInput extends OrganizationFoundationCommandInput {
	readonly regionId: DomainId;
	readonly regionFolderId: DomainId | null;
}

export type MoveRegionToFolderCommand = FoundationDomainCommand<
	'foundation.moveRegionToFolder',
	OrganizationFoundationCommandPayload & {
		readonly regionId: DomainId;
		readonly regionFolderId: DomainId | null;
	}
>;

export interface UpdateRegionGeometryCommandInput extends OrganizationFoundationCommandInput {
	readonly regionId: DomainId;
	readonly geometry: unknown;
	readonly acknowledgedRegionBoundaryChange?: boolean;
}

export type UpdateRegionGeometryCommand = FoundationDomainCommand<
	'foundation.updateRegionGeometry',
	OrganizationFoundationCommandPayload & {
		readonly regionId: DomainId;
		readonly geometry: RegionGeometry;
		readonly acknowledgedRegionBoundaryChange: true;
	}
>;

export interface DeleteRegionCommandInput extends OrganizationFoundationCommandInput {
	readonly regionId: DomainId;
	readonly acknowledgedRegionDelete?: boolean;
}

export type DeleteRegionCommand = FoundationDomainCommand<
	'foundation.deleteRegion',
	OrganizationFoundationCommandPayload & {
		readonly regionId: DomainId;
		readonly acknowledgedRegionDelete: true;
	}
>;

export function createRegionFolderCommand(
	input: CreateRegionFolderCommandInput,
): CreateRegionFolderCommand {
	const issues = createIssues();
	validateOrganizationBase(input, issues);
	requireUuid(input.regionFolderId, 'regionFolderId', issues);
	const name = normalizeRequiredText(input.name, 'name', issues, 200);
	throwIfIssues('Create region folder command is invalid.', issues);
	return {
		type: 'foundation.createRegionFolder',
		payload: {
			...organizationPayload(input),
			regionFolderId: normalizeRequiredDomainId(input.regionFolderId),
			name,
			description: normalizeNullableText(input.description, 'description', issues, 2_000),
		},
	};
}

export function updateRegionFolderCommand(
	input: UpdateRegionFolderCommandInput,
): UpdateRegionFolderCommand {
	return updateFieldsCommand({
		type: 'foundation.updateRegionFolder',
		input,
		idKey: 'regionFolderId',
		fields: REGION_FOLDER_UPDATE_FIELDS,
		changeNoun: 'region folder',
		message: 'Update region folder command is invalid.',
	});
}

export function deleteRegionFolderCommand(
	input: DeleteRegionFolderCommandInput,
): DeleteRegionFolderCommand {
	const issues = validateOrganizationIdCommand(input, 'regionFolderId');
	throwIfIssues('Delete region folder command is invalid.', issues);
	return {
		type: 'foundation.deleteRegionFolder',
		payload: {
			...organizationPayload(input),
			regionFolderId: normalizeRequiredDomainId(input.regionFolderId),
			acknowledgedRegionDetach: input.acknowledgedRegionDetach ?? false,
		},
	};
}

export function createRegionCommand(input: CreateRegionCommandInput): CreateRegionCommand {
	const issues = createIssues();
	validateOrganizationBase(input, issues);
	requireUuid(input.regionId, 'regionId', issues);
	const regionFolderId = normalizeOptionalUuid(input.regionFolderId, 'regionFolderId', issues);
	const name = normalizeRequiredText(input.name, 'name', issues, 200);
	const metadata = normalizeJsonObject(input.metadata, 'metadata', issues);
	const geometry = validateRegionGeometry(input.geometry, 'geometry', issues);
	throwIfIssues('Create region command is invalid.', issues);
	return {
		type: 'foundation.createRegion',
		payload: {
			...organizationPayload(input),
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
	return updateFieldsCommand({
		type: 'foundation.updateRegionDetails',
		input,
		idKey: 'regionId',
		fields: REGION_UPDATE_FIELDS,
		changeNoun: 'region',
		emptyChangeMessage: 'At least one region detail must change.',
		message: 'Update region details command is invalid.',
	});
}

export function moveRegionToFolderCommand(
	input: MoveRegionToFolderCommandInput,
): MoveRegionToFolderCommand {
	const issues = validateOrganizationIdCommand(input, 'regionId');
	const regionFolderId = normalizeOptionalUuid(input.regionFolderId, 'regionFolderId', issues);
	throwIfIssues('Move region to folder command is invalid.', issues);
	return {
		type: 'foundation.moveRegionToFolder',
		payload: {
			...organizationPayload(input),
			regionId: normalizeRequiredDomainId(input.regionId),
			regionFolderId,
		},
	};
}

export function updateRegionGeometryCommand(
	input: UpdateRegionGeometryCommandInput,
): UpdateRegionGeometryCommand {
	const issues = validateOrganizationIdCommand(input, 'regionId');
	const geometry = validateRegionGeometry(input.geometry, 'geometry', issues);
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
			...organizationPayload(input),
			regionId: normalizeRequiredDomainId(input.regionId),
			geometry,
			acknowledgedRegionBoundaryChange: true,
		},
	};
}

export function deleteRegionCommand(input: DeleteRegionCommandInput): DeleteRegionCommand {
	const issues = validateOrganizationIdCommand(input, 'regionId');
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
			...organizationPayload(input),
			regionId: normalizeRequiredDomainId(input.regionId),
			acknowledgedRegionDelete: true,
		},
	};
}
