/**
 * `POST /admin/organizations` refuses a contact detail before WorkOS is called.
 *
 * The route writes in two systems and WorkOS goes first, so a detail the insert
 * cannot store, or one the details builder would refuse, used to leave a WorkOS
 * organization with no SIMMER row behind it (#1524). Every case here asserts
 * the WorkOS half was never reached, through a stub that records the call
 * rather than a client that could make one (ADR 0017).
 *
 * A field sent as the wrong type is refused the same way, rather than read as
 * absent and stored as `null` (#1549).
 */

import type { AuthUser } from '@simmer-mosquito/auth';
import { ORGANIZATION_CONTACT_DETAIL_KEYS } from '@simmer-mosquito/domain';
import { Hono } from 'hono';
import { createMiddleware } from 'hono/factory';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AuthVariables, OperatorAuthContext } from '../../auth-middleware.js';
import {
	type OperatorOrganizationAuth,
	registerOperatorOrganizationRoutes,
} from '../../operator-organization-routes.js';

const dbMock = vi.hoisted(() => ({
	getOperatorOrganization: vi.fn(),
	listOperatorOrganizations: vi.fn(),
	listOrganizationMemberships: vi.fn(),
	upsertOperatorOrganization: vi.fn(),
}));

vi.mock('@simmer-mosquito/db', () => dbMock);

/** Every contact detail the domain names, each `null`. */
const NO_CONTACT = Object.fromEntries(ORGANIZATION_CONTACT_DETAIL_KEYS.map((key) => [key, null]));

const operatorUser: AuthUser = {
	workosUserId: 'workos_user_operator',
	email: 'operator@example.com',
	firstName: 'Opal',
	lastName: 'Operator',
	displayName: 'Opal Operator',
	emailVerified: true,
	profilePictureUrl: null,
};

const operatorContext: OperatorAuthContext = {
	workosUser: operatorUser,
	workosOrganizationId: null,
	workosSessionId: 'session-1',
	workosRole: null,
	localIdentity: null,
};

describe('POST /admin/organizations', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		dbMock.upsertOperatorOrganization.mockImplementation(async (_db, input) => ({
			id: 'org-1',
			workosOrganizationId: input.workosOrganizationId,
			name: input.name,
			slug: input.slug,
			subscription: {
				subscriptionStatus: input.subscriptionStatus,
				billingMode: input.billingMode,
				billingContactName: input.billingContactName,
				billingContactEmail: input.billingContactEmail,
				subscriptionNotes: input.subscriptionNotes,
			},
			contact: input.contact,
			ownerLinked: false,
			createdAt: new Date('2026-10-01T00:00:00.000Z'),
			updatedAt: new Date('2026-10-01T00:00:00.000Z'),
		}));
	});

	it.each([
		['mainContactEmail', 'not-an-email', 'mainContactEmail must be a valid email address.'],
		['mailingCountry', 'USA', 'mailingCountry'],
		['mailingCountry', 'CA', 'mailingCountry must be US.'],
		['mailingRegion', 'New Jersey', 'mailingRegion'],
		['mailingRegion', 'XX', 'mailingRegion must be a US state code.'],
		['phoneNumber', '5'.repeat(51), 'phoneNumber must be 50 characters or fewer.'],
		['mailingPostalCode', '0'.repeat(21), 'mailingPostalCode'],
		['billingContactEmail', 'billing', 'billingContactEmail must be a valid email address.'],
		[
			'billingContactEmail',
			emailOfLength(321),
			'billingContactEmail must be 320 characters or fewer.',
		],
		['billingContactName', 'N'.repeat(201), 'billingContactName must be 200 characters or fewer.'],
	])('refuses %s %j before WorkOS is called', async (field, value, reason) => {
		const auth = createFakeAuth();
		const response = await postOrganization(auth, { name: 'County Mosquito', [field]: value });

		expect(response.status).toBe(400);
		const body = (await response.json()) as { error: string; reason: string };
		expect(body.error).toBe('invalid_payload');
		expect(body.reason).toContain(reason);
		expect(auth.createOrganization).not.toHaveBeenCalled();
		expect(dbMock.upsertOperatorOrganization).not.toHaveBeenCalled();
	});

	it.each([
		['mailingCountry', 123],
		['billingContactEmail', 123],
		['billingMode', 123],
		['slug', {}],
		['billingContactName', true],
		['subscriptionNotes', ['notes']],
		['mainContactEmail', 0],
		['mailingPostalCode', 8701],
	])('refuses %s sent as %j rather than storing it as absent', async (field, value) => {
		const auth = createFakeAuth();
		const response = await postOrganization(auth, { name: 'County Mosquito', [field]: value });

		expect(response.status).toBe(400);
		const body = (await response.json()) as { error: string; reason: string };
		expect(body.error).toBe('invalid_payload');
		expect(body.reason).toBe(`${field} must be text.`);
		expect(auth.createOrganization).not.toHaveBeenCalled();
		expect(dbMock.upsertOperatorOrganization).not.toHaveBeenCalled();
	});

	it('refuses a name that is not text as not text, rather than as missing', async () => {
		const auth = createFakeAuth();
		const response = await postOrganization(auth, { name: 123 });

		expect(response.status).toBe(400);
		const body = (await response.json()) as { error: string; reason: string };
		expect(body).toEqual({ error: 'invalid_payload', reason: 'name must be text.' });
		expect(auth.createOrganization).not.toHaveBeenCalled();
	});

	it('still refuses a blank name as required', async () => {
		const auth = createFakeAuth();
		const response = await postOrganization(auth, { name: '  ' });

		expect(response.status).toBe(400);
		const body = (await response.json()) as { reason: string };
		expect(body.reason).toBe('name is required.');
		expect(auth.createOrganization).not.toHaveBeenCalled();
	});

	it.each([
		['yes'],
		[1],
		['true'],
		[{}],
	])('refuses linkRequesterAsOwner sent as %j', async (value) => {
		const auth = createFakeAuth();
		const response = await postOrganization(auth, {
			name: 'County Mosquito',
			linkRequesterAsOwner: value,
		});

		expect(response.status).toBe(400);
		const body = (await response.json()) as { error: string; reason: string };
		expect(body).toEqual({
			error: 'invalid_payload',
			reason: 'linkRequesterAsOwner must be true or false.',
		});
		expect(auth.createOrganization).not.toHaveBeenCalled();
		expect(dbMock.upsertOperatorOrganization).not.toHaveBeenCalled();
	});

	it.each([
		['false', { linkRequesterAsOwner: false }],
		['null', { linkRequesterAsOwner: null }],
		['absent', {}],
	])('creates with linkRequesterAsOwner %s', async (_label, flag) => {
		const auth = createFakeAuth();
		const response = await postOrganization(auth, { name: 'County Mosquito', ...flag });

		expect(response.status).toBe(201);
		expect(auth.createOrganization).toHaveBeenCalledWith({ name: 'County Mosquito' });
	});

	it('stores null for every optional field sent as null', async () => {
		const auth = createFakeAuth();
		const response = await postOrganization(auth, {
			name: 'County Mosquito',
			slug: null,
			billingMode: null,
			billingContactName: null,
			billingContactEmail: null,
			subscriptionNotes: null,
			mainContactEmail: null,
			phoneNumber: null,
			mailingCountry: null,
			mailingAddressLine1: null,
			mailingAddressLine2: null,
			mailingLocality: null,
			mailingRegion: null,
			mailingPostalCode: null,
		});

		expect(response.status).toBe(201);
		expect(dbMock.upsertOperatorOrganization).toHaveBeenCalledWith(
			expect.anything(),
			expect.objectContaining({
				slug: null,
				billingMode: 'manual_invoice',
				billingContactName: null,
				billingContactEmail: null,
				subscriptionNotes: null,
				contact: NO_CONTACT,
			}),
		);
	});

	it('creates from the body the admin create form sends', async () => {
		const auth = createFakeAuth();
		const response = await postOrganization(auth, {
			name: 'County Mosquito',
			subscriptionStatus: 'trial',
			billingContactName: '',
			billingContactEmail: '',
			subscriptionNotes: '',
			mainContactEmail: 'ops@example.org',
			phoneNumber: '',
			mailingCountry: 'US',
			mailingAddressLine1: '1 Main St',
			mailingAddressLine2: '',
			mailingLocality: 'Trenton',
			mailingRegion: 'NJ',
			mailingPostalCode: '08601',
			linkRequesterAsOwner: true,
		});

		expect(response.status).toBe(201);
		expect(auth.createOrganization).toHaveBeenCalledWith({ name: 'County Mosquito' });
		expect(dbMock.upsertOperatorOrganization).toHaveBeenCalledWith(
			expect.anything(),
			expect.objectContaining({
				billingContactName: null,
				contact: expect.objectContaining({ mailingLocality: 'Trenton', phoneNumber: null }),
			}),
		);
	});

	it('stores a lower-case state code and country upper-cased', async () => {
		const auth = createFakeAuth();
		const response = await postOrganization(auth, {
			name: 'County Mosquito',
			mailingRegion: 'nj',
			mailingCountry: 'us',
		});

		expect(response.status).toBe(201);
		expect(dbMock.upsertOperatorOrganization).toHaveBeenCalledWith(
			expect.anything(),
			expect.objectContaining({
				contact: expect.objectContaining({ mailingRegion: 'NJ', mailingCountry: 'US' }),
			}),
		);
	});

	it('stores a create carrying only a name with every contact detail null', async () => {
		const auth = createFakeAuth();
		const response = await postOrganization(auth, { name: 'County Mosquito' });

		expect(response.status).toBe(201);
		expect(auth.createOrganization).toHaveBeenCalledWith({ name: 'County Mosquito' });
		const body = (await response.json()) as { contact: Record<string, unknown> };
		expect(body.contact).toEqual(NO_CONTACT);
		expect(dbMock.upsertOperatorOrganization).toHaveBeenCalledWith(
			expect.anything(),
			expect.objectContaining({ billingContactEmail: null }),
		);
	});

	it('stores blank details as null rather than refusing them', async () => {
		const auth = createFakeAuth();
		const response = await postOrganization(auth, {
			name: 'County Mosquito',
			mainContactEmail: '   ',
			mailingRegion: '',
			billingContactEmail: ' ',
		});

		expect(response.status).toBe(201);
		expect(dbMock.upsertOperatorOrganization).toHaveBeenCalledWith(
			expect.anything(),
			expect.objectContaining({
				billingContactEmail: null,
				contact: expect.objectContaining({ mainContactEmail: null, mailingRegion: null }),
			}),
		);
	});

	it('creates with a billing contact name of 200 characters and an address of 320', async () => {
		const auth = createFakeAuth();
		const billingContactName = 'N'.repeat(200);
		const billingContactEmail = emailOfLength(320);
		const response = await postOrganization(auth, {
			name: 'County Mosquito',
			billingContactName,
			billingContactEmail,
		});

		expect(response.status).toBe(201);
		expect(dbMock.upsertOperatorOrganization).toHaveBeenCalledWith(
			expect.anything(),
			expect.objectContaining({ billingContactName, billingContactEmail }),
		);
	});

	it('stores valid contact details as they arrived, trimmed', async () => {
		const auth = createFakeAuth();
		const response = await postOrganization(auth, {
			name: 'County Mosquito',
			mainContactEmail: ' Ops@Example.org ',
			billingContactEmail: 'billing@example.org',
			phoneNumber: '555-0100',
		});

		expect(response.status).toBe(201);
		expect(dbMock.upsertOperatorOrganization).toHaveBeenCalledWith(
			expect.anything(),
			expect.objectContaining({
				billingContactEmail: 'billing@example.org',
				contact: expect.objectContaining({
					mainContactEmail: 'Ops@Example.org',
					phoneNumber: '555-0100',
				}),
			}),
		);
	});
});

/** A valid address exactly `length` characters long. */
function emailOfLength(length: number): string {
	return `${'a'.repeat(length - '@example.org'.length)}@example.org`;
}

type FakeOrganizationAuth = OperatorOrganizationAuth & {
	readonly createOrganization: ReturnType<typeof vi.fn>;
};

function createFakeAuth(): FakeOrganizationAuth {
	return {
		createOrganization: vi.fn(async (input: { readonly name: string }) => ({
			workosOrganizationId: 'workos_org_1',
			name: input.name,
		})),
	} as FakeOrganizationAuth;
}

async function postOrganization(
	auth: OperatorOrganizationAuth,
	body: Record<string, unknown>,
): Promise<Response> {
	const app = new Hono<{ Variables: AuthVariables }>();
	app.use(
		'/admin/*',
		createMiddleware<{ Variables: AuthVariables }>(async (context, next) => {
			context.set('operatorContext', operatorContext);
			await next();
		}),
	);
	registerOperatorOrganizationRoutes(app, {
		db: {} as never,
		auth,
		operatorAuthContextMiddleware: createMiddleware(async (_context, next) => next()),
	});

	return app.request('/admin/organizations', {
		method: 'POST',
		body: JSON.stringify(body),
		headers: { 'content-type': 'application/json' },
	});
}
