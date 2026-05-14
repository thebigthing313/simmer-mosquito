import {
	createIssues,
	actorDefaultProfileId as normalizeActorDefaultProfileId,
	nullableText as normalizeNullableText,
	optionalUuid as normalizeOptionalUuid,
	requiredId as normalizeRequiredId,
	requiredUuid as requireUuid,
	throwIfIssues,
} from '../command-validation.js';
import type {
	RequestedControlActionLocationSource,
	RequestedControlActionLocationSourceInput,
} from '../location-intent.js';
import {
	type ControlActionContext,
	type ControlType,
	validateControlActionContext,
} from '../performed-control-actions.js';
import type { DomainId } from '../shared.js';
import type {
	ControlCommandInput,
	ControlCommandPayload,
	ControlOperationsDomainCommand,
} from './core.js';
import {
	basePayload,
	CONTROL_TYPES,
	idCommand,
	locationContextChanges,
	normalizeOptionalTimestamp,
	normalizeStringUnion,
	validateBase,
	validateIdCommand,
	validateLocationContextPatchBase,
	validateRequestedControlActionLocationSourceInput,
} from './core.js';
export interface RequestControlActionCommandInput extends ControlCommandInput {
	readonly requestedControlActionId: DomainId;
	readonly controlType: ControlType;
	readonly locationSource: RequestedControlActionLocationSourceInput;
	readonly addressId?: DomainId | null;
	readonly context?: ControlActionContext;
	readonly recommendedMethodId?: DomainId | null;
	readonly summary?: string | null;
	readonly requestedByProfileId?: DomainId | null;
	readonly requestedAt?: Date | null;
}

export type RequestControlActionCommand = ControlOperationsDomainCommand<
	'controlOperations.requestControlAction',
	ControlCommandPayload & {
		readonly requestedControlActionId: DomainId;
		readonly controlType: ControlType;
		readonly locationSource: RequestedControlActionLocationSource;
		readonly addressId: DomainId | null;
		readonly context: ControlActionContext;
		readonly recommendedMethodId: DomainId | null;
		readonly summary: string | null;
		readonly requestedByProfileId: DomainId;
		readonly requestedAt: Date | null;
	}
>;

export interface UpdateRequestedControlActionDetailsCommandInput extends ControlCommandInput {
	readonly requestedControlActionId: DomainId;
	readonly controlType?: ControlType;
	readonly recommendedMethodId?: DomainId | null;
	readonly summary?: string | null;
	readonly requestedByProfileId?: DomainId | null;
	readonly requestedAt?: Date | null;
}

export type UpdateRequestedControlActionDetailsCommand = ControlOperationsDomainCommand<
	'controlOperations.updateRequestedControlActionDetails',
	ControlCommandPayload & {
		readonly requestedControlActionId: DomainId;
		readonly changes: Readonly<{
			readonly controlType?: ControlType;
			readonly recommendedMethodId?: DomainId | null;
			readonly summary?: string | null;
			readonly requestedByProfileId?: DomainId | null;
			readonly requestedAt?: Date | null;
		}>;
	}
>;

export interface UpdateRequestedControlActionLocationAndContextCommandInput
	extends ControlCommandInput {
	readonly requestedControlActionId: DomainId;
	readonly locationSource?: RequestedControlActionLocationSourceInput;
	readonly addressId?: DomainId | null;
	readonly context?: ControlActionContext;
}

export type UpdateRequestedControlActionLocationAndContextCommand = ControlOperationsDomainCommand<
	'controlOperations.updateRequestedControlActionLocationAndContext',
	ControlCommandPayload & {
		readonly requestedControlActionId: DomainId;
		readonly changes: Readonly<{
			readonly locationSource?: RequestedControlActionLocationSource;
			readonly addressId?: DomainId | null;
			readonly context?: ControlActionContext;
		}>;
	}
>;

export interface ResolveRequestedControlActionCommandInput extends ControlCommandInput {
	readonly requestedControlActionId: DomainId;
	readonly resolvedAt?: Date | null;
}

export type ResolveRequestedControlActionCommand = ControlOperationsDomainCommand<
	'controlOperations.resolveRequestedControlAction',
	ControlCommandPayload & {
		readonly requestedControlActionId: DomainId;
		readonly resolvedAt: Date | null;
	}
>;

export interface RequestedControlActionIdCommandInput extends ControlCommandInput {
	readonly requestedControlActionId: DomainId;
}

export type ReopenRequestedControlActionCommand = ControlOperationsDomainCommand<
	'controlOperations.reopenRequestedControlAction',
	ControlCommandPayload & { readonly requestedControlActionId: DomainId }
>;

export interface DeleteRequestedControlActionCommandInput
	extends RequestedControlActionIdCommandInput {
	readonly acknowledgedActionDetach?: boolean;
	readonly acknowledgedMissionDetach?: boolean;
}

export type DeleteRequestedControlActionCommand = ControlOperationsDomainCommand<
	'controlOperations.deleteRequestedControlAction',
	ControlCommandPayload & {
		readonly requestedControlActionId: DomainId;
		readonly acknowledgedActionDetach: boolean;
		readonly acknowledgedMissionDetach: boolean;
	}
>;

export function requestControlActionCommand(
	input: RequestControlActionCommandInput,
): RequestControlActionCommand {
	const issues = createIssues();
	validateBase(input, issues);
	requireUuid(input.requestedControlActionId, 'requestedControlActionId', issues);
	const locationSource = validateRequestedControlActionLocationSourceInput(input, issues);
	const controlType = normalizeStringUnion(input.controlType, CONTROL_TYPES, 'controlType', issues);
	const context = validateControlActionContext(
		input.context ?? { kind: 'none' },
		controlType,
		issues,
	);
	const requestedAt = normalizeOptionalTimestamp(input.requestedAt, 'requestedAt', issues, false);
	const addressId = normalizeOptionalUuid(input.addressId, 'addressId', issues);
	const recommendedMethodId = normalizeOptionalUuid(
		input.recommendedMethodId,
		'recommendedMethodId',
		issues,
	);
	const summary = normalizeNullableText(input.summary, 'summary', issues, 2_000);
	throwIfIssues('Request control action command is invalid.', issues);
	return {
		type: 'controlOperations.requestControlAction',
		payload: {
			...basePayload(input),
			requestedControlActionId: normalizeRequiredId(input.requestedControlActionId),
			controlType,
			locationSource,
			addressId,
			context,
			recommendedMethodId,
			summary,
			requestedByProfileId: normalizeActorDefaultProfileId(
				input.requestedByProfileId,
				input.actorProfileId,
			),
			requestedAt,
		},
	};
}

export function updateRequestedControlActionDetailsCommand(
	input: UpdateRequestedControlActionDetailsCommandInput,
): UpdateRequestedControlActionDetailsCommand {
	const issues = validateIdCommand(input, 'requestedControlActionId');
	const hasControlType = input.controlType !== undefined;
	const hasMethod = input.recommendedMethodId !== undefined;
	const hasSummary = input.summary !== undefined;
	const hasRequestedBy = input.requestedByProfileId !== undefined;
	const hasRequestedAt = input.requestedAt !== undefined;
	if (!hasControlType && !hasMethod && !hasSummary && !hasRequestedBy && !hasRequestedAt) {
		issues.push({ path: 'changes', message: 'At least one requested action detail must change.' });
	}
	const controlType = hasControlType
		? normalizeStringUnion(input.controlType, CONTROL_TYPES, 'controlType', issues)
		: undefined;
	const requestedAt = hasRequestedAt
		? normalizeOptionalTimestamp(input.requestedAt, 'requestedAt', issues, false)
		: undefined;
	const recommendedMethodId = hasMethod
		? normalizeOptionalUuid(input.recommendedMethodId, 'recommendedMethodId', issues)
		: undefined;
	const summary = hasSummary
		? normalizeNullableText(input.summary, 'summary', issues, 2_000)
		: undefined;
	const requestedByProfileId = hasRequestedBy
		? normalizeOptionalUuid(input.requestedByProfileId, 'requestedByProfileId', issues)
		: undefined;
	throwIfIssues('Update requested control action details command is invalid.', issues);
	return {
		type: 'controlOperations.updateRequestedControlActionDetails',
		payload: {
			...basePayload(input),
			requestedControlActionId: normalizeRequiredId(input.requestedControlActionId),
			changes: {
				...(controlType !== undefined ? { controlType } : {}),
				...(hasMethod ? { recommendedMethodId: recommendedMethodId ?? null } : {}),
				...(hasSummary ? { summary: summary ?? null } : {}),
				...(hasRequestedBy ? { requestedByProfileId: requestedByProfileId ?? null } : {}),
				...(hasRequestedAt ? { requestedAt: requestedAt ?? null } : {}),
			},
		},
	};
}

export function updateRequestedControlActionLocationAndContextCommand(
	input: UpdateRequestedControlActionLocationAndContextCommandInput,
): UpdateRequestedControlActionLocationAndContextCommand {
	const issues = validateLocationContextPatchBase(
		input,
		'requestedControlActionId',
		'requestedControlAction',
	);
	const context = input.context
		? validateControlActionContext(input.context, 'requestedAction', issues)
		: undefined;
	throwIfIssues('Update requested control action location and context command is invalid.', issues);
	return {
		type: 'controlOperations.updateRequestedControlActionLocationAndContext',
		payload: {
			...basePayload(input),
			requestedControlActionId: normalizeRequiredId(input.requestedControlActionId),
			changes: locationContextChanges(
				input,
				context,
				issues,
				'requestedControlAction',
			) as UpdateRequestedControlActionLocationAndContextCommand['payload']['changes'],
		},
	};
}

export function resolveRequestedControlActionCommand(
	input: ResolveRequestedControlActionCommandInput,
): ResolveRequestedControlActionCommand {
	const issues = validateIdCommand(input, 'requestedControlActionId');
	const resolvedAt = normalizeOptionalTimestamp(input.resolvedAt, 'resolvedAt', issues, false);
	throwIfIssues('Resolve requested control action command is invalid.', issues);
	return {
		type: 'controlOperations.resolveRequestedControlAction',
		payload: {
			...basePayload(input),
			requestedControlActionId: normalizeRequiredId(input.requestedControlActionId),
			resolvedAt,
		},
	};
}

export function reopenRequestedControlActionCommand(
	input: RequestedControlActionIdCommandInput,
): ReopenRequestedControlActionCommand {
	return idCommand(
		'controlOperations.reopenRequestedControlAction',
		input,
		'requestedControlActionId',
	);
}

export function deleteRequestedControlActionCommand(
	input: DeleteRequestedControlActionCommandInput,
): DeleteRequestedControlActionCommand {
	const issues = validateIdCommand(input, 'requestedControlActionId');
	throwIfIssues('Delete requested control action command is invalid.', issues);
	return {
		type: 'controlOperations.deleteRequestedControlAction',
		payload: {
			...basePayload(input),
			requestedControlActionId: normalizeRequiredId(input.requestedControlActionId),
			acknowledgedActionDetach: input.acknowledgedActionDetach ?? false,
			acknowledgedMissionDetach: input.acknowledgedMissionDetach ?? false,
		},
	};
}
