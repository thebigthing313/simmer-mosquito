import {
	basePayload,
	createIssues,
	requiredId as normalizeRequiredId,
	requiredUuid as requireUuid,
	throwIfIssues,
	validateBase,
	validateIdCommand,
	validateIdList,
} from '../command-validation.js';
import type { DomainId } from '../shared.js';
import {
	normalizeUpdateFields,
	nullableTextField,
	type UpdateFieldSet,
	type UpdateFieldsChanges,
	type UpdateFieldsInput,
	updateFieldsCommand,
} from '../update-command-fields.js';
import type {
	CreateContactDetails,
	CreateContactDetailsInput,
	PublicEngagementCommandInput,
	PublicEngagementCommandPayload,
	PublicEngagementDomainCommand,
} from './core.js';
import { booleanField, normalizeCreateContactDetails, normalizeEmail } from './core.js';
export interface CreateContactCommandInput
	extends PublicEngagementCommandInput,
		CreateContactDetailsInput {
	readonly contactId: DomainId;
}

export type CreateContactCommand = PublicEngagementDomainCommand<
	'publicEngagement.createContact',
	PublicEngagementCommandPayload & { readonly contactId: DomainId } & CreateContactDetails
>;

export const CONTACT_DETAILS_UPDATE_FIELDS = {
	contactName: nullableTextField(200),
	company: nullableTextField(200),
	department: nullableTextField(200),
	title: nullableTextField(200),
} satisfies UpdateFieldSet;

export type UpdateContactDetailsCommandInput = PublicEngagementCommandInput &
	UpdateFieldsInput<typeof CONTACT_DETAILS_UPDATE_FIELDS> & {
		readonly contactId: DomainId;
	};

export type UpdateContactDetailsCommand = PublicEngagementDomainCommand<
	'publicEngagement.updateContactDetails',
	PublicEngagementCommandPayload & {
		readonly contactId: DomainId;
		readonly changes: UpdateFieldsChanges<typeof CONTACT_DETAILS_UPDATE_FIELDS>;
	}
>;

export const CONTACT_COMMUNICATION_UPDATE_FIELDS = {
	preferredPhone: nullableTextField(100),
	alternatePhone: nullableTextField(100),
	email: normalizeEmail,
	wantsEmail: booleanField,
	wantsSms: booleanField,
	wantsPhone: booleanField,
} satisfies UpdateFieldSet;

export type UpdateContactCommunicationCommandInput = PublicEngagementCommandInput &
	UpdateFieldsInput<typeof CONTACT_COMMUNICATION_UPDATE_FIELDS> & {
		readonly contactId: DomainId;
	};

export type UpdateContactCommunicationCommand = PublicEngagementDomainCommand<
	'publicEngagement.updateContactCommunication',
	PublicEngagementCommandPayload & {
		readonly contactId: DomainId;
		readonly changes: UpdateFieldsChanges<typeof CONTACT_COMMUNICATION_UPDATE_FIELDS>;
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
	return updateFieldsCommand({
		type: 'publicEngagement.updateContactDetails',
		input,
		idKey: 'contactId',
		fields: CONTACT_DETAILS_UPDATE_FIELDS,
		changeNoun: 'contact',
		emptyChangeMessage: 'At least one contact detail must change.',
		message: 'Update contact details command is invalid.',
	});
}

export function updateContactCommunicationCommand(
	input: UpdateContactCommunicationCommandInput,
): UpdateContactCommunicationCommand {
	const issues = validateIdCommand(input, 'contactId');
	const changes = normalizeUpdateFields(
		input,
		CONTACT_COMMUNICATION_UPDATE_FIELDS,
		'At least one contact communication field must change.',
		issues,
	);

	// A contact reachable by phone needs the number the calls go to, so the three
	// rules below all read the same pair: what this edit leaves the phone as, and
	// what it asks to be reachable by.
	if (changes.preferredPhone === null && (changes.alternatePhone ?? null) !== null) {
		issues.push({
			path: 'alternatePhone',
			message: 'alternatePhone cannot be set without preferredPhone.',
		});
	}
	if (changes.wantsEmail === true && changes.email === null) {
		issues.push({ path: 'wantsEmail', message: 'wantsEmail requires email.' });
	}
	if (changes.wantsSms === true && changes.preferredPhone === null) {
		issues.push({ path: 'wantsSms', message: 'wantsSms requires preferredPhone.' });
	}
	if (changes.wantsPhone === true && changes.preferredPhone === null) {
		issues.push({ path: 'wantsPhone', message: 'wantsPhone requires preferredPhone.' });
	}
	throwIfIssues('Update contact communication command is invalid.', issues);

	return {
		type: 'publicEngagement.updateContactCommunication',
		payload: {
			...basePayload(input),
			contactId: normalizeRequiredId(input.contactId),
			changes,
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
