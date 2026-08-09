import {
	assertOrganizationProfileCanBeInvited,
	createHistoricalProfileWithTxid,
	listOrganizationMemberships,
	type MutationWriteResult,
	type SafeOrganizationMembership,
	type SafeProfile,
	type SimmerRole,
	StageOrganizationInvitationError,
	stageOrganizationInvitation,
	updateOrganizationMembershipRoleWithTxid,
	updateProfileWithTxid,
} from '@simmer-mosquito/db';
import type { Context, Hono, MiddlewareHandler } from 'hono';
import type { AuthContext } from './auth-context.js';
import type { AuthVariables } from './auth-middleware.js';
import { isRecord } from './command-payload.js';
import { canGrantRole, forbidden, hasAtLeastRole } from './roles.js';

type ProfileCommandDb = Parameters<typeof createHistoricalProfileWithTxid>[0];

export interface ProfileInvitationAuth {
	sendOrganizationInvitation(input: {
		readonly email: string;
		readonly workosOrganizationId: string;
		readonly inviterWorkosUserId?: string;
	}): Promise<{
		readonly id: string;
		readonly email: string;
	}>;
}

export function registerProfileCommandRoutes(
	app: Hono<{ Variables: AuthVariables }>,
	options: {
		readonly db: ProfileCommandDb;
		readonly auth: ProfileInvitationAuth;
		readonly authContextMiddleware: MiddlewareHandler<{ Variables: AuthVariables }>;
	},
): void {
	app.post('/organization/profiles', options.authContextMiddleware, async (context) => {
		const authContext = context.get('authContext');
		const refusal = requirePeopleManager(context, authContext);
		if (refusal !== null) {
			return refusal;
		}

		const payloadResult = await readProfilePayload(context.req);
		if (!payloadResult.ok) {
			return context.json({ error: 'invalid_payload', reason: payloadResult.reason }, 400);
		}

		const result = await createHistoricalProfileWithTxid(options.db, {
			id: payloadResult.payload.id,
			organizationId: authContext.organization.id,
			displayName: payloadResult.payload.displayName,
			isActive: payloadResult.payload.isActive,
		});

		return context.json(toProfileWriteResponse(result), 201);
	});

	app.patch('/organization/profiles/:profileId', options.authContextMiddleware, async (context) => {
		const authContext = context.get('authContext');
		const refusal = requirePeopleManager(context, authContext);
		if (refusal !== null) {
			return refusal;
		}

		const payloadResult = await readProfilePayload(context.req);
		if (!payloadResult.ok) {
			return context.json({ error: 'invalid_payload', reason: payloadResult.reason }, 400);
		}

		const result = await updateProfileWithTxid(options.db, {
			id: context.req.param('profileId'),
			organizationId: authContext.organization.id,
			displayName: payloadResult.payload.displayName,
			isActive: payloadResult.payload.isActive,
		});
		if (result.row === null) {
			return context.json({ error: 'profile_not_found' }, 404);
		}

		return context.json(toProfileWriteResponse(result as MutationWriteResult<SafeProfile>));
	});

	app.post('/organization/memberships/list', options.authContextMiddleware, async (context) => {
		const authContext = context.get('authContext');
		const refusal = requirePeopleManager(context, authContext);
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
			const refusal = requireRoleManager(context, authContext);
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

	app.post('/organization/invitations', options.authContextMiddleware, async (context) => {
		const authContext = context.get('authContext');
		const refusal = requirePeopleManager(context, authContext);
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

		const invitation = await options.auth.sendOrganizationInvitation({
			email: payloadResult.payload.email,
			workosOrganizationId: authContext.organization.workosOrganizationId,
			inviterWorkosUserId: authContext.workosUser.workosUserId,
		});

		let membership: SafeOrganizationMembership;
		try {
			membership = await stageOrganizationInvitation(options.db, {
				organizationId: authContext.organization.id,
				...(payloadResult.payload.profileId === null
					? {}
					: { profileId: payloadResult.payload.profileId }),
				email: invitation.email,
				displayName: payloadResult.payload.displayName,
				role: payloadResult.payload.role,
				workosInvitationId: invitation.id,
			});
		} catch (error) {
			const errorResponse = invitationErrorResponse(context, error);
			if (errorResponse !== null) {
				return errorResponse;
			}
			throw error;
		}

		return context.json({ membership, txid: null }, 201);
	});
}

/**
 * The people floor: admin.
 *
 * An agency delegates onboarding — an office manager adding a seasonal crew is
 * the ordinary case, and making the owner the only person who can do it makes
 * the owner a bottleneck rather than a safeguard. What stays owner-only is
 * handing out a role, which is a different question and is refused separately.
 */
function requirePeopleManager(
	context: Context<{ Variables: AuthVariables }>,
	authContext: AuthContext,
) {
	return hasAtLeastRole(authContext.role, 'admin')
		? null
		: context.json(forbidden('Only organization owners and admins can manage people.'), 403);
}

/** The role floor: owner, because a settable role is a self-promotable one. */
function requireRoleManager(
	context: Context<{ Variables: AuthVariables }>,
	authContext: AuthContext,
) {
	return hasAtLeastRole(authContext.role, 'owner')
		? null
		: context.json(forbidden('Only organization owners can change a role.'), 403);
}

function toProfileWriteResponse(result: MutationWriteResult<SafeProfile>) {
	return {
		profile: {
			id: result.row.id,
			organizationId: result.row.organizationId,
			userId: result.row.userId,
			displayName: result.row.displayName,
			email: result.row.email,
			isActive: result.row.isActive,
			createdAt: result.row.createdAt,
			updatedAt: result.row.updatedAt,
		},
		txid: result.txid,
	};
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

interface ProfilePayload {
	readonly id: string;
	readonly displayName: string;
	readonly isActive: boolean;
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

async function readProfilePayload(request: {
	readonly json: () => Promise<unknown>;
}): Promise<PayloadResult<ProfilePayload>> {
	const raw = await readJsonObject(request);
	if (!raw.ok) {
		return raw;
	}

	const id = readRequiredText(raw.value.id);
	const displayName = readRequiredText(raw.value.displayName);
	if (id === null) {
		return { ok: false, reason: 'id is required.' };
	}
	if (displayName === null) {
		return { ok: false, reason: 'displayName is required.' };
	}

	return {
		ok: true,
		payload: {
			id,
			displayName,
			isActive: raw.value.isActive !== false,
		},
	};
}

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
