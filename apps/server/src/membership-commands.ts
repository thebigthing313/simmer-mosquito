/**
 * The four identity commands that span WorkOS.
 *
 * A Membership is the access that links a login to a Profile, and WorkOS is what
 * a session is actually refreshed against — so none of these four is finished
 * when its Kysely transaction commits. `docs/domain-command-contract.md` ->
 * "Commands that span two systems" states the six rules; this module is where
 * three of them are code:
 *
 * **Postgres orders the write.** A create writes the row first and calls WorkOS
 * after; a revoke calls WorkOS first and writes the row last. Both halves are
 * declared as {@link membershipSecondSystem}, whose `before` runs ahead of the
 * transaction and whose `after` runs once it has committed. Nothing WorkOS-shaped
 * runs *inside* the transaction, because a row that has not committed is a row
 * the second system would be agreeing with prematurely.
 *
 * `identity.reinvite` is both at once and sits in `after`, because the refusal
 * that matters is the Postgres one: a Membership that is not holding an
 * invitation answers 409, and revoking ahead of that would kill a live link for a
 * command that never happened. Inside `after` it revokes and then sends, which is
 * the only order WorkOS leaves. See {@link replaceInvitation}.
 *
 * **A retry must not mail twice.** Every id these commands create is the
 * client's, so a retry that lost its answer finds the row already there. What
 * decides whether WorkOS is called again is the row itself:
 * `workos_invitation_id` set means an invitation already went out for this
 * Membership, and `after` does nothing. The one case that mails twice is a first
 * attempt whose mail went out and whose stamp then failed — #207's failure, which
 * logs the id it lost.
 *
 * **No optimistic row.** Enforced on the client, but the reason is here: an
 * invitation's `invited` status is settled before WorkOS is called and whether
 * the mail was delivered is not, so there is a half of this the client cannot
 * draw.
 *
 * ## Field names
 *
 * `invited_email` and `workos_invitation_id` are columns of `memberships` that
 * no client receives (`WITHHELD` in `scripts/generate-table-schemas.mjs`). They
 * are read and written here, inside the request, which is what that withholding
 * says they are for. `display_name` is a column of `profiles`: an invitation
 * names the Profile it creates, and the two rows are written together.
 */

import {
	checkedValues,
	type Kysely,
	type SelectedRow,
	type SimmerDatabase,
	type SimmerRole,
	type StageOrganizationInvitationErrorCode,
	sql,
	validateExistingProfileInvitationTarget,
	validateMembershipRemoval,
} from '@simmer-mosquito/db';
import type { MembershipCommand } from '@simmer-mosquito/domain';
import type { AuthContext } from './auth-context.js';
import { CommandError } from './command-endpoint.js';
import type { CommandDb, CommandTransaction } from './command-write.js';
import { refuseInvitationRevoke, refuseInvitationSend } from './invitation-refusal.js';
import { forgetInvitation, stampInvitation } from './invitation-stamp.js';
import { canGrantRole, forbidden } from './roles.js';
import {
	workOsIdentityWritesDisabled,
	workOsIdentityWritesDisabledBody,
} from './workos-identity-interlock.js';

/**
 * What the second system needs of the auth provider.
 *
 * Structural, and only the four calls these commands make. `main.ts` hands in
 * the real WorkOS client; a test hands in four functions.
 */
export interface MembershipAuth {
	sendOrganizationInvitation(input: {
		readonly email: string;
		readonly workosOrganizationId: string;
		readonly inviterWorkosUserId?: string;
	}): Promise<{ readonly id: string }>;
	revokeInvitation(
		invitationId: string,
	): Promise<{ readonly status: 'revoked' | 'already_settled' }>;
	deactivateOrganizationMembership(input: {
		readonly workosUserId: string;
		readonly workosOrganizationId: string;
	}): Promise<{ readonly status: 'deactivated' | 'not_a_member' }>;
}

/**
 * What a client is told about a Membership.
 *
 * The two withheld columns are absent here as well as from the sync shape. A
 * command response that carried them would put an invited address on a screen the
 * shape deliberately keeps it off.
 */
const membershipReturnColumns = [
	'id',
	'organization_id',
	'user_id',
	'profile_id',
	'role',
	'status',
	'is_default',
	'created_at',
	'updated_at',
] as const;

export type MembershipRow = SelectedRow<'memberships', typeof membershipReturnColumns>;

/**
 * Whether an actor may hand out a role, as a refusal rather than a boolean.
 *
 * `COMMAND_PERMISSIONS` holds one fixed floor per command and cannot compare the
 * actor's role to the role in the payload, so this stays a check a handler makes.
 * Left as a hand-written line at each site, it is the "guarded by convention" gap
 * ADR 0013 set out to close, moved rather than removed — so it is one function
 * every role-bearing command calls, and
 * `tests/unit/table-commands/role-escalation.test.ts` asserts every one of them
 * does.
 *
 * The rule: nobody grants above their own rung. An admin who could set a role
 * could set their own to `owner`, and reaching the same place by inviting a
 * second account is the same hole through a different door.
 */
function assertCanGrantRole(actor: SimmerRole, granted: SimmerRole, what: string): void {
	if (canGrantRole(actor, granted)) {
		return;
	}
	throw new CommandError(403, forbidden(`You cannot ${what} somebody above your own role.`));
}

// ===========================================================================
// The Postgres half
// ===========================================================================

export async function writeMembershipCommand(
	trx: CommandTransaction,
	command: MembershipCommand,
): Promise<MembershipRow | null> {
	switch (command.type) {
		case 'identity.invite':
			return writeInvitation(trx, command.payload);
		case 'identity.reinvite':
			return writeReinvitation(trx, command.payload);
		case 'identity.changeRole':
			return setMembershipColumns(
				trx,
				command.payload.membershipId,
				command.payload.organizationId,
				{
					role: command.payload.role,
				},
			);
		case 'identity.endMembership':
			return setMembershipColumns(
				trx,
				command.payload.membershipId,
				command.payload.organizationId,
				{
					status: 'inactive',
					// `is_default` names where a user lands when they sign in. Left set,
					// it points at the one organization they can no longer enter, and the
					// next sign-in has nowhere to go.
					is_default: false,
				},
			);
		default:
			throw new Error(`Unsupported membership command: ${(command as MembershipCommand).type}`);
	}
}

/**
 * The Membership and the Profile it points at, written together.
 *
 * The order is the retry rule: the minted Membership id is looked for first, so a
 * caller whose first attempt committed and whose answer was lost gets that row
 * back untouched rather than a second Profile beside the first.
 */
async function writeInvitation(
	trx: CommandTransaction,
	payload: Extract<MembershipCommand, { type: 'identity.invite' }>['payload'],
): Promise<MembershipRow> {
	const alreadyWritten = await trx
		.selectFrom('memberships')
		.select(membershipReturnColumns)
		.where('id', '=', payload.membershipId)
		.where('organization_id', '=', payload.organizationId)
		.executeTakeFirst();
	if (alreadyWritten !== undefined) {
		return alreadyWritten;
	}

	// Somebody who already has access cannot be invited to it. Without this the
	// invitation stages a second Profile and a second Membership beside their live
	// one, and provisioning prefers the active membership on every sign-in, so the
	// invited row is never consumed and never leaves.
	const activeMember = await trx
		.selectFrom('memberships')
		.innerJoin('profiles', 'profiles.id', 'memberships.profile_id')
		.select('memberships.id')
		.where('memberships.organization_id', '=', payload.organizationId)
		.where('memberships.status', '=', 'active')
		.where(sql<boolean>`lower(${sql.ref('profiles.email')}) = ${payload.invitedEmail}`)
		.executeTakeFirst();
	if (activeMember !== undefined) {
		throw new CommandError(409, {
			error: 'already_a_member',
			reason: 'That address already has access to this organization.',
		});
	}

	await assertAddressIsFree(trx, payload.organizationId, payload.invitedEmail);
	await writeInvitedProfile(trx, payload);

	const inserted = await trx
		.insertInto('memberships')
		.values(
			await checkedValues(trx, payload.organizationId, {
				id: payload.membershipId,
				organization_id: payload.organizationId,
				user_id: null,
				profile_id: payload.profileId,
				role: payload.role,
				status: 'invited' as const,
				is_default: false,
				invited_email: payload.invitedEmail,
				// Stamped by `after`, once WorkOS has answered. The mail must not go out
				// before the row it will be accepted into exists.
				workos_invitation_id: null,
			}),
		)
		.returning(membershipReturnColumns)
		.executeTakeFirstOrThrow();

	return inserted;
}

/**
 * The Profile the login attaches to: the one the dialog picked, or the one it
 * minted an id for.
 *
 * Which of the two it is comes from looking rather than from a flag the client
 * sends. A flag that disagreed with the row would refuse a retry for telling the
 * truth the second time, and there is nothing a caller could assert here that the
 * row does not already say.
 */
async function writeInvitedProfile(
	trx: CommandTransaction,
	payload: Extract<MembershipCommand, { type: 'identity.invite' }>['payload'],
): Promise<void> {
	const existing = await trx
		.selectFrom('profiles')
		.select(['id', 'user_id', 'display_name', 'deleted_at'])
		.where('id', '=', payload.profileId)
		.where('organization_id', '=', payload.organizationId)
		.executeTakeFirst();

	if (existing === undefined) {
		await trx
			.insertInto('profiles')
			.values({
				id: payload.profileId,
				organization_id: payload.organizationId,
				// No login yet. Accepting the invitation is what attaches one.
				user_id: null,
				display_name: payload.displayName ?? payload.invitedEmail,
				email: payload.invitedEmail,
				is_active: true,
			})
			.executeTakeFirstOrThrow();
		return;
	}

	const issue = validateExistingProfileInvitationTarget({
		id: existing.id,
		userId: existing.user_id,
		deletedAt: existing.deleted_at,
	});
	if (issue !== null) {
		throw new CommandError(409, { error: issue, reason: profileRefusal(issue) });
	}

	await trx
		.updateTable('profiles')
		.set({
			display_name: payload.displayName ?? existing.display_name,
			email: payload.invitedEmail,
			is_active: true,
			updated_at: sql`now()`,
		})
		.where('id', '=', payload.profileId)
		.executeTakeFirstOrThrow();
}

/**
 * One live invitation per address per organization, refused by name.
 *
 * `memberships_organization_invited_email_unique` is the rule the schema owns,
 * and reaching it as a constraint violation would answer 500. A collision here
 * carries a different id than the one this command minted — the same id was
 * already handled as a retry — so it is two admins asking for the same thing at
 * once, and the refusal names who holds it.
 */
async function assertAddressIsFree(
	trx: CommandTransaction,
	organizationId: string,
	invitedEmail: string,
): Promise<void> {
	const holder = await trx
		.selectFrom('memberships')
		.innerJoin('profiles', 'profiles.id', 'memberships.profile_id')
		.select(['memberships.id', 'profiles.display_name'])
		.where('memberships.organization_id', '=', organizationId)
		.where('memberships.user_id', 'is', null)
		.where('memberships.status', '=', 'invited')
		.where(sql<boolean>`lower(${sql.ref('memberships.invited_email')}) = ${invitedEmail}`)
		.executeTakeFirst();

	if (holder === undefined) {
		return;
	}

	throw new CommandError(409, {
		error: 'invited_email_already_used',
		reason: `${invitedEmail} is already invited, as ${holder.display_name}. Re-invite that person instead.`,
	});
}

/**
 * Overwriting the invitation somebody is holding.
 *
 * Only a Membership still at `invited` has one to replace. An active member is
 * a role change, and an ended one is a fresh invitation, and answering either
 * with a re-invitation would mail a link into a state that cannot accept it.
 */
async function writeReinvitation(
	trx: CommandTransaction,
	payload: Extract<MembershipCommand, { type: 'identity.reinvite' }>['payload'],
): Promise<MembershipRow | null> {
	const current = await trx
		.selectFrom('memberships')
		.select(['id', 'status', 'invited_email'])
		.where('id', '=', payload.membershipId)
		.where('organization_id', '=', payload.organizationId)
		.executeTakeFirst();

	if (current === undefined) {
		return null;
	}
	if (current.status !== 'invited' || current.invited_email === null) {
		throw new CommandError(409, {
			error: 'membership_not_invited',
			reason: 'That person is not holding an invitation.',
		});
	}

	return setMembershipColumns(trx, payload.membershipId, payload.organizationId, {
		role: payload.role,
	});
}

/**
 * One update, tenant-scoped, written out here.
 *
 * Not `updateRow` from `packages/db`: that takes an `OrgOwnedTable`, which is
 * derived from carrying `deleted_at`, and `memberships` has none. A membership is
 * ended by status rather than retired, which is the same reason.
 */
async function setMembershipColumns(
	trx: CommandTransaction,
	membershipId: string,
	organizationId: string,
	set: Record<string, unknown>,
): Promise<MembershipRow | null> {
	const row = await trx
		.updateTable('memberships')
		.set({ ...set, updated_at: sql`now()` } as never)
		.where('id', '=', membershipId)
		.where('organization_id', '=', organizationId)
		.returning(membershipReturnColumns)
		.executeTakeFirst();

	return row ?? null;
}

/**
 * Why a Profile could not take a login.
 *
 * Typed against the whole of `StageOrganizationInvitationErrorCode` rather than
 * the three `validateExistingProfileInvitationTarget` can return today, so a code
 * added to that union arrives here as a missing case rather than as a refusal
 * with no words on it.
 */
function profileRefusal(issue: StageOrganizationInvitationErrorCode): string {
	switch (issue) {
		case 'profile_not_found':
			return 'That profile is not in this organization.';
		case 'profile_already_linked':
			return 'That profile already has a login.';
		case 'profile_deleted':
			return 'That profile was deleted.';
		case 'invited_email_already_used':
			return 'That address is already invited.';
		case 'already_a_member':
			return 'That address already has access to this organization.';
	}
}

// ===========================================================================
// The WorkOS half
// ===========================================================================

/**
 * What runs outside the transaction, and on which side of it.
 *
 * `before` is the revoke side: WorkOS is what refuses a session, so ending the
 * SIMMER row and then failing would leave somebody who reads as removed and can
 * still sign in. `after` is the create side: the mail must not reach somebody
 * the organization has no row for.
 */
export function membershipSecondSystem(db: CommandDb, auth: MembershipAuth) {
	return {
		before: async (command: MembershipCommand, authContext: AuthContext): Promise<void> => {
			// The interlock refuses here rather than only at the WorkOS boundary,
			// because `identity.invite` and `identity.reinvite` call WorkOS from
			// `after`, deliberately, so no mail beats its own Membership row. A
			// refusal raised down there would arrive with the transaction already
			// committed: the row exists, the response is an error, and Electric syncs
			// the row onto the People page contradicting what the user just read. The
			// proxy still throws underneath as the backstop for a fifth write added
			// later. See `workos-identity-interlock.ts` and #376.
			if (workOsIdentityWritesDisabled(auth)) {
				throw new CommandError(403, workOsIdentityWritesDisabledBody());
			}

			switch (command.type) {
				case 'identity.invite':
					assertCanGrantRole(authContext.role, command.payload.role, 'invite');
					return;
				case 'identity.reinvite':
					assertCanGrantRole(authContext.role, command.payload.role, 're-invite');
					return;
				case 'identity.changeRole':
					assertCanGrantRole(authContext.role, command.payload.role, 'promote');
					return;
				case 'identity.endMembership':
					await endWorkOsMembership(db, auth, command.payload, authContext);
					return;
			}
		},

		after: async (command: MembershipCommand, authContext: AuthContext): Promise<void> => {
			if (command.type === 'identity.invite') {
				await sendAndStamp(db, auth, {
					membershipId: command.payload.membershipId,
					organizationId: command.payload.organizationId,
					authContext,
				});
				return;
			}
			if (command.type === 'identity.reinvite') {
				await replaceInvitation(db, auth, command.payload, authContext);
			}
		},
	};
}

/**
 * Read the two columns no client ever sees.
 *
 * Both halves of an invitation live here: the address the mail goes to, and the
 * handle on the link that is currently live.
 */
async function readInvitationState(
	db: Kysely<SimmerDatabase>,
	membershipId: string,
	organizationId: string,
): Promise<{ readonly invitedEmail: string | null; readonly workosInvitationId: string | null }> {
	const row = await db
		.selectFrom('memberships')
		.select(['invited_email', 'workos_invitation_id'])
		.where('id', '=', membershipId)
		.where('organization_id', '=', organizationId)
		.executeTakeFirst();

	return {
		invitedEmail: row?.invited_email ?? null,
		workosInvitationId: row?.workos_invitation_id ?? null,
	};
}

/**
 * Mail the invitation and record its id.
 *
 * A Membership that already carries a `workos_invitation_id` has been invited,
 * and this call is a retry whose first attempt got all the way through — so it
 * does nothing. That check is the whole of rule two: without it the collision on
 * the minted id would be swallowed by the writer and the mail would still go out
 * a second time.
 */
async function sendAndStamp(
	db: CommandDb,
	auth: MembershipAuth,
	input: {
		readonly membershipId: string;
		readonly organizationId: string;
		readonly authContext: AuthContext;
	},
): Promise<void> {
	const state = await readInvitationState(db, input.membershipId, input.organizationId);
	if (state.workosInvitationId !== null || state.invitedEmail === null) {
		return;
	}

	const invitationId = await sendInvitation(auth, {
		email: state.invitedEmail,
		authContext: input.authContext,
		membershipId: input.membershipId,
		organizationId: input.organizationId,
	});
	await stampInvitation(db, {
		membershipId: input.membershipId,
		organizationId: input.organizationId,
		workosInvitationId: invitationId,
	});
}

/**
 * Kill the link it replaces, then mail the replacement.
 *
 * The revoke is first because WorkOS will not hold two invitations for one
 * address and organization at once. It answers `Email already invited to
 * organization.` to the send, and the re-invite control is only offered on a
 * Membership that is holding an invitation, so the other order failed on every
 * call rather than on a rare one (#218).
 *
 * That order costs a window: a send that fails after the revoke leaves the person
 * with no link at all, where before they had a stale one. Nothing narrows it, so
 * what is here instead is a row that agrees with WorkOS and a log line that names
 * the three ids needed to put it right.
 *
 * A revoke that fails does not open that window. Nothing was mailed and nothing
 * was written, so the person keeps the link they had and a retry costs nothing.
 *
 * All of it stays in `after`, on the far side of the transaction, even though the
 * revoke is a revoke. The Postgres half is what refuses a Membership that is not
 * holding an invitation, and revoking ahead of that refusal would kill a live
 * link for a command that then answers 409.
 *
 * A `workos_invitation_id` of `null` is not an error. It is a Membership whose
 * stamp failed (#207) or one the operator console staged without mailing, and
 * either way there is nothing to revoke and the send proceeds.
 */
async function replaceInvitation(
	db: CommandDb,
	auth: MembershipAuth,
	payload: Extract<MembershipCommand, { type: 'identity.reinvite' }>['payload'],
	authContext: AuthContext,
): Promise<void> {
	const previous = await readInvitationState(db, payload.membershipId, payload.organizationId);
	if (previous.invitedEmail === null) {
		return;
	}

	const revoked = previous.workosInvitationId;
	if (revoked !== null) {
		await revokeInvitation(auth, {
			invitationId: revoked,
			membershipId: payload.membershipId,
			organizationId: payload.organizationId,
		});
		await forgetInvitation(db, {
			membershipId: payload.membershipId,
			organizationId: payload.organizationId,
			revokedInvitationId: revoked,
		});
	}

	const invitationId = await sendReplacement(auth, {
		email: previous.invitedEmail,
		authContext,
		membershipId: payload.membershipId,
		organizationId: payload.organizationId,
		revokedInvitationId: revoked,
	});

	await stampInvitation(db, {
		membershipId: payload.membershipId,
		organizationId: payload.organizationId,
		workosInvitationId: invitationId,
	});
}

/**
 * The WorkOS revoke, named the same way the send is.
 *
 * It threw raw before #224, and a raw throw matches no branch in the command
 * error handler, so Hono answered its default 500 with no body and the People
 * page fell back to the sentence it shows for any failed write. The name is
 * {@link refuseInvitationRevoke}'s and WorkOS's own message goes to the log.
 *
 * Failing here is the safe direction and stays that way: this is the first
 * WorkOS call in the path, `forgetInvitation` runs only once it resolves, so the
 * Membership still names the invitation the person is holding and a retry has
 * something to revoke.
 */
async function revokeInvitation(
	auth: MembershipAuth,
	input: {
		readonly invitationId: string;
		readonly membershipId: string;
		readonly organizationId: string;
	},
): Promise<void> {
	try {
		await auth.revokeInvitation(input.invitationId);
	} catch (error) {
		throw new CommandError(
			502,
			refuseInvitationRevoke(error, {
				membershipId: input.membershipId,
				organizationId: input.organizationId,
			}),
		);
	}
}

/**
 * The send, with the window the revoke opened written down when it fails.
 *
 * The 502 reaching the operator says the re-invitation did not work. It does not
 * say that the link they were replacing is now gone too, and no screen shows the
 * difference, so this line is the only record that somebody is locked out. An
 * operator repairs it by re-running the re-invitation, which now has nothing to
 * revoke.
 */
async function sendReplacement(
	auth: MembershipAuth,
	input: {
		readonly email: string;
		readonly authContext: AuthContext;
		readonly membershipId: string;
		readonly organizationId: string;
		readonly revokedInvitationId: string | null;
	},
): Promise<string> {
	try {
		return await sendInvitation(auth, {
			email: input.email,
			authContext: input.authContext,
			membershipId: input.membershipId,
			organizationId: input.organizationId,
		});
	} catch (error) {
		if (input.revokedInvitationId !== null) {
			console.error(
				`[invitations] Re-invitation revoked WorkOS invitation ${input.revokedInvitationId} and the replacement send then failed. Membership ${input.membershipId}, organization ${input.organizationId}, holding no live invitation.`,
				error,
			);
		}
		throw error;
	}
}

/**
 * The WorkOS send, with a refusal named rather than reaching the console as a 500.
 *
 * The name is this server's, from {@link refuseInvitationSend}. WorkOS's own
 * message goes to the log: it is a third party's prose and #220 is about not
 * putting it in a browser.
 */
async function sendInvitation(
	auth: MembershipAuth,
	input: {
		readonly email: string;
		readonly authContext: AuthContext;
		readonly membershipId: string;
		readonly organizationId: string;
	},
): Promise<string> {
	try {
		const invitation = await auth.sendOrganizationInvitation({
			email: input.email,
			workosOrganizationId: input.authContext.organization.workosOrganizationId,
			inviterWorkosUserId: input.authContext.workosUser.workosUserId,
		});
		return invitation.id;
	} catch (error) {
		// The row is written and the mail is not. That reads on the People page as
		// somebody invited who never got a link, and the repair is a re-invitation.
		// The other order sends a working link to somebody the organization has no
		// row for.
		throw new CommandError(
			502,
			refuseInvitationSend(error, {
				membershipId: input.membershipId,
				organizationId: input.organizationId,
			}),
		);
	}
}

/**
 * End the WorkOS grant, and refuse what must not be ended.
 *
 * All of it runs before the transaction: the two removal rules read the row's
 * neighbours, and the WorkOS deactivation has to land before the SIMMER row says
 * the access is gone.
 *
 * WorkOS answering `not_a_member` is not a failure. The two systems can already
 * disagree — a membership removed in the WorkOS dashboard leaves the SIMMER row
 * standing — and this is how they are brought back together.
 */
async function endWorkOsMembership(
	db: CommandDb,
	auth: MembershipAuth,
	payload: Extract<MembershipCommand, { type: 'identity.endMembership' }>['payload'],
	authContext: AuthContext,
): Promise<void> {
	const target = await db
		.selectFrom('memberships')
		.leftJoin('users', 'users.id', 'memberships.user_id')
		.select([
			'memberships.role',
			'memberships.status',
			'memberships.user_id',
			'users.workos_user_id',
		])
		.where('memberships.id', '=', payload.membershipId)
		.where('memberships.organization_id', '=', payload.organizationId)
		.executeTakeFirst();

	// The same bound as an invitation, for the same reason: an admin who could
	// remove an owner could remove every owner, and an organization with no owner
	// cannot appoint one.
	if (target !== undefined) {
		assertCanGrantRole(authContext.role, target.role, 'remove');
	}

	const activeOwners = await db
		.selectFrom('memberships')
		.select(({ fn }) => fn.countAll<number>().as('count'))
		.where('organization_id', '=', payload.organizationId)
		.where('role', '=', 'owner')
		.where('status', '=', 'active')
		.executeTakeFirstOrThrow();

	const issue = validateMembershipRemoval({
		membership: target === undefined ? null : { role: target.role, status: target.status },
		isSelf: payload.membershipId === authContext.membership.id,
		activeOwnerCount: Number(activeOwners.count),
	});
	if (issue !== null) {
		throw new CommandError(issue === 'membership_not_found' ? 404 : 409, {
			error: issue,
			reason: removalReason(issue),
		});
	}

	// A membership still at `invited` has no user behind it yet, in either system;
	// there is nothing in WorkOS to end.
	const workosUserId = target?.workos_user_id ?? null;
	if (workosUserId !== null) {
		await auth.deactivateOrganizationMembership({
			workosUserId,
			workosOrganizationId: authContext.organization.workosOrganizationId,
		});
	}
}

function removalReason(issue: 'membership_not_found' | 'membership_is_self' | 'last_active_owner') {
	switch (issue) {
		case 'membership_not_found':
			return 'That membership is not in this organization.';
		case 'membership_is_self':
			return 'You cannot remove your own access.';
		case 'last_active_owner':
			return 'An organization needs at least one active owner.';
	}
}
