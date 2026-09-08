import {
	basePayload,
	createIssues,
	normalizeOptionalTimestamp,
	optionalUuid as normalizeOptionalUuid,
	requiredId as normalizeRequiredId,
	requiredText as normalizeRequiredText,
	normalizeStringUnion,
	requiredUuid as requireUuid,
	throwIfIssues,
	validateBase,
	validateIdCommand,
	validateLocalDate,
} from '../command-validation.js';
import type { DomainId, LocalDateString } from '../shared.js';
import {
	localDateField,
	nullableReferenceIdField,
	requiredTextField,
	stringUnionField,
	type UpdateFieldSet,
	type UpdateFieldsChanges,
	type UpdateFieldsInput,
	updateFieldsCommand,
} from '../update-command-fields.js';
import type {
	ContactReference,
	ContactReferenceInput,
	PublicEngagementCommandInput,
	PublicEngagementCommandPayload,
	PublicEngagementDomainCommand,
	RequestIntakeType,
	ServiceRequestLocation,
	ServiceRequestLocationInput,
} from './core.js';
import {
	REQUEST_INTAKE_TYPES,
	validateContactReference,
	validateServiceRequestLocation,
} from './core.js';
export interface CreateServiceRequestCommandInput extends PublicEngagementCommandInput {
	readonly serviceRequestId: DomainId;
	readonly contact: ContactReferenceInput;
	readonly location: ServiceRequestLocationInput;
	readonly intakeType: RequestIntakeType;
	readonly requestDate: LocalDateString;
	readonly details: string;
	readonly receivedByProfileId?: DomainId | null;
}

export type CreateServiceRequestCommand = PublicEngagementDomainCommand<
	'publicEngagement.createServiceRequest',
	PublicEngagementCommandPayload & {
		readonly serviceRequestId: DomainId;
		readonly contact: ContactReference;
		readonly location: ServiceRequestLocation;
		readonly intakeType: RequestIntakeType;
		readonly requestDate: LocalDateString;
		readonly details: string;
		readonly receivedByProfileId: DomainId | null;
	}
>;

export const SERVICE_REQUEST_UPDATE_FIELDS = {
	requestDate: localDateField,
	intakeType: stringUnionField(REQUEST_INTAKE_TYPES),
	receivedByProfileId: nullableReferenceIdField,
	details: requiredTextField(10_000),
} satisfies UpdateFieldSet;

export type UpdateServiceRequestDetailsCommandInput = PublicEngagementCommandInput &
	UpdateFieldsInput<typeof SERVICE_REQUEST_UPDATE_FIELDS> & {
		readonly serviceRequestId: DomainId;
		readonly acknowledgedClosedRequestChange?: boolean;
	};

export type UpdateServiceRequestDetailsCommand = PublicEngagementDomainCommand<
	'publicEngagement.updateServiceRequestDetails',
	PublicEngagementCommandPayload & {
		readonly serviceRequestId: DomainId;
		readonly changes: UpdateFieldsChanges<typeof SERVICE_REQUEST_UPDATE_FIELDS>;
		readonly acknowledgedClosedRequestChange: boolean;
	}
>;

export interface UpdateServiceRequestContactCommandInput extends PublicEngagementCommandInput {
	readonly serviceRequestId: DomainId;
	readonly contact: ContactReferenceInput;
	readonly acknowledgedHistoricalContactChange?: boolean;
}

export type UpdateServiceRequestContactCommand = PublicEngagementDomainCommand<
	'publicEngagement.updateServiceRequestContact',
	PublicEngagementCommandPayload & {
		readonly serviceRequestId: DomainId;
		readonly contact: ContactReference;
		readonly acknowledgedHistoricalContactChange: boolean;
	}
>;

export interface UpdateServiceRequestLocationCommandInput extends PublicEngagementCommandInput {
	readonly serviceRequestId: DomainId;
	readonly location: ServiceRequestLocationInput;
	readonly acknowledgedHistoricalLocationChange?: boolean;
}

export type UpdateServiceRequestLocationCommand = PublicEngagementDomainCommand<
	'publicEngagement.updateServiceRequestLocation',
	PublicEngagementCommandPayload & {
		readonly serviceRequestId: DomainId;
		readonly location: ServiceRequestLocation;
		readonly acknowledgedHistoricalLocationChange: boolean;
	}
>;

export interface CloseServiceRequestCommandInput extends PublicEngagementCommandInput {
	readonly serviceRequestId: DomainId;
	readonly resolutionCommentId: DomainId;
	readonly resolutionSummary: string;
	readonly closedAt?: Date | null;
}

export type CloseServiceRequestCommand = PublicEngagementDomainCommand<
	'publicEngagement.closeServiceRequest',
	PublicEngagementCommandPayload & {
		readonly serviceRequestId: DomainId;
		readonly resolutionCommentId: DomainId;
		readonly resolutionSummary: string;
		readonly closedAt: Date | null;
	}
>;

export interface ReopenServiceRequestCommandInput extends PublicEngagementCommandInput {
	readonly serviceRequestId: DomainId;
	readonly reopenCommentId: DomainId;
	readonly reopenReason: string;
	readonly reopenedAt?: Date | null;
}

export type ReopenServiceRequestCommand = PublicEngagementDomainCommand<
	'publicEngagement.reopenServiceRequest',
	PublicEngagementCommandPayload & {
		readonly serviceRequestId: DomainId;
		readonly reopenCommentId: DomainId;
		readonly reopenReason: string;
		readonly reopenedAt: Date | null;
	}
>;

export interface DeleteServiceRequestCommandInput extends PublicEngagementCommandInput {
	readonly serviceRequestId: DomainId;
	readonly acknowledgedClosedRequestDeletion?: boolean;
	readonly acknowledgedAssignmentItemDeletion?: boolean;
}

export type DeleteServiceRequestCommand = PublicEngagementDomainCommand<
	'publicEngagement.deleteServiceRequest',
	PublicEngagementCommandPayload & {
		readonly serviceRequestId: DomainId;
		readonly acknowledgedClosedRequestDeletion: boolean;
		readonly acknowledgedAssignmentItemDeletion: boolean;
	}
>;

export function createServiceRequestCommand(
	input: CreateServiceRequestCommandInput,
): CreateServiceRequestCommand {
	const issues = createIssues();
	validateBase(input, issues);
	requireUuid(input.serviceRequestId, 'serviceRequestId', issues);
	const contact = validateContactReference(input.contact, 'contact', issues);
	const location = validateServiceRequestLocation(input.location, 'location', issues);
	const intakeType = normalizeStringUnion(
		input.intakeType,
		REQUEST_INTAKE_TYPES,
		'intakeType',
		issues,
	);
	validateLocalDate(input.requestDate, 'requestDate', issues);
	const details = normalizeRequiredText(input.details, 'details', issues, 10_000);
	const receivedByProfileId =
		input.receivedByProfileId === undefined
			? normalizeRequiredId(input.actorProfileId)
			: normalizeOptionalUuid(input.receivedByProfileId, 'receivedByProfileId', issues);
	throwIfIssues('Create service request command is invalid.', issues);
	return {
		type: 'publicEngagement.createServiceRequest',
		payload: {
			...basePayload(input),
			serviceRequestId: normalizeRequiredId(input.serviceRequestId),
			contact,
			location,
			intakeType,
			requestDate: input.requestDate,
			details,
			receivedByProfileId,
		},
	};
}

export function updateServiceRequestDetailsCommand(
	input: UpdateServiceRequestDetailsCommandInput,
): UpdateServiceRequestDetailsCommand {
	const command = updateFieldsCommand({
		type: 'publicEngagement.updateServiceRequestDetails',
		input,
		idKey: 'serviceRequestId',
		fields: SERVICE_REQUEST_UPDATE_FIELDS,
		changeNoun: 'service request',
		emptyChangeMessage: 'At least one service request detail must change.',
		message: 'Update service request details command is invalid.',
	});
	return {
		type: command.type,
		payload: {
			...command.payload,
			acknowledgedClosedRequestChange: input.acknowledgedClosedRequestChange ?? false,
		},
	};
}

export function updateServiceRequestContactCommand(
	input: UpdateServiceRequestContactCommandInput,
): UpdateServiceRequestContactCommand {
	const issues = validateIdCommand(input, 'serviceRequestId');
	const contact = validateContactReference(input.contact, 'contact', issues);
	throwIfIssues('Update service request contact command is invalid.', issues);
	return {
		type: 'publicEngagement.updateServiceRequestContact',
		payload: {
			...basePayload(input),
			serviceRequestId: normalizeRequiredId(input.serviceRequestId),
			contact,
			acknowledgedHistoricalContactChange: input.acknowledgedHistoricalContactChange ?? false,
		},
	};
}

export function updateServiceRequestLocationCommand(
	input: UpdateServiceRequestLocationCommandInput,
): UpdateServiceRequestLocationCommand {
	const issues = validateIdCommand(input, 'serviceRequestId');
	const location = validateServiceRequestLocation(input.location, 'location', issues);
	throwIfIssues('Update service request location command is invalid.', issues);
	return {
		type: 'publicEngagement.updateServiceRequestLocation',
		payload: {
			...basePayload(input),
			serviceRequestId: normalizeRequiredId(input.serviceRequestId),
			location,
			acknowledgedHistoricalLocationChange: input.acknowledgedHistoricalLocationChange ?? false,
		},
	};
}

export function closeServiceRequestCommand(
	input: CloseServiceRequestCommandInput,
): CloseServiceRequestCommand {
	const issues = validateIdCommand(input, 'serviceRequestId');
	requireUuid(input.resolutionCommentId, 'resolutionCommentId', issues);
	const resolutionSummary = normalizeRequiredText(
		input.resolutionSummary,
		'resolutionSummary',
		issues,
		10_000,
	);
	const closedAt = normalizeOptionalTimestamp(input.closedAt, 'closedAt', issues, false);
	throwIfIssues('Close service request command is invalid.', issues);
	return {
		type: 'publicEngagement.closeServiceRequest',
		payload: {
			...basePayload(input),
			serviceRequestId: normalizeRequiredId(input.serviceRequestId),
			resolutionCommentId: normalizeRequiredId(input.resolutionCommentId),
			resolutionSummary,
			closedAt,
		},
	};
}

export function reopenServiceRequestCommand(
	input: ReopenServiceRequestCommandInput,
): ReopenServiceRequestCommand {
	const issues = validateIdCommand(input, 'serviceRequestId');
	requireUuid(input.reopenCommentId, 'reopenCommentId', issues);
	const reopenReason = normalizeRequiredText(input.reopenReason, 'reopenReason', issues, 10_000);
	const reopenedAt = normalizeOptionalTimestamp(input.reopenedAt, 'reopenedAt', issues, false);
	throwIfIssues('Reopen service request command is invalid.', issues);
	return {
		type: 'publicEngagement.reopenServiceRequest',
		payload: {
			...basePayload(input),
			serviceRequestId: normalizeRequiredId(input.serviceRequestId),
			reopenCommentId: normalizeRequiredId(input.reopenCommentId),
			reopenReason,
			reopenedAt,
		},
	};
}

export function deleteServiceRequestCommand(
	input: DeleteServiceRequestCommandInput,
): DeleteServiceRequestCommand {
	const issues = validateIdCommand(input, 'serviceRequestId');
	throwIfIssues('Delete service request command is invalid.', issues);
	return {
		type: 'publicEngagement.deleteServiceRequest',
		payload: {
			...basePayload(input),
			serviceRequestId: normalizeRequiredId(input.serviceRequestId),
			acknowledgedClosedRequestDeletion: input.acknowledgedClosedRequestDeletion ?? false,
			acknowledgedAssignmentItemDeletion: input.acknowledgedAssignmentItemDeletion ?? false,
		},
	};
}
