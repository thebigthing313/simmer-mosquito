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
 * Every payload rule is checked before WorkOS is called, so a detail the insert
 * or the details builder would refuse never leaves that state behind (#1524).
 */

import type { WorkOsIdentityWrites } from '@simmer-mosquito/auth';
import {
	getOperatorOrganization,
	type Kysely,
	listOperatorOrganizations,
	listOrganizationMemberships,
	type OrganizationContactInfo,
	type OrganizationSubscriptionStatus,
	type SafeOrganization,
	type SafeOrganizationMembership,
	type SimmerDatabase,
	upsertOperatorOrganization,
} from '@simmer-mosquito/db';
import {
	normalizeOrganizationBillingContact,
	normalizeOrganizationContactDetails,
	ORGANIZATION_CONTACT_DETAIL_KEYS,
	ORGANIZATION_SUBSCRIPTION_STATUSES,
	type OrganizationContactDetailKey,
} from '@simmer-mosquito/domain';
import type { Hono, MiddlewareHandler } from 'hono';
import type { AuthVariables } from './auth-middleware.js';
import { isRecord } from './command-payload.js';

/** What creating an organization needs of the WorkOS client. */
export type OperatorOrganizationAuth = Pick<WorkOsIdentityWrites, 'createOrganization'>;

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
	readonly contact: CreateOrganizationContact;
	readonly linkRequesterAsOwner: boolean;
}

/**
 * Every contact detail the domain names, each text or `null`.
 *
 * A `Pick` from the insert's contact type rather than a mapped type over the
 * key, because `Pick` requires each key to be one of the insert's. A detail
 * added to the domain's limits table then fails `tsc` here, at the column the
 * insert has not got, rather than compiling and being dropped on the way in.
 */
type CreateOrganizationContact = Pick<OrganizationContactInfo, OrganizationContactDetailKey>;

/** A request body once `wrongTypeReason` has passed: each text field a string or absent. */
type CreateOrganizationBody = Readonly<Record<string, unknown>> & {
	readonly [K in TextField]?: string | null;
};

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

	const wrongType = wrongTypeReason(raw);
	if (wrongType !== null) {
		return {
			ok: false,
			reason: wrongType,
		};
	}
	// `wrongTypeReason` has refused every text field present as anything but a
	// string, and the flag as anything but a boolean, so this is what the body is.
	const body = raw as CreateOrganizationBody;

	const name = readRequiredText(body.name);
	if (name === null) {
		return {
			ok: false,
			reason: 'name is required.',
		};
	}

	const subscriptionStatus = readSubscriptionStatus(body.subscriptionStatus);
	if (subscriptionStatus === null) {
		return {
			ok: false,
			reason: 'subscriptionStatus must be trial, active, suspended, or canceled.',
		};
	}

	const billingMode = readOptionalText(body.billingMode) ?? 'manual_invoice';
	if (billingMode !== 'manual_invoice') {
		return {
			ok: false,
			reason: 'billingMode must be manual_invoice.',
		};
	}

	const contact = readContactPayload(body);
	if (!contact.ok) {
		return contact;
	}

	return {
		ok: true,
		payload: {
			name,
			slug: readOptionalText(body.slug),
			subscriptionStatus,
			billingContactName: contact.billingContactName,
			billingContactEmail: contact.billingContactEmail,
			subscriptionNotes: readOptionalText(body.subscriptionNotes),
			contact: contact.contact,
			linkRequesterAsOwner: body.linkRequesterAsOwner === true,
		},
	};
}

/**
 * The fields a create reads as text, `name` first.
 *
 * The contact details are the domain's list rather than a copy of it, so a
 * detail the create reads is a detail this checks the type of.
 */
const TEXT_FIELDS = [
	'name',
	'slug',
	'billingMode',
	'billingContactName',
	'billingContactEmail',
	'subscriptionNotes',
	...ORGANIZATION_CONTACT_DETAIL_KEYS,
] as const;

type TextField = (typeof TEXT_FIELDS)[number];

/**
 * The refusal for the first field present with a value of the wrong type, or
 * `null` when every field is absent or of its type.
 *
 * It runs before anything reads the body, because `readOptionalText` answers
 * `null` for a missing value and for a value of the wrong type alike, and a
 * create used to store `mailingCountry: 123` as no country and answer 201
 * (#1549). `undefined` and `null` are absent for every field, the flag
 * included, so once this passes the flag is `true` or not sent.
 */
function wrongTypeReason(raw: Record<string, unknown>): string | null {
	const field = TEXT_FIELDS.find((name) => isPresent(raw[name]) && typeof raw[name] !== 'string');
	if (field !== undefined) {
		return `${field} must be text.`;
	}

	const flag = raw.linkRequesterAsOwner;
	return isPresent(flag) && typeof flag !== 'boolean'
		? 'linkRequesterAsOwner must be true or false.'
		: null;
}

function isPresent(value: unknown): boolean {
	return value !== undefined && value !== null;
}

/** Every contact detail a create carries, `null` until one arrives. */
const NO_CONTACT = Object.fromEntries(
	ORGANIZATION_CONTACT_DETAIL_KEYS.map((key) => [key, null]),
) as CreateOrganizationContact;

/**
 * The contact details and the billing contact, checked.
 *
 * Both are held to the domain's rules rather than written again here, so a
 * create cannot store what an edit would refuse, and the billing email is
 * refused with the message the Main contact's email gets. The billing contact is a second call
 * because the details builder does not carry it. Refusing at this point is what
 * keeps WorkOS from being asked first for a row the insert would reject.
 */
function readContactPayload(body: CreateOrganizationBody):
	| {
			readonly ok: true;
			readonly contact: CreateOrganizationPayload['contact'];
			readonly billingContactName: string | null;
			readonly billingContactEmail: string | null;
	  }
	| { readonly ok: false; readonly reason: string } {
	const { details, issues } = normalizeOrganizationContactDetails(
		Object.fromEntries(
			ORGANIZATION_CONTACT_DETAIL_KEYS.map((key) => [key, readOptionalText(body[key])]),
		),
	);
	const billing = normalizeOrganizationBillingContact({
		billingContactName: readOptionalText(body.billingContactName),
		billingContactEmail: readOptionalText(body.billingContactEmail),
	});
	const refusals = [...issues, ...billing.issues];
	if (refusals.length > 0) {
		return { ok: false, reason: refusals.map((issue) => issue.message).join(' ') };
	}

	return {
		ok: true,
		contact: { ...NO_CONTACT, ...details },
		billingContactName: billing.contact.billingContactName ?? null,
		billingContactEmail: billing.contact.billingContactEmail ?? null,
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

function readRequiredText(value: string | null | undefined): string | null {
	const text = readOptionalText(value);
	return text === null ? null : text;
}

function readOptionalText(value: string | null | undefined): string | null {
	if (value === undefined || value === null) {
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
