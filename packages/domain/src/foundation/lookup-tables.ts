import {
	createNamedReferenceCommand,
	namedReferenceIdCommand,
	updateNamedReferenceCommand,
} from '../named-reference-commands.js';
import type { DomainId, JsonObject } from '../shared.js';
import type {
	AgencyFoundationCommandInput,
	AgencyFoundationCommandPayload,
	FoundationDomainCommand,
} from './shared.js';

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
