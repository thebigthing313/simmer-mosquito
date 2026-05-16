import {
	assertOrganizationProfileCanBeInvited,
	getOperatorOrganization,
	type SafeOrganizationMembership,
	type SimmerRole,
	StageOrganizationInvitationError,
	stageOrganizationInvitation,
} from '@simmer-mosquito/db';
import type { Context, Hono } from 'hono';
import type { AuthVariables, createOperatorAuthContextMiddleware } from './auth-middleware.js';

type AdminInvitationDb = Parameters<typeof getOperatorOrganization>[0];

export interface AdminInvitationAuth {
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
			const organization = await getOperatorOrganization(options.db, organizationId);
			if (organization === null) {
				return context.json({ error: 'organization_not_found' }, 404);
			}

			if (organization.workosOrganizationId === null) {
				return context.json({ error: 'workos_organization_required' }, 409);
			}

			if (payloadResult.payload.profileId !== null) {
				const errorResponse = await validateProfileInviteTarget(context, options.db, {
					organizationId,
					profileId: payloadResult.payload.profileId,
					email: payloadResult.payload.email,
				});
				if (errorResponse !== null) {
					return errorResponse;
				}
			}

			const invitation = await options.auth.sendOrganizationInvitation({
				email: payloadResult.payload.email,
				workosOrganizationId: organization.workosOrganizationId,
				inviterWorkosUserId: operatorContext.workosUser.workosUserId,
			});

			let membership: SafeOrganizationMembership;
			try {
				membership = await stageOrganizationInvitation(options.db, {
					organizationId,
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

			return context.json(
				{
					invitation: {
						id: invitation.id,
						email: invitation.email,
						state: invitation.state,
						organizationId: invitation.organizationId,
						acceptedUserId: invitation.acceptedUserId,
						expiresAt: invitation.expiresAt,
						createdAt: invitation.createdAt,
						updatedAt: invitation.updatedAt,
					},
					membership: toAdminMembershipResponse(membership),
				},
				201,
			);
		},
	);
}

async function validateProfileInviteTarget(
	context: Context<{ Variables: AuthVariables }>,
	db: AdminInvitationDb,
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

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
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
