/**
 * The three operator routes that create and read organizations.
 *
 * They sit beside `admin-invitations.ts` and `admin-foundations.ts`, which is
 * where the rest of `/admin/*` already lives, and they were the last of the
 * operator console written inline in `main.ts`. A route in a module is a route
 * the CORS walk reads, which is #280.
 *
 * `POST /admin/organizations` writes in two systems: WorkOS creates the
 * organization and `upsertOperatorOrganization` records it here. WorkOS goes
 * first, because its id is what the SIMMER row is keyed by, and a WorkOS
 * organization with no SIMMER row is a state an operator can see and retry from.
 */

import {
	getOperatorOrganization,
	type Kysely,
	listOperatorOrganizations,
	listOrganizationMemberships,
	type OrganizationSubscriptionStatus,
	type SafeOrganization,
	type SafeOrganizationMembership,
	type SimmerDatabase,
	upsertOperatorOrganization,
} from '@simmer-mosquito/db';
import { ORGANIZATION_SUBSCRIPTION_STATUSES } from '@simmer-mosquito/domain';
import type { Hono, MiddlewareHandler } from 'hono';
import type { AuthVariables } from './auth-middleware.js';
import { isRecord } from './command-payload.js';

/** What creating an organization needs of the WorkOS client. */
export interface OperatorOrganizationAuth {
	createOrganization(input: {
		readonly name: string;
	}): Promise<{ readonly workosOrganizationId: string; readonly name: string }>;
}

export function registerOperatorOrganizationRoutes(
	app: Hono<{ Variables: AuthVariables }>,
	options: {
		readonly db: Kysely<SimmerDatabase>;
		readonly auth: OperatorOrganizationAuth;
		readonly operatorAuthContextMiddleware: MiddlewareHandler<{ Variables: AuthVariables }>;
	},
): void {
	const { db, auth, operatorAuthContextMiddleware } = options;

	app.get('/admin/organizations', operatorAuthContextMiddleware, async (context) => {
		const organizations = await listOperatorOrganizations(db);

		return context.json({
			organizations: organizations.map(toAdminOrganizationResponse),
		});
	});

	app.post('/admin/organizations', operatorAuthContextMiddleware, async (context) => {
		const operatorContext = context.get('operatorContext');
		const payloadResult = await readCreateOrganizationPayload(context.req);
		if (!payloadResult.ok) {
			return context.json(
				{
					error: 'invalid_payload',
					reason: payloadResult.reason,
				},
				400,
			);
		}

		const workosOrganization = await auth.createOrganization({
			name: payloadResult.payload.name,
		});

		const organization = await upsertOperatorOrganization(db, {
			workosOrganizationId: workosOrganization.workosOrganizationId,
			name: workosOrganization.name,
			slug: payloadResult.payload.slug,
			subscriptionStatus: payloadResult.payload.subscriptionStatus,
			billingMode: 'manual_invoice',
			billingContactName: payloadResult.payload.billingContactName,
			billingContactEmail: payloadResult.payload.billingContactEmail,
			subscriptionNotes: payloadResult.payload.subscriptionNotes,
			contact: payloadResult.payload.contact,
			...(payloadResult.payload.linkRequesterAsOwner && operatorContext.localIdentity !== null
				? {
						ownerUserId: operatorContext.localIdentity.user.id,
						ownerDisplayName: operatorContext.localIdentity.user.displayName,
						ownerEmail: operatorContext.localIdentity.user.email,
					}
				: {}),
		});

		return context.json(toAdminOrganizationResponse(organization), 201);
	});

	app.get(
		'/admin/organizations/:organizationId/memberships',
		operatorAuthContextMiddleware,
		async (context) => {
			const organizationId = context.req.param('organizationId');
			const organization = await getOperatorOrganization(db, organizationId);
			if (organization === null) {
				return context.json({ error: 'organization_not_found' }, 404);
			}

			const memberships = await listOrganizationMemberships(db, organizationId);

			return context.json({
				organization: toAdminOrganizationResponse(organization),
				memberships: memberships.map(toAdminMembershipResponse),
			});
		},
	);
}

interface CreateOrganizationPayload {
	readonly name: string;
	readonly slug: string | null;
	readonly subscriptionStatus: OrganizationSubscriptionStatus;
	readonly billingContactName: string | null;
	readonly billingContactEmail: string | null;
	readonly subscriptionNotes: string | null;
	readonly contact: {
		readonly mainContactEmail: string | null;
		readonly phoneNumber: string | null;
		readonly mailingCountry: string | null;
		readonly mailingAddressLine1: string | null;
		readonly mailingAddressLine2: string | null;
		readonly mailingLocality: string | null;
		readonly mailingRegion: string | null;
		readonly mailingPostalCode: string | null;
	};
	readonly linkRequesterAsOwner: boolean;
}

type PayloadResult =
	| {
			readonly ok: true;
			readonly payload: CreateOrganizationPayload;
	  }
	| {
			readonly ok: false;
			readonly reason: string;
	  };

async function readCreateOrganizationPayload(request: {
	readonly json: () => Promise<unknown>;
}): Promise<PayloadResult> {
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

	const name = readRequiredText(raw.name);
	if (name === null) {
		return {
			ok: false,
			reason: 'name is required.',
		};
	}

	const subscriptionStatus = readSubscriptionStatus(raw.subscriptionStatus);
	if (subscriptionStatus === null) {
		return {
			ok: false,
			reason: 'subscriptionStatus must be trial, active, suspended, or canceled.',
		};
	}

	const billingMode = readOptionalText(raw.billingMode) ?? 'manual_invoice';
	if (billingMode !== 'manual_invoice') {
		return {
			ok: false,
			reason: 'billingMode must be manual_invoice.',
		};
	}

	return {
		ok: true,
		payload: {
			name,
			slug: readOptionalText(raw.slug),
			subscriptionStatus,
			billingContactName: readOptionalText(raw.billingContactName),
			billingContactEmail: readOptionalText(raw.billingContactEmail),
			subscriptionNotes: readOptionalText(raw.subscriptionNotes),
			contact: {
				mainContactEmail: readOptionalText(raw.mainContactEmail),
				phoneNumber: readOptionalText(raw.phoneNumber),
				mailingCountry: readOptionalText(raw.mailingCountry)?.toUpperCase() ?? null,
				mailingAddressLine1: readOptionalText(raw.mailingAddressLine1),
				mailingAddressLine2: readOptionalText(raw.mailingAddressLine2),
				mailingLocality: readOptionalText(raw.mailingLocality),
				mailingRegion: readOptionalText(raw.mailingRegion),
				mailingPostalCode: readOptionalText(raw.mailingPostalCode),
			},
			linkRequesterAsOwner: raw.linkRequesterAsOwner === true,
		},
	};
}

function readSubscriptionStatus(value: unknown): OrganizationSubscriptionStatus | null {
	if (value === undefined || value === null || value === '') {
		return 'trial';
	}

	if (ORGANIZATION_SUBSCRIPTION_STATUSES.includes(value as OrganizationSubscriptionStatus)) {
		return value as OrganizationSubscriptionStatus;
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

function toAdminOrganizationResponse(organization: SafeOrganization) {
	return {
		id: organization.id,
		workosOrganizationId: organization.workosOrganizationId,
		name: organization.name,
		slug: organization.slug,
		subscription: organization.subscription,
		contact: organization.contact,
		ownerLinked: organization.ownerLinked,
		createdAt: organization.createdAt,
		updatedAt: organization.updatedAt,
	};
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
