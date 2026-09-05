import {
	createNamedReferenceCommand,
	namedReferenceIdCommand,
	updateNamedReferenceCommand,
} from '../named-reference-commands.js';
import type { DomainId, JsonObject } from '../shared.js';
import type {
	FoundationDomainCommand,
	OrganizationFoundationCommandInput,
	OrganizationFoundationCommandPayload,
} from './shared.js';

export interface CreateCollectionMethodCommandInputBase extends OrganizationFoundationCommandInput {
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
	OrganizationFoundationCommandPayload & {
		readonly collectionMethodId: DomainId;
		readonly name: string;
		readonly description: string | null;
		readonly customSchema: JsonObject | null;
		readonly actionThreshold: number | null;
	}
>;

export interface UpdateCollectionMethodCommandInput extends OrganizationFoundationCommandInput {
	readonly collectionMethodId: DomainId;
	readonly name?: string;
	readonly description?: string | null;
	readonly customSchema?: unknown | null;
	readonly actionThreshold?: number | null;
	readonly acknowledgedHistoricalLabelChange?: boolean;
}

export type UpdateCollectionMethodCommand = FoundationDomainCommand<
	'foundation.updateCollectionMethod',
	OrganizationFoundationCommandPayload & {
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

export interface CollectionMethodIdCommandInput extends OrganizationFoundationCommandInput {
	readonly collectionMethodId: DomainId;
}

export type DeactivateCollectionMethodCommand = FoundationDomainCommand<
	'foundation.deactivateCollectionMethod',
	OrganizationFoundationCommandPayload & { readonly collectionMethodId: DomainId }
>;

export type ReactivateCollectionMethodCommand = FoundationDomainCommand<
	'foundation.reactivateCollectionMethod',
	OrganizationFoundationCommandPayload & { readonly collectionMethodId: DomainId }
>;

export type DeleteCollectionMethodCommand = FoundationDomainCommand<
	'foundation.deleteCollectionMethod',
	OrganizationFoundationCommandPayload & { readonly collectionMethodId: DomainId }
>;

export interface CreateCollectionLureCommandInput extends OrganizationFoundationCommandInput {
	readonly collectionLureId: DomainId;
	readonly name: string;
	readonly description?: string | null;
}

export type CreateCollectionLureCommand = FoundationDomainCommand<
	'foundation.createCollectionLure',
	OrganizationFoundationCommandPayload & {
		readonly collectionLureId: DomainId;
		readonly name: string;
		readonly description: string | null;
	}
>;

export interface UpdateCollectionLureCommandInput extends OrganizationFoundationCommandInput {
	readonly collectionLureId: DomainId;
	readonly name?: string;
	readonly description?: string | null;
	readonly acknowledgedHistoricalLabelChange?: boolean;
}

export type UpdateCollectionLureCommand = FoundationDomainCommand<
	'foundation.updateCollectionLure',
	OrganizationFoundationCommandPayload & {
		readonly collectionLureId: DomainId;
		readonly changes: Readonly<{
			readonly name?: string;
			readonly description?: string | null;
		}>;
		readonly acknowledgedHistoricalLabelChange: boolean;
	}
>;

export interface CollectionLureIdCommandInput extends OrganizationFoundationCommandInput {
	readonly collectionLureId: DomainId;
}

export type DeactivateCollectionLureCommand = FoundationDomainCommand<
	'foundation.deactivateCollectionLure',
	OrganizationFoundationCommandPayload & { readonly collectionLureId: DomainId }
>;

export type ReactivateCollectionLureCommand = FoundationDomainCommand<
	'foundation.reactivateCollectionLure',
	OrganizationFoundationCommandPayload & { readonly collectionLureId: DomainId }
>;

export type DeleteCollectionLureCommand = FoundationDomainCommand<
	'foundation.deleteCollectionLure',
	OrganizationFoundationCommandPayload & { readonly collectionLureId: DomainId }
>;

export interface CreateHabitatTypeCommandInput extends OrganizationFoundationCommandInput {
	readonly habitatTypeId: DomainId;
	readonly name: string;
	readonly description?: string | null;
	readonly customSchema?: unknown | null;
}

export type CreateHabitatTypeCommand = FoundationDomainCommand<
	'foundation.createHabitatType',
	OrganizationFoundationCommandPayload & {
		readonly habitatTypeId: DomainId;
		readonly name: string;
		readonly description: string | null;
		readonly customSchema: JsonObject | null;
	}
>;

export interface UpdateHabitatTypeCommandInput extends OrganizationFoundationCommandInput {
	readonly habitatTypeId: DomainId;
	readonly name?: string;
	readonly description?: string | null;
	readonly customSchema?: unknown | null;
	readonly acknowledgedHistoricalLabelChange?: boolean;
}

export type UpdateHabitatTypeCommand = FoundationDomainCommand<
	'foundation.updateHabitatType',
	OrganizationFoundationCommandPayload & {
		readonly habitatTypeId: DomainId;
		readonly changes: Readonly<{
			readonly name?: string;
			readonly description?: string | null;
			readonly customSchema?: JsonObject | null;
		}>;
		readonly acknowledgedHistoricalLabelChange: boolean;
	}
>;

export interface HabitatTypeIdCommandInput extends OrganizationFoundationCommandInput {
	readonly habitatTypeId: DomainId;
}

export type DeactivateHabitatTypeCommand = FoundationDomainCommand<
	'foundation.deactivateHabitatType',
	OrganizationFoundationCommandPayload & { readonly habitatTypeId: DomainId }
>;

export type ReactivateHabitatTypeCommand = FoundationDomainCommand<
	'foundation.reactivateHabitatType',
	OrganizationFoundationCommandPayload & { readonly habitatTypeId: DomainId }
>;

export type DeleteHabitatTypeCommand = FoundationDomainCommand<
	'foundation.deleteHabitatType',
	OrganizationFoundationCommandPayload & { readonly habitatTypeId: DomainId }
>;

export function createCollectionMethodCommand(
	input: CreateCollectionMethodCommandInput,
): CreateCollectionMethodCommand {
	return createNamedReferenceCommand({
		type: 'foundation.createCollectionMethod',
		input,
		idKey: 'collectionMethodId',
		fields: { description: true, customSchema: true, actionThreshold: true },
		message: 'Create collection method command is invalid.',
	});
}

export function updateCollectionMethodCommand(
	input: UpdateCollectionMethodCommandInput,
): UpdateCollectionMethodCommand {
	return updateNamedReferenceCommand({
		type: 'foundation.updateCollectionMethod',
		input,
		idKey: 'collectionMethodId',
		fields: { description: true, customSchema: true, actionThreshold: true },
		changeNoun: 'collection method',
		message: 'Update collection method command is invalid.',
	});
}

export function deactivateCollectionMethodCommand(
	input: CollectionMethodIdCommandInput,
): DeactivateCollectionMethodCommand {
	return namedReferenceIdCommand({
		type: 'foundation.deactivateCollectionMethod',
		input,
		idKey: 'collectionMethodId',
		message: 'Deactivate collection method command is invalid.',
	});
}

export function reactivateCollectionMethodCommand(
	input: CollectionMethodIdCommandInput,
): ReactivateCollectionMethodCommand {
	return namedReferenceIdCommand({
		type: 'foundation.reactivateCollectionMethod',
		input,
		idKey: 'collectionMethodId',
		message: 'Reactivate collection method command is invalid.',
	});
}

export function deleteCollectionMethodCommand(
	input: CollectionMethodIdCommandInput,
): DeleteCollectionMethodCommand {
	return namedReferenceIdCommand({
		type: 'foundation.deleteCollectionMethod',
		input,
		idKey: 'collectionMethodId',
		message: 'Delete collection method command is invalid.',
	});
}

export function createCollectionLureCommand(
	input: CreateCollectionLureCommandInput,
): CreateCollectionLureCommand {
	return createNamedReferenceCommand({
		type: 'foundation.createCollectionLure',
		input,
		idKey: 'collectionLureId',
		fields: { description: true },
		message: 'Create collection lure command is invalid.',
	});
}

export function updateCollectionLureCommand(
	input: UpdateCollectionLureCommandInput,
): UpdateCollectionLureCommand {
	return updateNamedReferenceCommand({
		type: 'foundation.updateCollectionLure',
		input,
		idKey: 'collectionLureId',
		fields: { description: true },
		changeNoun: 'collection lure',
		message: 'Update collection lure command is invalid.',
	});
}

export function deactivateCollectionLureCommand(
	input: CollectionLureIdCommandInput,
): DeactivateCollectionLureCommand {
	return namedReferenceIdCommand({
		type: 'foundation.deactivateCollectionLure',
		input,
		idKey: 'collectionLureId',
		message: 'Deactivate collection lure command is invalid.',
	});
}

export function reactivateCollectionLureCommand(
	input: CollectionLureIdCommandInput,
): ReactivateCollectionLureCommand {
	return namedReferenceIdCommand({
		type: 'foundation.reactivateCollectionLure',
		input,
		idKey: 'collectionLureId',
		message: 'Reactivate collection lure command is invalid.',
	});
}

export function deleteCollectionLureCommand(
	input: CollectionLureIdCommandInput,
): DeleteCollectionLureCommand {
	return namedReferenceIdCommand({
		type: 'foundation.deleteCollectionLure',
		input,
		idKey: 'collectionLureId',
		message: 'Delete collection lure command is invalid.',
	});
}

export function createHabitatTypeCommand(
	input: CreateHabitatTypeCommandInput,
): CreateHabitatTypeCommand {
	return createNamedReferenceCommand({
		type: 'foundation.createHabitatType',
		input,
		idKey: 'habitatTypeId',
		fields: { description: true, customSchema: true },
		message: 'Create habitat type command is invalid.',
	});
}

export function updateHabitatTypeCommand(
	input: UpdateHabitatTypeCommandInput,
): UpdateHabitatTypeCommand {
	return updateNamedReferenceCommand({
		type: 'foundation.updateHabitatType',
		input,
		idKey: 'habitatTypeId',
		fields: { description: true, customSchema: true },
		changeNoun: 'habitat type',
		message: 'Update habitat type command is invalid.',
	});
}

export function deactivateHabitatTypeCommand(
	input: HabitatTypeIdCommandInput,
): DeactivateHabitatTypeCommand {
	return namedReferenceIdCommand({
		type: 'foundation.deactivateHabitatType',
		input,
		idKey: 'habitatTypeId',
		message: 'Deactivate habitat type command is invalid.',
	});
}

export function reactivateHabitatTypeCommand(
	input: HabitatTypeIdCommandInput,
): ReactivateHabitatTypeCommand {
	return namedReferenceIdCommand({
		type: 'foundation.reactivateHabitatType',
		input,
		idKey: 'habitatTypeId',
		message: 'Reactivate habitat type command is invalid.',
	});
}

export function deleteHabitatTypeCommand(
	input: HabitatTypeIdCommandInput,
): DeleteHabitatTypeCommand {
	return namedReferenceIdCommand({
		type: 'foundation.deleteHabitatType',
		input,
		idKey: 'habitatTypeId',
		message: 'Delete habitat type command is invalid.',
	});
}
