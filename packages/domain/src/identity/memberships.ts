/**
 * The four identity commands that span WorkOS.
 *
 * A **Membership** is the access that links a login to a Profile. Every one of
 * these four settles something in WorkOS as well as in Postgres, so they ship
 * under the six rules in `docs/domain-command-contract.md` -> "Commands that
 * span two systems". Two of those rules shape what is here rather than what the
 * server does with it:
 *
 * **The client mints every id the command creates.** `identity.invite` carries
 * the `membershipId` it will write and the `profileId` it will point at, so a
 * retry that lost its answer collides on the primary key and the server hands
 * back the row that is already there instead of mailing a second invitation.
 * Keying only the Membership would leave a retry able to mint a second Profile.
 *
 * **An overwrite is its own command.** A second `identity.invite` is a retry to
 * swallow; a deliberate redo is `identity.reinvite`, which names a Membership
 * already at `invited` and takes no ids of its own. No key can tell those two
 * apart, so splitting them is what lets the minted id mean one thing.
 *
 * The role each of these names is not validated here beyond being one of the
 * five. Whether *this* actor may hand it out compares the actor to the payload,
 * which is stored state, so it is the server's — see `assertCanGrantRole` in
 * `apps/server/src/membership-commands.ts`.
 */

import { SIMMER_ROLES, type SimmerRole } from '../column-vocabularies.js';
import {
	createIssues,
	requiredId as normalizeRequiredId,
	nullableText,
	requiredText,
	requiredUuid as requireUuid,
	throwIfIssues,
} from '../command-validation.js';
import type { DomainId, DomainValidationIssue } from '../shared.js';
import {
	type AgencyIdentityCommandInput,
	type AgencyIdentityCommandPayload,
	agencyPayload,
	type IdentityDomainCommand,
	validateAgencyBase,
	validateAgencyIdCommand,
} from './shared.js';

/**
 * A role as it arrives, which may be nothing.
 *
 * `undefined` rather than `SimmerRole` alone because the server reads this off an
 * untrusted body and has nowhere to put a value that is not one of the five. Every
 * builder here refuses the absence by name, which is the 400 a caller should see;
 * casting the raw value to `SimmerRole` at the handler would push the same refusal
 * down to Postgres, where it arrives as an enum error.
 */
export type RoleInput = SimmerRole | undefined;

/**
 * Inviting somebody into the agency.
 *
 * `profileId` is the Profile the login attaches to, and it is one id either way:
 * an existing historical Profile the invite dialog picked, or one the client
 * minted for a new person. Which it is is the server's to discover by looking,
 * not a flag the client asserts — a flag that disagreed with the row would be a
 * retry refused for telling the truth the second time.
 */
export interface InviteCommandInput extends AgencyIdentityCommandInput {
	readonly membershipId: DomainId;
	readonly profileId: DomainId;
	readonly invitedEmail: string;
	/** Optional: an invitation with no name uses the address. */
	readonly displayName?: string | null;
	readonly role: RoleInput;
}

export type InviteCommand = IdentityDomainCommand<
	'identity.invite',
	AgencyIdentityCommandPayload & {
		readonly membershipId: DomainId;
		readonly profileId: DomainId;
		readonly invitedEmail: string;
		readonly displayName: string | null;
		readonly role: SimmerRole;
	}
>;

/**
 * Replacing the invitation somebody is holding.
 *
 * No email and no Profile: both belong to the Membership already, and a
 * re-invitation that could change the address would be an invitation of somebody
 * else wearing the same row. The role can move, because the reason to re-invite
 * is usually that the first one named the wrong one.
 */
export interface ReinviteCommandInput extends AgencyIdentityCommandInput {
	readonly membershipId: DomainId;
	readonly role: RoleInput;
}

export type ReinviteCommand = IdentityDomainCommand<
	'identity.reinvite',
	AgencyIdentityCommandPayload & {
		readonly membershipId: DomainId;
		readonly role: SimmerRole;
	}
>;

export interface ChangeRoleCommandInput extends AgencyIdentityCommandInput {
	readonly membershipId: DomainId;
	readonly role: RoleInput;
}

export type ChangeRoleCommand = IdentityDomainCommand<
	'identity.changeRole',
	AgencyIdentityCommandPayload & {
		readonly membershipId: DomainId;
		readonly role: SimmerRole;
	}
>;

/**
 * Ending somebody's access (ADR 0011's offboarding lifecycle).
 *
 * The row survives at `inactive`. It is the only record that access was ever
 * held, and the Profile it points at goes on naming every record the person
 * created.
 */
export interface EndMembershipCommandInput extends AgencyIdentityCommandInput {
	readonly membershipId: DomainId;
}

export type EndMembershipCommand = IdentityDomainCommand<
	'identity.endMembership',
	AgencyIdentityCommandPayload & {
		readonly membershipId: DomainId;
	}
>;

/** The four, as the union `/commands/memberships` writes. */
export type MembershipCommand =
	| InviteCommand
	| ReinviteCommand
	| ChangeRoleCommand
	| EndMembershipCommand;

export function inviteCommand(input: InviteCommandInput): InviteCommand {
	const issues = createIssues();
	validateAgencyBase(input, issues);
	requireUuid(input.membershipId, 'membershipId', issues);
	requireUuid(input.profileId, 'profileId', issues);
	const invitedEmail = validateEmail(input.invitedEmail, issues);
	const role = validateRole(input.role, issues);
	const displayName = nullableText(input.displayName, 'displayName', issues, 200);
	throwIfIssues('Invite command is invalid.', issues);

	return {
		type: 'identity.invite',
		payload: {
			...agencyPayload(input),
			membershipId: normalizeRequiredId(input.membershipId),
			profileId: normalizeRequiredId(input.profileId),
			invitedEmail,
			displayName,
			role,
		},
	};
}

export function reinviteCommand(input: ReinviteCommandInput): ReinviteCommand {
	const issues = validateAgencyIdCommand(input, 'membershipId');
	const role = validateRole(input.role, issues);
	throwIfIssues('Reinvite command is invalid.', issues);

	return {
		type: 'identity.reinvite',
		payload: {
			...agencyPayload(input),
			membershipId: normalizeRequiredId(input.membershipId),
			role,
		},
	};
}

export function changeRoleCommand(input: ChangeRoleCommandInput): ChangeRoleCommand {
	const issues = validateAgencyIdCommand(input, 'membershipId');
	const role = validateRole(input.role, issues);
	throwIfIssues('Change role command is invalid.', issues);

	return {
		type: 'identity.changeRole',
		payload: {
			...agencyPayload(input),
			membershipId: normalizeRequiredId(input.membershipId),
			role,
		},
	};
}

export function endMembershipCommand(input: EndMembershipCommandInput): EndMembershipCommand {
	const issues = validateAgencyIdCommand(input, 'membershipId');
	throwIfIssues('End membership command is invalid.', issues);

	return {
		type: 'identity.endMembership',
		payload: {
			...agencyPayload(input),
			membershipId: normalizeRequiredId(input.membershipId),
		},
	};
}

/**
 * An address, lower-cased.
 *
 * The shape check is one `@` with something either side, which is as far as a
 * context-free rule can honestly go — whether the mailbox exists is answered by
 * whether the invitation arrives. Lower-casing is here rather than in the writer
 * because the uniqueness rule the schema owns is on `lower(invited_email)`, and
 * a command that carried the address in one case and matched it in another would
 * refuse a race it should swallow.
 */
function validateEmail(value: string | undefined, issues: DomainValidationIssue[]): string {
	const text = requiredText(value, 'invitedEmail', issues, 320);
	const at = text.indexOf('@');
	if (text !== '' && (at <= 0 || at === text.length - 1)) {
		issues.push({ path: 'invitedEmail', message: 'invitedEmail must be an email address.' });
	}
	return text.toLowerCase();
}

function validateRole(value: RoleInput, issues: DomainValidationIssue[]): SimmerRole {
	if (value === undefined || !SIMMER_ROLES.includes(value)) {
		issues.push({
			path: 'role',
			message: 'role must be owner, admin, manager, collector, or viewer.',
		});
		return 'viewer';
	}
	return value;
}
