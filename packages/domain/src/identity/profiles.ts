import {
	createIssues,
	requiredId as normalizeRequiredId,
	requiredText as normalizeRequiredText,
	organizationPayload,
	requiredUuid as requireUuid,
	throwIfIssues,
	validateOrganizationBase,
} from '../command-validation.js';
import type { DomainId } from '../shared.js';
import {
	requiredTextField,
	type UpdateFieldNormalizer,
	type UpdateFieldSet,
	type UpdateFieldsChanges,
	type UpdateFieldsInput,
	updateFieldsCommand,
} from '../update-command-fields.js';
import type {
	IdentityDomainCommand,
	OrganizationIdentityCommandInput,
	OrganizationIdentityCommandPayload,
} from './shared.js';

/**
 * Adding somebody the organization records work against.
 *
 * A Profile created this way is **historical**: no login behind it, `user_id`
 * null. Attaching a login is an invitation, which is a different floor and a
 * command that spans WorkOS, so it is not here.
 *
 * The id is the client's, which is what ADR 0013 names as the property these
 * three already had: a replay collides on the primary key rather than adding a
 * second person.
 */
export interface CreateProfileCommandInput extends OrganizationIdentityCommandInput {
	readonly profileId: DomainId;
	readonly displayName: string;
	readonly isActive?: boolean;
}

export type CreateProfileCommand = IdentityDomainCommand<
	'identity.createProfile',
	OrganizationIdentityCommandPayload & {
		readonly profileId: DomainId;
		readonly displayName: string;
		readonly isActive: boolean;
	}
>;

const activeFlagField: UpdateFieldNormalizer<boolean, boolean> = (value) => value === true;

export const PROFILE_UPDATE_FIELDS = {
	displayName: requiredTextField(200),
	isActive: activeFlagField,
} satisfies UpdateFieldSet;

export type UpdateProfileCommandInput = OrganizationIdentityCommandInput &
	UpdateFieldsInput<typeof PROFILE_UPDATE_FIELDS> & {
		readonly profileId: DomainId;
	};

export type UpdateProfileCommand = IdentityDomainCommand<
	'identity.updateProfile',
	OrganizationIdentityCommandPayload & {
		readonly profileId: DomainId;
		readonly changes: UpdateFieldsChanges<typeof PROFILE_UPDATE_FIELDS>;
	}
>;

export function createProfileCommand(input: CreateProfileCommandInput): CreateProfileCommand {
	const issues = createIssues();
	validateOrganizationBase(input, issues);
	requireUuid(input.profileId, 'profileId', issues);
	const displayName = normalizeRequiredText(input.displayName, 'displayName', issues, 200);
	throwIfIssues('Create profile command is invalid.', issues);
	return {
		type: 'identity.createProfile',
		payload: {
			...organizationPayload(input),
			profileId: normalizeRequiredId(input.profileId),
			displayName,
			isActive: input.isActive ?? true,
		},
	};
}

export function updateProfileCommand(input: UpdateProfileCommandInput): UpdateProfileCommand {
	return updateFieldsCommand({
		type: 'identity.updateProfile',
		input,
		idKey: 'profileId',
		fields: PROFILE_UPDATE_FIELDS,
		changeNoun: 'profile',
		message: 'Update profile command is invalid.',
	});
}
