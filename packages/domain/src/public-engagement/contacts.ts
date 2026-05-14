import {
	createIssues,
	nullableText as normalizeNullableText,
	requiredId as normalizeRequiredId,
	requiredUuid as requireUuid,
	throwIfIssues,
} from '../command-validation.js';
import type { DomainId } from '../shared.js';
import type {
	CreateContactDetails,
	CreateContactDetailsInput,
	PublicEngagementCommandInput,
	PublicEngagementCommandPayload,
	PublicEngagementDomainCommand,
} from './core.js';
import {
	basePayload,
	normalizeCreateContactDetails,
	normalizeEmail,
	validateBase,
	validateBoolean,
	validateIdCommand,
	validateIdList,
	validatePhonePreferencePatch,
} from './core.js';
export interface CreateContactCommandInput
	extends PublicEngagementCommandInput,
		CreateContactDetailsInput {
	readonly contactId: DomainId;
}

export type CreateContactCommand = PublicEngagementDomainCommand<
	'publicEngagement.createContact',
	PublicEngagementCommandPayload & { readonly contactId: DomainId } & CreateContactDetails
>;

export interface UpdateContactDetailsCommandInput extends PublicEngagementCommandInput {
	readonly contactId: DomainId;
	readonly contactName?: string | null;
	readonly company?: string | null;
	readonly department?: string | null;
	readonly title?: string | null;
}

export type UpdateContactDetailsCommand = PublicEngagementDomainCommand<
	'publicEngagement.updateContactDetails',
	PublicEngagementCommandPayload & {
		readonly contactId: DomainId;
		readonly changes: Readonly<{
			readonly contactName?: string | null;
			readonly company?: string | null;
			readonly department?: string | null;
			readonly title?: string | null;
		}>;
	}
>;

export interface UpdateContactCommunicationCommandInput extends PublicEngagementCommandInput {
	readonly contactId: DomainId;
	readonly preferredPhone?: string | null;
	readonly alternatePhone?: string | null;
	readonly email?: string | null;
	readonly wantsEmail?: boolean;
	readonly wantsSms?: boolean;
	readonly wantsPhone?: boolean;
}

export type UpdateContactCommunicationCommand = PublicEngagementDomainCommand<
	'publicEngagement.updateContactCommunication',
	PublicEngagementCommandPayload & {
		readonly contactId: DomainId;
		readonly changes: Readonly<{
			readonly preferredPhone?: string | null;
			readonly alternatePhone?: string | null;
			readonly email?: string | null;
			readonly wantsEmail?: boolean;
			readonly wantsSms?: boolean;
			readonly wantsPhone?: boolean;
		}>;
	}
>;

export interface MergeContactsCommandInput extends PublicEngagementCommandInput {
	readonly targetContactId: DomainId;
	readonly sourceContactIds: readonly DomainId[];
	readonly acknowledgedContactMerge?: boolean;
}

export type MergeContactsCommand = PublicEngagementDomainCommand<
	'publicEngagement.mergeContacts',
	PublicEngagementCommandPayload & {
		readonly targetContactId: DomainId;
		readonly sourceContactIds: readonly DomainId[];
		readonly acknowledgedContactMerge: true;
	}
>;

export interface ContactIdCommandInput extends PublicEngagementCommandInput {
	readonly contactId: DomainId;
}

export type DeleteContactCommand = PublicEngagementDomainCommand<
	'publicEngagement.deleteContact',
	PublicEngagementCommandPayload & { readonly contactId: DomainId }
>;

export function createContactCommand(input: CreateContactCommandInput): CreateContactCommand {
	const issues = createIssues();
	validateBase(input, issues);
	requireUuid(input.contactId, 'contactId', issues);
	const details = normalizeCreateContactDetails(input, 'contact', issues);
	throwIfIssues('Create contact command is invalid.', issues);
	return {
		type: 'publicEngagement.createContact',
		payload: { ...basePayload(input), contactId: normalizeRequiredId(input.contactId), ...details },
	};
}

export function updateContactDetailsCommand(
	input: UpdateContactDetailsCommandInput,
): UpdateContactDetailsCommand {
	const issues = validateIdCommand(input, 'contactId');
	const hasName = input.contactName !== undefined;
	const hasCompany = input.company !== undefined;
	const hasDepartment = input.department !== undefined;
	const hasTitle = input.title !== undefined;
	if (!hasName && !hasCompany && !hasDepartment && !hasTitle) {
		issues.push({ path: 'changes', message: 'At least one contact detail must change.' });
	}
	const contactName = hasName
		? normalizeNullableText(input.contactName, 'contactName', issues, 200)
		: undefined;
	const company = hasCompany
		? normalizeNullableText(input.company, 'company', issues, 200)
		: undefined;
	const department = hasDepartment
		? normalizeNullableText(input.department, 'department', issues, 200)
		: undefined;
	const title = hasTitle ? normalizeNullableText(input.title, 'title', issues, 200) : undefined;
	throwIfIssues('Update contact details command is invalid.', issues);
	return {
		type: 'publicEngagement.updateContactDetails',
		payload: {
			...basePayload(input),
			contactId: normalizeRequiredId(input.contactId),
			changes: {
				...(hasName ? { contactName: contactName ?? null } : {}),
				...(hasCompany ? { company: company ?? null } : {}),
				...(hasDepartment ? { department: department ?? null } : {}),
				...(hasTitle ? { title: title ?? null } : {}),
			},
		},
	};
}

export function updateContactCommunicationCommand(
	input: UpdateContactCommunicationCommandInput,
): UpdateContactCommunicationCommand {
	const issues = validateIdCommand(input, 'contactId');
	const hasPreferred = input.preferredPhone !== undefined;
	const hasAlternate = input.alternatePhone !== undefined;
	const hasEmail = input.email !== undefined;
	const hasWantsEmail = input.wantsEmail !== undefined;
	const hasWantsSms = input.wantsSms !== undefined;
	const hasWantsPhone = input.wantsPhone !== undefined;
	if (
		!hasPreferred &&
		!hasAlternate &&
		!hasEmail &&
		!hasWantsEmail &&
		!hasWantsSms &&
		!hasWantsPhone
	) {
		issues.push({
			path: 'changes',
			message: 'At least one contact communication field must change.',
		});
	}
	const preferredPhone = hasPreferred
		? normalizeNullableText(input.preferredPhone, 'preferredPhone', issues, 100)
		: undefined;
	const alternatePhone = hasAlternate
		? normalizeNullableText(input.alternatePhone, 'alternatePhone', issues, 100)
		: undefined;
	const email = hasEmail ? normalizeEmail(input.email, 'email', issues) : undefined;
	if (hasPreferred && preferredPhone === null && hasAlternate && alternatePhone !== null) {
		issues.push({
			path: 'alternatePhone',
			message: 'alternatePhone cannot be set without preferredPhone.',
		});
	}
	if (hasWantsEmail) {
		validateBoolean(input.wantsEmail, 'wantsEmail', issues);
		if (input.wantsEmail === true && hasEmail && email === null) {
			issues.push({ path: 'wantsEmail', message: 'wantsEmail requires email.' });
		}
	}
	validatePhonePreferencePatch(
		input.wantsSms,
		hasWantsSms,
		preferredPhone,
		hasPreferred,
		'wantsSms',
		issues,
	);
	validatePhonePreferencePatch(
		input.wantsPhone,
		hasWantsPhone,
		preferredPhone,
		hasPreferred,
		'wantsPhone',
		issues,
	);
	throwIfIssues('Update contact communication command is invalid.', issues);
	return {
		type: 'publicEngagement.updateContactCommunication',
		payload: {
			...basePayload(input),
			contactId: normalizeRequiredId(input.contactId),
			changes: {
				...(hasPreferred ? { preferredPhone: preferredPhone ?? null } : {}),
				...(hasAlternate ? { alternatePhone: alternatePhone ?? null } : {}),
				...(hasEmail ? { email: email ?? null } : {}),
				...(hasWantsEmail ? { wantsEmail: input.wantsEmail === true } : {}),
				...(hasWantsSms ? { wantsSms: input.wantsSms === true } : {}),
				...(hasWantsPhone ? { wantsPhone: input.wantsPhone === true } : {}),
			},
		},
	};
}

export function mergeContactsCommand(input: MergeContactsCommandInput): MergeContactsCommand {
	const issues = createIssues();
	validateBase(input, issues);
	requireUuid(input.targetContactId, 'targetContactId', issues);
	const sourceContactIds = validateIdList(input.sourceContactIds, 'sourceContactIds', issues);
	if (sourceContactIds.includes(normalizeRequiredId(input.targetContactId))) {
		issues.push({
			path: 'sourceContactIds',
			message: 'targetContactId cannot be a source contact.',
		});
	}
	if (input.acknowledgedContactMerge !== true) {
		issues.push({
			path: 'acknowledgedContactMerge',
			message: 'Contact merge acknowledgement is required.',
		});
	}
	throwIfIssues('Merge contacts command is invalid.', issues);
	return {
		type: 'publicEngagement.mergeContacts',
		payload: {
			...basePayload(input),
			targetContactId: normalizeRequiredId(input.targetContactId),
			sourceContactIds,
			acknowledgedContactMerge: true,
		},
	};
}

export function deleteContactCommand(input: ContactIdCommandInput): DeleteContactCommand {
	const issues = validateIdCommand(input, 'contactId');
	throwIfIssues('Delete contact command is invalid.', issues);
	return {
		type: 'publicEngagement.deleteContact',
		payload: { ...basePayload(input), contactId: normalizeRequiredId(input.contactId) },
	};
}
