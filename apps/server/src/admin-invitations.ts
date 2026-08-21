import {
	assertOrganizationProfileCanBeInvited,
	getOperatorOrganization,
	type SafeOrganizationMembership,
	type SimmerRole,
	StageOrganizationInvitationError,
	stageOrganizationInvitation,
	stampOrganizationInvitation,
} from '@simmer-mosquito/db';
import type { Hono } from 'hono';
import type { AuthVariables, createOperatorAuthContextMiddleware } from './auth-middleware.js';
import { isRecord } from './command-payload.js';

type AdminInvitationDb = Parameters<typeof getOperatorOrganization>[0];

export interface AdminInvitationAuth {
	findOrganizationMember(input: {
		readonly email: string;
		readonly workosOrganizationId: string;
	}): Promise<{
		readonly workosUserId: string;
		readonly status: 'active' | 'inactive' | 'pending';
	} | null>;
	sendOrganizationInvitation(input: {
		readonly email: string;
		readonly workosOrganizationId: string;
		readonly inviterWorkosUserId?: string;
	}): Promise<{
		readonly id: string;
		readonly email: string;
		readonly state: 'pending' | 'accepted' | 'expired' | 'revoked';
		readonly organizationId: string | null;
		readonly acceptedUserId: string | null;
		readonly expiresAt: string;
		readonly createdAt: string;
		readonly updatedAt: string;
	}>;
}

export function registerAdminInvitationRoutes(
	app: Hono<{ Variables: AuthVariables }>,
	options: {
		readonly db: AdminInvitationDb;
		readonly auth: AdminInvitationAuth;
		readonly operatorAuthContextMiddleware: ReturnType<typeof createOperatorAuthContextMiddleware>;
	},
): void {
	app.post(
		'/admin/organizations/:organizationId/invitations',
		options.operatorAuthContextMiddleware,
		async (context) => {
			const operatorContext = context.get('operatorContext');

			const payloadResult = await readInvitePayload(context.req);
			if (!payloadResult.ok) {
				return context.json(
					{
						error: 'invalid_payload',
						reason: payloadResult.reason,
					},
					400,
				);
			}

			const organizationId = context.req.param('organizationId');
			const target = await resolveInviteTarget(options.db, organizationId, payloadResult.payload);
			if (!target.ok) {
				return context.json({ error: target.code }, target.status);
			}

			// Postgres first, then WorkOS, under the ordering rule in
			// `docs/domain-command-contract.md`. Staging still refuses an address
			// already spoken for, and sending before it meant the operator read that
			// refusal while the invitee held a working link to an agency with no row
			// for them.
			const staged = await stageMembership(options.db, organizationId, payloadResult.payload);
			if (!staged.ok) {
				return context.json({ error: staged.code }, staged.status);
			}

			const invitationResult = await inviteUnlessAlreadyReached(options.auth, {
				email: payloadResult.payload.email,
				workosOrganizationId: target.workosOrganizationId,
				inviterWorkosUserId: operatorContext.workosUser.workosUserId,
			});
			if (!invitationResult.ok) {
				// The Membership stays, with no invitation id on it. The role is still
				// staged and still claimed the next time they enter the agency, and an
				// operator who needs the mail can invite again.
				return context.json(
					{ error: 'invitation_send_failed', reason: invitationResult.reason },
					502,
				);
			}

			const invitation = invitationResult.invitation;
			const membership =
				invitation === null
					? staged.membership
					: await stampOrganizationInvitation(options.db, {
							id: staged.membership.id,
							organizationId,
							workosInvitationId: invitation.id,
						});

			return context.json(
				{
					invitation: toInvitationResponse(invitation),
					membership: toAdminMembershipResponse(membership),
				},
				201,
			);
		},
	);
}

/**
 * Staging, with the errors that are answers separated from the errors that are
 * bugs. A `StageOrganizationInvitationError` names something the caller did —
 * an unknown profile, an address already spoken for — and comes back as a
 * status. Anything else is left to throw.
 */
async function stageMembership(
	db: AdminInvitationDb,
	organizationId: string,
	payload: InvitePayload,
): Promise<
	| { readonly ok: true; readonly membership: SafeOrganizationMembership }
	| { readonly ok: false; readonly code: string; readonly status: 404 | 409 }
> {
	const input = {
		organizationId,
		...(payload.profileId === null ? {} : { profileId: payload.profileId }),
		// What the operator typed, normalized by staging. WorkOS has not answered
		// yet, so its copy of the address is not available to prefer.
		email: payload.email,
		displayName: payload.displayName,
		role: payload.role,
		workosInvitationId: null,
	};

	try {
		return { ok: true, membership: await stageOrganizationInvitation(db, input) };
	} catch (error) {
		if (error instanceof StageOrganizationInvitationError) {
			return {
				ok: false,
				code: error.code,
				status: error.code === 'profile_not_found' ? 404 : 409,
			};
		}

		throw error;
	}
}

/** `null` when no invitation was sent, which is a success — see above. */
function toInvitationResponse(invitation: SentInvitation | null) {
	return invitation === null
		? null
		: {
				id: invitation.id,
				email: invitation.email,
				state: invitation.state,
				organizationId: invitation.organizationId,
				acceptedUserId: invitation.acceptedUserId,
				expiresAt: invitation.expiresAt,
				createdAt: invitation.createdAt,
				updatedAt: invitation.updatedAt,
			};
}

type SentInvitation = Awaited<ReturnType<AdminInvitationAuth['sendOrganizationInvitation']>>;

/**
 * The WorkOS half, which is sometimes nothing to do.
 *
 * Somebody who already reaches this organization through WorkOS cannot be
 * invited to it — `sendInvitation` throws on an existing member — and does not
 * need to be. What they are missing is the SIMMER role, which the caller stages
 * either way, to be claimed by provisioning the next time they enter the
 * agency. This is the ordinary shape of an operator support grant (ADR 0011),
 * not an edge case.
 *
 * A `null` invitation is therefore success, not absence. Any other WorkOS
 * refusal comes back named: it used to leave the route throwing, which reached
 * the console as an unreadable 500.
 */
async function inviteUnlessAlreadyReached(
	auth: AdminInvitationAuth,
	input: {
		readonly email: string;
		readonly workosOrganizationId: string;
		readonly inviterWorkosUserId: string;
	},
): Promise<
	| { readonly ok: true; readonly invitation: SentInvitation | null }
	| { readonly ok: false; readonly reason: string }
> {
	const existingMember = await auth.findOrganizationMember({
		email: input.email,
		workosOrganizationId: input.workosOrganizationId,
	});
	if (existingMember?.status === 'active') {
		return { ok: true, invitation: null };
	}

	try {
		return { ok: true, invitation: await auth.sendOrganizationInvitation(input) };
	} catch (error) {
		return {
			ok: false,
			reason: error instanceof Error ? error.message : 'WorkOS rejected the invitation.',
		};
	}
}

/**
 * Everything that must be true of the agency and the named profile before
 * WorkOS is touched at all.
 *
 * Grouped because they share a consequence: each is a refusal the caller can
 * act on, and none of them should happen after an invitation has gone out. A
 * profile rejected here is why the WorkOS call is not made — sending first and
 * validating second would leave an invitation nobody can accept into a
 * membership.
 */
async function resolveInviteTarget(
	db: AdminInvitationDb,
	organizationId: string,
	payload: InvitePayload,
): Promise<
	| { readonly ok: true; readonly workosOrganizationId: string }
	| { readonly ok: false; readonly code: string; readonly status: 404 | 409 }
> {
	const organization = await getOperatorOrganization(db, organizationId);
	if (organization === null) {
		return { ok: false, code: 'organization_not_found', status: 404 };
	}

	if (organization.workosOrganizationId === null) {
		return { ok: false, code: 'workos_organization_required', status: 409 };
	}

	if (payload.profileId !== null) {
		try {
			await assertOrganizationProfileCanBeInvited(db, {
				organizationId,
				profileId: payload.profileId,
				email: payload.email,
			});
		} catch (error) {
			if (error instanceof StageOrganizationInvitationError) {
				return {
					ok: false,
					code: error.code,
					status: error.code === 'profile_not_found' ? 404 : 409,
				};
			}

			throw error;
		}
	}

	return { ok: true, workosOrganizationId: organization.workosOrganizationId };
}

interface InvitePayload {
	readonly email: string;
	readonly role: SimmerRole;
	readonly displayName: string | null;
	readonly profileId: string | null;
}

type InvitePayloadResult =
	| {
			readonly ok: true;
			readonly payload: InvitePayload;
	  }
	| {
			readonly ok: false;
			readonly reason: string;
	  };

async function readInvitePayload(request: {
	readonly json: () => Promise<unknown>;
}): Promise<InvitePayloadResult> {
	let raw: unknown;
	try {
		raw = await request.json();
	} catch {
		return {
			ok: false,
			reason: 'Request body must be JSON.',
		};
	}

	if (!isRecord(raw)) {
		return {
			ok: false,
			reason: 'Request body must be an object.',
		};
	}

	const email = readRequiredText(raw.email);
	if (email === null || !email.includes('@')) {
		return {
			ok: false,
			reason: 'email is required.',
		};
	}

	const role = readRole(raw.role);
	if (role === null) {
		return {
			ok: false,
			reason: 'role must be owner, admin, manager, collector, or viewer.',
		};
	}

	return {
		ok: true,
		payload: {
			email,
			role,
			displayName: readOptionalText(raw.displayName),
			profileId: readOptionalText(raw.profileId),
		},
	};
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

function toAdminMembershipResponse(membership: SafeOrganizationMembership) {
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
