import {
	createNamedReferenceCommand,
	updateNamedReferenceCommand,
} from '../named-reference-commands.js';
import type { DomainId, JsonObject } from '../shared.js';
import type {
	ControlCommandInput,
	ControlCommandPayload,
	ControlOperationsDomainCommand,
} from './core.js';
import { idCommand } from './core.js';
export type ControlMethodKind =
	| 'applicationMethod'
	| 'sourceReductionMethod'
	| 'outreachMethod'
	| 'biocontrolMethod';

export interface MethodCommandInput extends ControlCommandInput {
	readonly name: string;
	readonly customSchema?: unknown | null;
}

export interface MethodCommandPayload extends ControlCommandPayload {
	readonly name: string;
	readonly customSchema: JsonObject | null;
}

export interface CreateApplicationMethodCommandInput extends MethodCommandInput {
	readonly applicationMethodId: DomainId;
}

export type CreateApplicationMethodCommand = ControlOperationsDomainCommand<
	'controlOperations.createApplicationMethod',
	MethodCommandPayload & { readonly applicationMethodId: DomainId }
>;

export interface UpdateApplicationMethodCommandInput extends ControlCommandInput {
	readonly applicationMethodId: DomainId;
	readonly name?: string;
	readonly customSchema?: unknown | null;
	readonly acknowledgedHistoricalLabelChange?: boolean;
}

export type UpdateApplicationMethodCommand = ControlOperationsDomainCommand<
	'controlOperations.updateApplicationMethod',
	ControlCommandPayload & {
		readonly applicationMethodId: DomainId;
		readonly changes: Readonly<{
			readonly name?: string;
			readonly customSchema?: JsonObject | null;
		}>;
		readonly acknowledgedHistoricalLabelChange: boolean;
	}
>;

export interface ApplicationMethodIdCommandInput extends ControlCommandInput {
	readonly applicationMethodId: DomainId;
}

export type DeactivateApplicationMethodCommand = ControlOperationsDomainCommand<
	'controlOperations.deactivateApplicationMethod',
	ControlCommandPayload & { readonly applicationMethodId: DomainId }
>;

export type ReactivateApplicationMethodCommand = ControlOperationsDomainCommand<
	'controlOperations.reactivateApplicationMethod',
	ControlCommandPayload & { readonly applicationMethodId: DomainId }
>;

export type DeleteApplicationMethodCommand = ControlOperationsDomainCommand<
	'controlOperations.deleteApplicationMethod',
	ControlCommandPayload & { readonly applicationMethodId: DomainId }
>;

export interface CreateSourceReductionMethodCommandInput extends MethodCommandInput {
	readonly sourceReductionMethodId: DomainId;
}

export type CreateSourceReductionMethodCommand = ControlOperationsDomainCommand<
	'controlOperations.createSourceReductionMethod',
	MethodCommandPayload & { readonly sourceReductionMethodId: DomainId }
>;

export interface UpdateSourceReductionMethodCommandInput extends ControlCommandInput {
	readonly sourceReductionMethodId: DomainId;
	readonly name?: string;
	readonly customSchema?: unknown | null;
	readonly acknowledgedHistoricalLabelChange?: boolean;
}

export type UpdateSourceReductionMethodCommand = ControlOperationsDomainCommand<
	'controlOperations.updateSourceReductionMethod',
	ControlCommandPayload & {
		readonly sourceReductionMethodId: DomainId;
		readonly changes: Readonly<{
			readonly name?: string;
			readonly customSchema?: JsonObject | null;
		}>;
		readonly acknowledgedHistoricalLabelChange: boolean;
	}
>;

export interface SourceReductionMethodIdCommandInput extends ControlCommandInput {
	readonly sourceReductionMethodId: DomainId;
}

export type DeactivateSourceReductionMethodCommand = ControlOperationsDomainCommand<
	'controlOperations.deactivateSourceReductionMethod',
	ControlCommandPayload & { readonly sourceReductionMethodId: DomainId }
>;

export type ReactivateSourceReductionMethodCommand = ControlOperationsDomainCommand<
	'controlOperations.reactivateSourceReductionMethod',
	ControlCommandPayload & { readonly sourceReductionMethodId: DomainId }
>;

export type DeleteSourceReductionMethodCommand = ControlOperationsDomainCommand<
	'controlOperations.deleteSourceReductionMethod',
	ControlCommandPayload & { readonly sourceReductionMethodId: DomainId }
>;

export interface CreateOutreachMethodCommandInput extends MethodCommandInput {
	readonly outreachMethodId: DomainId;
}

export type CreateOutreachMethodCommand = ControlOperationsDomainCommand<
	'controlOperations.createOutreachMethod',
	MethodCommandPayload & { readonly outreachMethodId: DomainId }
>;

export interface UpdateOutreachMethodCommandInput extends ControlCommandInput {
	readonly outreachMethodId: DomainId;
	readonly name?: string;
	readonly customSchema?: unknown | null;
	readonly acknowledgedHistoricalLabelChange?: boolean;
}

export type UpdateOutreachMethodCommand = ControlOperationsDomainCommand<
	'controlOperations.updateOutreachMethod',
	ControlCommandPayload & {
		readonly outreachMethodId: DomainId;
		readonly changes: Readonly<{
			readonly name?: string;
			readonly customSchema?: JsonObject | null;
		}>;
		readonly acknowledgedHistoricalLabelChange: boolean;
	}
>;

export interface OutreachMethodIdCommandInput extends ControlCommandInput {
	readonly outreachMethodId: DomainId;
}

export type DeactivateOutreachMethodCommand = ControlOperationsDomainCommand<
	'controlOperations.deactivateOutreachMethod',
	ControlCommandPayload & { readonly outreachMethodId: DomainId }
>;

export type ReactivateOutreachMethodCommand = ControlOperationsDomainCommand<
	'controlOperations.reactivateOutreachMethod',
	ControlCommandPayload & { readonly outreachMethodId: DomainId }
>;

export type DeleteOutreachMethodCommand = ControlOperationsDomainCommand<
	'controlOperations.deleteOutreachMethod',
	ControlCommandPayload & { readonly outreachMethodId: DomainId }
>;

export interface CreateBiocontrolMethodCommandInput extends MethodCommandInput {
	readonly biocontrolMethodId: DomainId;
}

export type CreateBiocontrolMethodCommand = ControlOperationsDomainCommand<
	'controlOperations.createBiocontrolMethod',
	MethodCommandPayload & { readonly biocontrolMethodId: DomainId }
>;

export interface UpdateBiocontrolMethodCommandInput extends ControlCommandInput {
	readonly biocontrolMethodId: DomainId;
	readonly name?: string;
	readonly customSchema?: unknown | null;
	readonly acknowledgedHistoricalLabelChange?: boolean;
}

export type UpdateBiocontrolMethodCommand = ControlOperationsDomainCommand<
	'controlOperations.updateBiocontrolMethod',
	ControlCommandPayload & {
		readonly biocontrolMethodId: DomainId;
		readonly changes: Readonly<{
			readonly name?: string;
			readonly customSchema?: JsonObject | null;
		}>;
		readonly acknowledgedHistoricalLabelChange: boolean;
	}
>;

export interface BiocontrolMethodIdCommandInput extends ControlCommandInput {
	readonly biocontrolMethodId: DomainId;
}

export type DeactivateBiocontrolMethodCommand = ControlOperationsDomainCommand<
	'controlOperations.deactivateBiocontrolMethod',
	ControlCommandPayload & { readonly biocontrolMethodId: DomainId }
>;

export type ReactivateBiocontrolMethodCommand = ControlOperationsDomainCommand<
	'controlOperations.reactivateBiocontrolMethod',
	ControlCommandPayload & { readonly biocontrolMethodId: DomainId }
>;

export type DeleteBiocontrolMethodCommand = ControlOperationsDomainCommand<
	'controlOperations.deleteBiocontrolMethod',
	ControlCommandPayload & { readonly biocontrolMethodId: DomainId }
>;

export function createApplicationMethodCommand(
	input: CreateApplicationMethodCommandInput,
): CreateApplicationMethodCommand {
	return createNamedReferenceCommand({
		type: 'controlOperations.createApplicationMethod',
		input,
		idKey: 'applicationMethodId',
		fields: { customSchema: true },
	});
}

export function updateApplicationMethodCommand(
	input: UpdateApplicationMethodCommandInput,
): UpdateApplicationMethodCommand {
	return updateNamedReferenceCommand({
		type: 'controlOperations.updateApplicationMethod',
		input,
		idKey: 'applicationMethodId',
		fields: { customSchema: true },
		changeNoun: 'method',
	});
}

export function deactivateApplicationMethodCommand(
	input: ApplicationMethodIdCommandInput,
): DeactivateApplicationMethodCommand {
	return idCommand('controlOperations.deactivateApplicationMethod', input, 'applicationMethodId');
}

export function reactivateApplicationMethodCommand(
	input: ApplicationMethodIdCommandInput,
): ReactivateApplicationMethodCommand {
	return idCommand('controlOperations.reactivateApplicationMethod', input, 'applicationMethodId');
}

export function deleteApplicationMethodCommand(
	input: ApplicationMethodIdCommandInput,
): DeleteApplicationMethodCommand {
	return idCommand('controlOperations.deleteApplicationMethod', input, 'applicationMethodId');
}

export function createSourceReductionMethodCommand(
	input: CreateSourceReductionMethodCommandInput,
): CreateSourceReductionMethodCommand {
	return createNamedReferenceCommand({
		type: 'controlOperations.createSourceReductionMethod',
		input,
		idKey: 'sourceReductionMethodId',
		fields: { customSchema: true },
	});
}

export function updateSourceReductionMethodCommand(
	input: UpdateSourceReductionMethodCommandInput,
): UpdateSourceReductionMethodCommand {
	return updateNamedReferenceCommand({
		type: 'controlOperations.updateSourceReductionMethod',
		input,
		idKey: 'sourceReductionMethodId',
		fields: { customSchema: true },
		changeNoun: 'method',
	});
}

export function deactivateSourceReductionMethodCommand(
	input: SourceReductionMethodIdCommandInput,
): DeactivateSourceReductionMethodCommand {
	return idCommand(
		'controlOperations.deactivateSourceReductionMethod',
		input,
		'sourceReductionMethodId',
	);
}

export function reactivateSourceReductionMethodCommand(
	input: SourceReductionMethodIdCommandInput,
): ReactivateSourceReductionMethodCommand {
	return idCommand(
		'controlOperations.reactivateSourceReductionMethod',
		input,
		'sourceReductionMethodId',
	);
}

export function deleteSourceReductionMethodCommand(
	input: SourceReductionMethodIdCommandInput,
): DeleteSourceReductionMethodCommand {
	return idCommand(
		'controlOperations.deleteSourceReductionMethod',
		input,
		'sourceReductionMethodId',
	);
}

export function createOutreachMethodCommand(
	input: CreateOutreachMethodCommandInput,
): CreateOutreachMethodCommand {
	return createNamedReferenceCommand({
		type: 'controlOperations.createOutreachMethod',
		input,
		idKey: 'outreachMethodId',
		fields: { customSchema: true },
	});
}

export function updateOutreachMethodCommand(
	input: UpdateOutreachMethodCommandInput,
): UpdateOutreachMethodCommand {
	return updateNamedReferenceCommand({
		type: 'controlOperations.updateOutreachMethod',
		input,
		idKey: 'outreachMethodId',
		fields: { customSchema: true },
		changeNoun: 'method',
	});
}

export function deactivateOutreachMethodCommand(
	input: OutreachMethodIdCommandInput,
): DeactivateOutreachMethodCommand {
	return idCommand('controlOperations.deactivateOutreachMethod', input, 'outreachMethodId');
}

export function reactivateOutreachMethodCommand(
	input: OutreachMethodIdCommandInput,
): ReactivateOutreachMethodCommand {
	return idCommand('controlOperations.reactivateOutreachMethod', input, 'outreachMethodId');
}

export function deleteOutreachMethodCommand(
	input: OutreachMethodIdCommandInput,
): DeleteOutreachMethodCommand {
	return idCommand('controlOperations.deleteOutreachMethod', input, 'outreachMethodId');
}

export function createBiocontrolMethodCommand(
	input: CreateBiocontrolMethodCommandInput,
): CreateBiocontrolMethodCommand {
	return createNamedReferenceCommand({
		type: 'controlOperations.createBiocontrolMethod',
		input,
		idKey: 'biocontrolMethodId',
		fields: { customSchema: true },
	});
}

export function updateBiocontrolMethodCommand(
	input: UpdateBiocontrolMethodCommandInput,
): UpdateBiocontrolMethodCommand {
	return updateNamedReferenceCommand({
		type: 'controlOperations.updateBiocontrolMethod',
		input,
		idKey: 'biocontrolMethodId',
		fields: { customSchema: true },
		changeNoun: 'method',
	});
}

export function deactivateBiocontrolMethodCommand(
	input: BiocontrolMethodIdCommandInput,
): DeactivateBiocontrolMethodCommand {
	return idCommand('controlOperations.deactivateBiocontrolMethod', input, 'biocontrolMethodId');
}

export function reactivateBiocontrolMethodCommand(
	input: BiocontrolMethodIdCommandInput,
): ReactivateBiocontrolMethodCommand {
	return idCommand('controlOperations.reactivateBiocontrolMethod', input, 'biocontrolMethodId');
}

export function deleteBiocontrolMethodCommand(
	input: BiocontrolMethodIdCommandInput,
): DeleteBiocontrolMethodCommand {
	return idCommand('controlOperations.deleteBiocontrolMethod', input, 'biocontrolMethodId');
}
