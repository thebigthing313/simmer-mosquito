import {
	createIssues,
	requiredId as normalizeRequiredId,
	requiredText as normalizeRequiredText,
	requiredUuid as requireUuid,
	throwIfIssues,
} from '../command-validation.js';
import type { DomainId } from '../shared.js';
import {
	type AgencyIdentityCommandInput,
	type AgencyIdentityCommandPayload,
	agencyPayload,
	type IdentityDomainCommand,
	validateAgencyBase,
	validateAgencyIdCommand,
} from './shared.js';

/**
 * Adding somebody the agency records work against.
 *
 * A Profile created this way is **historical**: no login behind it, `user_id`
 * null. Attaching a login is an invitation, which is a different floor and a
 * command that spans WorkOS, so it is not here.
 *
 * The id is the client's, which is what ADR 0013 names as the property these
 * three already had: a replay collides on the primary key rather than adding a
 * second person.
 */
export interface CreateProfileCommandInput extends AgencyIdentityCommandInput {
	readonly profileId: DomainId;
	readonly displayName: string;
	readonly isActive?: boolean;
}

export type CreateProfileCommand = IdentityDomainCommand<
	'identity.createProfile',
	AgencyIdentityCommandPayload & {
		readonly profileId: DomainId;
		readonly displayName: string;
		readonly isActive: boolean;
	}
>;

export interface UpdateProfileCommandInput extends AgencyIdentityCommandInput {
	readonly profileId: DomainId;
	readonly displayName?: string;
	readonly isActive?: boolean;
}

export type UpdateProfileCommand = IdentityDomainCommand<
	'identity.updateProfile',
	AgencyIdentityCommandPayload & {
		readonly profileId: DomainId;
		readonly changes: {
			readonly displayName?: string;
			readonly isActive?: boolean;
		};
	}
>;

export function createProfileCommand(input: CreateProfileCommandInput): CreateProfileCommand {
	const issues = createIssues();
	validateAgencyBase(input, issues);
	requireUuid(input.profileId, 'profileId', issues);
	const displayName = normalizeRequiredText(input.displayName, 'displayName', issues, 200);
	throwIfIssues('Create profile command is invalid.', issues);
	return {
		type: 'identity.createProfile',
		payload: {
			...agencyPayload(input),
			profileId: normalizeRequiredId(input.profileId),
			displayName,
			isActive: input.isActive ?? true,
		},
	};
}

export function updateProfileCommand(input: UpdateProfileCommandInput): UpdateProfileCommand {
	const issues = validateAgencyIdCommand(input, 'profileId');
	const hasDisplayName = input.displayName !== undefined;
	const hasIsActive = input.isActive !== undefined;
	if (!hasDisplayName && !hasIsActive) {
		issues.push({ path: 'changes', message: 'At least one profile field must change.' });
	}
	const displayName = hasDisplayName
		? normalizeRequiredText(input.displayName, 'displayName', issues, 200)
		: undefined;
	throwIfIssues('Update profile command is invalid.', issues);
	return {
		type: 'identity.updateProfile',
		payload: {
			...agencyPayload(input),
			profileId: normalizeRequiredId(input.profileId),
			changes: {
				...(displayName !== undefined ? { displayName } : {}),
				...(hasIsActive ? { isActive: input.isActive === true } : {}),
			},
		},
	};
}
