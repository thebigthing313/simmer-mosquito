import {
	assertOrganizationProfileCanBeInvited,
	deactivateOrganizationMembershipWithTxid,
	listOrganizationMemberships,
	type MembershipRemovalIssue,
	readMembershipRemovalTarget,
	type SafeOrganizationMembership,
	type SimmerRole,
	StageOrganizationInvitationError,
	stageOrganizationInvitation,
	updateOrganizationMembershipRoleWithTxid,
	validateMembershipRemoval,
} from '@simmer-mosquito/db';
import type { Context, Hono, MiddlewareHandler } from 'hono';
import type { AuthVariables } from './auth-middleware.js';
import { isRecord } from './command-payload.js';
import { stampInvitation } from './invitation-stamp.js';
import { canGrantRole, denyIdentityWrite, forbidden } from './roles.js';

type ProfileCommandDb = Parameters<typeof listOrganizationMemberships>[0];

export interface ProfileInvitationAuth {
	sendOrganizationInvitation(input: {
		readonly email: string;
		readonly workosOrganizationId: string;
		readonly inviterWorkosUserId?: string;
	}): Promise<{
		readonly id: string;
		readonly email: string;
	}>;
	deactivateOrganizationMembership(input: {
		readonly workosUserId: string;
		readonly workosOrganizationId: string;
	}): Promise<{ readonly status: 'deactivated' | 'not_a_member' }>;
}

export function registerProfileCommandRoutes(
	app: Hono<{ Variables: AuthVariables }>,
	options: {
		readonly db: ProfileCommandDb;
		readonly auth: ProfileInvitationAuth;
		readonly authContextMiddleware: MiddlewareHandler<{ Variables: AuthVariables }>;
	},
): void {
	app.post('/organization/memberships/list', options.authContextMiddleware, async (context) => {
		const authContext = context.get('authContext');
		const refusal = denyIdentityWrite(context, 'people.listMemberships');
		if (refusal !== null) {
			return refusal;
		}

		const memberships = await listOrganizationMemberships(options.db, authContext.organization.id);

		return context.json({ memberships: memberships.map(toMembershipResponse) });
	});

	app.patch(
		'/organization/memberships/:membershipId/role',
		options.authContextMiddleware,
		async (context) => {
			const authContext = context.get('authContext');
			const refusal = denyIdentityWrite(context, 'people.changeRole');
			if (refusal !== null) {
				return refusal;
			}

			const payloadResult = await readMembershipRolePayload(context.req);
			if (!payloadResult.ok) {
				return context.json({ error: 'invalid_payload', reason: payloadResult.reason }, 400);
			}

			const result = await updateOrganizationMembershipRoleWithTxid(options.db, {
				id: context.req.param('membershipId'),
				organizationId: authContext.organization.id,
				role: payloadResult.payload.role,
			});
			if (result.row === null) {
				return context.json({ error: 'membership_not_found' }, 404);
			}

			return context.json({
				membership: toMembershipResponse(result.row),
				txid: result.txid,
			});
		},
	);

	/**
	 * End somebody's access to this agency (ADR 0011's offboarding lifecycle).
	 *
	 * `DELETE` because "remove this person from the agency" is what the caller
	 * means; the row surviving as `inactive` is how that is stored, the same way
	 * every other delete in this API is a soft one.
	 *
	 * Two systems, in this order. WorkOS holds the grant a session is refreshed
	 * against, so it goes first — ending the SIMMER row and then failing would
	 * leave somebody who reads as removed and can still sign in. WorkOS answering
	 * `not_a_member` is not a failure: the two can already disagree, and this is
	 * how they are brought back together.
	 */
	app.delete(
		'/organization/memberships/:membershipId',
		options.authContextMiddleware,
		async (context) => {
			const authContext = context.get('authContext');
			const refusal = denyIdentityWrite(context, 'people.endMembership');
			if (refusal !== null) {
				return refusal;
			}

			const membershipId = context.req.param('membershipId');
			const target = await readMembershipRemovalTarget(options.db, {
				id: membershipId,
				organizationId: authContext.organization.id,
			});

			// The same bound as an invitation, for the same reason: an admin who
			// could remove an owner could remove every owner, and an agency with no
			// owner cannot appoint one.
			if (target.membership !== null && !canGrantRole(authContext.role, target.membership.role)) {
				return context.json(forbidden('You cannot remove somebody above your own role.'), 403);
			}

			const issue = validateMembershipRemoval({
				membership: target.membership,
				isSelf: membershipId === authContext.membership.id,
				activeOwnerCount: target.activeOwnerCount,
			});
			if (issue !== null) {
				return context.json({ error: issue, reason: removalReason(issue) }, removalStatus(issue));
			}

			// A membership still at `invited` has no user behind it yet, in either
			// system; there is nothing in WorkOS to end.
			const workosUserId = target.membership?.workosUserId ?? null;
			if (workosUserId !== null) {
				await options.auth.deactivateOrganizationMembership({
					workosUserId,
					workosOrganizationId: authContext.organization.workosOrganizationId,
				});
			}

			const result = await deactivateOrganizationMembershipWithTxid(options.db, {
				id: membershipId,
				organizationId: authContext.organization.id,
			});
			if (result.row === null) {
				return context.json({ error: 'membership_not_found' }, 404);
			}

			return context.json({ membership: toMembershipResponse(result.row), txid: result.txid });
		},
	);

	app.post('/organization/invitations', options.authContextMiddleware, async (context) => {
		const authContext = context.get('authContext');
		const refusal = denyIdentityWrite(context, 'people.invite');
		if (refusal !== null) {
			return refusal;
		}

		const payloadResult = await readInvitePayload(context.req);
		if (!payloadResult.ok) {
			return context.json({ error: 'invalid_payload', reason: payloadResult.reason }, 400);
		}

		// An invitation names a role, so without this an admin refused at the
		// role-change endpoint could mint an owner account and sign in as it.
		if (!canGrantRole(authContext.role, payloadResult.payload.role)) {
			return context.json(forbidden('You cannot invite somebody above your own role.'), 403);
		}

		if (payloadResult.payload.profileId !== null) {
			const errorResponse = await validateProfileInviteTarget(context, options.db, {
				organizationId: authContext.organization.id,
				profileId: payloadResult.payload.profileId,
				email: payloadResult.payload.email,
			});
			if (errorResponse !== null) {
				return errorResponse;
			}
		}

		const staged = await stageInvitedMembership(context, options.db, {
			organizationId: authContext.organization.id,
			payload: payloadResult.payload,
		});
		if (!staged.ok) {
			return staged.response;
		}

		const sent = await sendInvitation(options.auth, {
			email: payloadResult.payload.email,
			workosOrganizationId: authContext.organization.workosOrganizationId,
			inviterWorkosUserId: authContext.workosUser.workosUserId,
		});
		if (!sent.ok) {
			// The failure that is left, and the safe one. The Membership stays at
			// `invited` with no mail sent, which reads on the People page as
			// somebody who never got their link, and inviting again repairs it.
			return context.json({ error: 'invitation_send_failed', reason: sent.reason }, 502);
		}

		// Stamped, or as staged when the stamp could not be written. Either is a
		// Membership at `invited` with the mail already sent, which is what the 201
		// says.
		const membership = await stampInvitation(options.db, {
			staged: staged.membership,
			organizationId: authContext.organization.id,
			workosInvitationId: sent.invitationId,
		});

		return context.json({ membership, txid: null }, 201);
	});
}

/**
 * The Postgres half, and it runs first.
 *
 * Staging refuses an address already spoken for and a profile that cannot take
 * a login. Sending before it meant the caller read that refusal while the
 * invitee held a working link to an agency with no row for them, which is the
 * ordering rule in `docs/domain-command-contract.md`.
 */
async function stageInvitedMembership(
	context: Context<{ Variables: AuthVariables }>,
	db: ProfileCommandDb,
	input: {
		readonly organizationId: string;
		readonly payload: InvitePayload;
	},
): Promise<
	| { readonly ok: true; readonly membership: SafeOrganizationMembership }
	| { readonly ok: false; readonly response: Response }
> {
	try {
		const membership = await stageOrganizationInvitation(db, {
			organizationId: input.organizationId,
			...(input.payload.profileId === null ? {} : { profileId: input.payload.profileId }),
			email: input.payload.email,
			displayName: input.payload.displayName,
			role: input.payload.role,
			workosInvitationId: null,
		});
		return { ok: true, membership };
	} catch (error) {
		const response = invitationErrorResponse(context, error);
		if (response === null) {
			throw error;
		}

		return { ok: false, response };
	}
}

/** The WorkOS half. A refusal comes back named rather than reaching the console as a 500. */
async function sendInvitation(
	auth: ProfileInvitationAuth,
	input: {
		readonly email: string;
		readonly workosOrganizationId: string;
		readonly inviterWorkosUserId: string;
	},
): Promise<
	| { readonly ok: true; readonly invitationId: string }
	| { readonly ok: false; readonly reason: string }
> {
	try {
		const invitation = await auth.sendOrganizationInvitation(input);
		return { ok: true, invitationId: invitation.id };
	} catch (error) {
		return {
			ok: false,
			reason: error instanceof Error ? error.message : 'WorkOS rejected the invitation.',
		};
	}
}

function removalStatus(issue: MembershipRemovalIssue): 404 | 409 {
	return issue === 'membership_not_found' ? 404 : 409;
}

function removalReason(issue: MembershipRemovalIssue): string {
	switch (issue) {
		case 'membership_not_found':
			return 'That membership is not in this organization.';
		case 'membership_is_self':
			return 'You cannot remove your own access.';
		case 'last_active_owner':
			return 'An organization needs at least one active owner.';
	}
}

async function validateProfileInviteTarget(
	context: Context<{ Variables: AuthVariables }>,
	db: ProfileCommandDb,
	input: {
		readonly organizationId: string;
		readonly profileId: string;
		readonly email: string;
	},
) {
	try {
		await assertOrganizationProfileCanBeInvited(db, input);
		return null;
	} catch (error) {
		return invitationErrorResponse(context, error);
	}
}

function invitationErrorResponse(context: Context<{ Variables: AuthVariables }>, error: unknown) {
	if (error instanceof StageOrganizationInvitationError) {
		const status = error.code === 'profile_not_found' ? 404 : 409;
		return context.json({ error: error.code }, status);
	}

	return null;
}

interface InvitePayload {
	readonly email: string;
	readonly role: SimmerRole;
	readonly displayName: string | null;
	readonly profileId: string | null;
}

interface MembershipRolePayload {
	readonly role: SimmerRole;
}

type PayloadResult<TPayload> =
	| {
			readonly ok: true;
			readonly payload: TPayload;
	  }
	| {
			readonly ok: false;
			readonly reason: string;
	  };

async function readInvitePayload(request: {
	readonly json: () => Promise<unknown>;
}): Promise<PayloadResult<InvitePayload>> {
	const raw = await readJsonObject(request);
	if (!raw.ok) {
		return raw;
	}

	const email = readRequiredText(raw.value.email);
	if (email === null || !email.includes('@')) {
		return { ok: false, reason: 'email is required.' };
	}

	const role = readRole(raw.value.role);
	if (role === null) {
		return { ok: false, reason: 'role must be owner, admin, manager, collector, or viewer.' };
	}

	return {
		ok: true,
		payload: {
			email,
			role,
			displayName: readOptionalText(raw.value.displayName),
			profileId: readOptionalText(raw.value.profileId),
		},
	};
}

async function readMembershipRolePayload(request: {
	readonly json: () => Promise<unknown>;
}): Promise<PayloadResult<MembershipRolePayload>> {
	const raw = await readJsonObject(request);
	if (!raw.ok) {
		return raw;
	}

	const role = readRole(raw.value.role);
	if (role === null) {
		return { ok: false, reason: 'role must be owner, admin, manager, collector, or viewer.' };
	}

	return {
		ok: true,
		payload: { role },
	};
}

async function readJsonObject(request: {
	readonly json: () => Promise<unknown>;
}): Promise<
	| { readonly ok: true; readonly value: Record<string, unknown> }
	| { readonly ok: false; readonly reason: string }
> {
	let raw: unknown;
	try {
		raw = await request.json();
	} catch {
		return { ok: false, reason: 'Request body must be JSON.' };
	}

	if (!isRecord(raw)) {
		return { ok: false, reason: 'Request body must be an object.' };
	}

	return { ok: true, value: raw };
}

function readRole(value: unknown): SimmerRole | null {
	if (
		value === 'owner' ||
		value === 'admin' ||
		value === 'manager' ||
		value === 'collector' ||
		value === 'viewer'
	) {
		return value;
	}

	return null;
}

function readRequiredText(value: unknown): string | null {
	const text = readOptionalText(value);
	return text === null ? null : text;
}

function readOptionalText(value: unknown): string | null {
	if (value === undefined || value === null) {
		return null;
	}

	if (typeof value !== 'string') {
		return null;
	}

	const trimmed = value.trim();
	return trimmed.length === 0 ? null : trimmed;
}

function toMembershipResponse(membership: SafeOrganizationMembership) {
	return {
		id: membership.id,
		organizationId: membership.organizationId,
		userId: membership.userId,
		profileId: membership.profileId,
		role: membership.role,
		status: membership.status,
		isDefault: membership.isDefault,
		invitedEmail: membership.invitedEmail,
		workosInvitationId: membership.workosInvitationId,
		profile: membership.profile,
		createdAt: membership.createdAt,
		updatedAt: membership.updatedAt,
	};
}
