import { serve } from '@hono/node-server';
import { createWorkOsAuth, WORKOS_SESSION_COOKIE_NAME } from '@simmer-mosquito/auth';
import {
	createDb,
	getOperatorOrganization,
	listOperatorOrganizations,
	listOrganizationMemberships,
	type OrganizationSubscriptionStatus,
	resolveActiveLocalAuthIdentity,
	type SafeOrganization,
	type SafeOrganizationMembership,
	upsertOperatorOrganization,
	upsertWorkOsIdentity,
} from '@simmer-mosquito/db';
import { Hono } from 'hono';
import { deleteCookie, getCookie, setCookie } from 'hono/cookie';
import { cors } from 'hono/cors';
import { registerAdminFoundationRoutes } from './admin-foundations.js';
import { registerAdminInvitationRoutes } from './admin-invitations.js';
import {
	resolveAuthContext,
	toAuthFailureBody,
	toAuthMeBody,
	toPublicAuthContext,
} from './auth-context.js';
import {
	type AuthVariables,
	createAuthContextMiddleware,
	createOperatorAuthContextMiddleware,
} from './auth-middleware.js';
import { registerControlAssetCommandRoutes } from './control-asset-commands.js';
import { registerControlMethodCommandRoutes } from './control-method-commands.js';
import { registerControlProductCommandRoutes } from './control-product-commands.js';
import { ADMIN_CORS_ALLOW_METHODS } from './cors-options.js';
import { readServerEnv } from './env.js';
import { registerFoundationCommandRoutes } from './foundation-commands.js';
import { registerGeocoderRoutes } from './geocoder.js';
import { registerLarvalSurveillanceCommandRoutes } from './larval-surveillance-commands.js';
import { registerMapTileRoutes } from './map-tiles.js';
import { registerOrganizationCommandRoutes } from './organization-commands.js';
import { registerOrganizationSettingsCommandRoutes } from './organization-settings-commands.js';
import { registerProfileCommandRoutes } from './profile-commands.js';
import { registerPublicEngagementCommandRoutes } from './public-engagement-commands.js';
import { registerSyncShapeRoutes } from './sync-shapes.js';

const env = readServerEnv();
const auth = createWorkOsAuth({
	apiKey: env.workosApiKey,
	clientId: env.workosClientId,
	cookiePassword: env.workosCookiePassword,
	redirectUri: env.workosRedirectUri,
});
const db = createDb({
	databaseUrl: env.databaseUrl,
});

const app = new Hono<{ Variables: AuthVariables }>();
const localIdentityResolver = {
	resolveActiveLocalAuthIdentity: (input: {
		readonly workosUserId: string;
		readonly workosOrganizationId: string;
	}) => resolveActiveLocalAuthIdentity(db, input),
};
const authContextMiddleware = createAuthContextMiddleware({
	auth,
	localIdentityResolver,
	setAuthCookie,
});
const operatorAuthContextMiddleware = createOperatorAuthContextMiddleware({
	auth,
	localIdentityResolver,
	isOperatorEmail,
	setAuthCookie,
});

app.use(
	'/auth/*',
	cors({
		origin: allowedCorsOrigins(),
		credentials: true,
		allowMethods: ['GET', 'POST', 'OPTIONS'],
	}),
);

app.use(
	'/admin/*',
	cors({
		origin: allowedCorsOrigins(),
		credentials: true,
		allowMethods: ADMIN_CORS_ALLOW_METHODS,
	}),
);

app.use(
	'/sync/*',
	cors({
		origin: allowedCorsOrigins(),
		credentials: true,
		allowMethods: ['GET', 'OPTIONS'],
	}),
);

app.use(
	'/map/*',
	cors({
		origin: allowedCorsOrigins(),
		credentials: true,
		allowMethods: ['GET', 'OPTIONS'],
	}),
);

app.use(
	'/geocoder/*',
	cors({
		origin: allowedCorsOrigins(),
		credentials: true,
		allowMethods: ['GET', 'OPTIONS'],
	}),
);

app.use(
	'/foundation/*',
	cors({
		origin: allowedCorsOrigins(),
		credentials: true,
		allowMethods: ['POST', 'PATCH', 'DELETE', 'OPTIONS'],
	}),
);

app.use(
	'/control-methods/*',
	cors({
		origin: allowedCorsOrigins(),
		credentials: true,
		allowMethods: ['POST', 'PATCH', 'DELETE', 'OPTIONS'],
	}),
);

app.use(
	'/control-assets/*',
	cors({
		origin: allowedCorsOrigins(),
		credentials: true,
		allowMethods: ['POST', 'PATCH', 'DELETE', 'OPTIONS'],
	}),
);

app.use(
	'/control-products/*',
	cors({
		origin: allowedCorsOrigins(),
		credentials: true,
		allowMethods: ['POST', 'PATCH', 'DELETE', 'OPTIONS'],
	}),
);

app.use(
	'/organization-settings/*',
	cors({
		origin: allowedCorsOrigins(),
		credentials: true,
		allowMethods: ['PATCH', 'OPTIONS'],
	}),
);

app.use(
	'/public-engagement/*',
	cors({
		origin: allowedCorsOrigins(),
		credentials: true,
		allowMethods: ['POST', 'PATCH', 'DELETE', 'OPTIONS'],
	}),
);

app.use(
	'/larval-surveillance/*',
	cors({
		origin: allowedCorsOrigins(),
		credentials: true,
		allowMethods: ['POST', 'PATCH', 'DELETE', 'OPTIONS'],
	}),
);

app.use(
	'/organization/*',
	cors({
		origin: allowedCorsOrigins(),
		credentials: true,
		allowMethods: ['POST', 'PATCH', 'OPTIONS'],
	}),
);

app.get('/health', (context) =>
	context.json({
		ok: true,
		service: 'simmer-mosquito-server',
		environment: env.nodeEnv,
	}),
);

app.get('/auth/login', (context) => {
	const returnTo = readAllowedReturnTo(context.req.query('returnTo'));
	const authorizationUrl = new URL(auth.getAuthorizationUrl());
	if (returnTo !== null) {
		authorizationUrl.searchParams.set('state', returnTo);
	}

	return context.redirect(authorizationUrl.toString());
});

app.get('/auth/callback', async (context) => {
	const code = context.req.query('code');

	if (code === undefined || code.trim() === '') {
		return context.json({ error: 'missing_code' }, 400);
	}

	const ipAddress = context.req.header('x-forwarded-for');
	const userAgent = context.req.header('user-agent');
	const session = await auth.authenticateCode({
		code,
		...(ipAddress === undefined ? {} : { ipAddress }),
		...(userAgent === undefined ? {} : { userAgent }),
	});

	const organization = await auth.getOrganization(session.workosOrganizationId);
	const localIdentity = await upsertWorkOsIdentity(db, {
		...session.user,
		workosOrganizationId: session.workosOrganizationId,
		workosOrganizationName: organization?.name ?? null,
		workosRole: session.role,
	});

	setAuthCookie(context, session.sealedSession);

	const redirectUrl = new URL(readAllowedReturnTo(context.req.query('state')) ?? env.appOrigin);
	if (localIdentity.organizationId === null) {
		redirectUrl.searchParams.set('auth', 'organization_required');
	}

	return context.redirect(redirectUrl.toString());
});

app.get('/auth/me', async (context) => {
	const result = await resolveAuthContext({
		sealedSession: getCookie(context, WORKOS_SESSION_COOKIE_NAME),
		auth,
		localIdentityResolver,
	});

	if (result.sealedSession !== undefined) {
		setAuthCookie(context, result.sealedSession);
	}

	if (!result.ok) {
		return context.json(toAuthFailureBody(result), result.status);
	}

	return context.json(toAuthMeBody(result.context));
});

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

registerAdminInvitationRoutes(app, {
	db,
	auth,
	operatorAuthContextMiddleware,
});

registerAdminFoundationRoutes(app, {
	db,
	operatorAuthContextMiddleware,
});

registerFoundationCommandRoutes(app, {
	db,
	authContextMiddleware,
});

registerControlMethodCommandRoutes(app, {
	db,
	authContextMiddleware,
});

registerControlAssetCommandRoutes(app, {
	db,
	authContextMiddleware,
});

registerControlProductCommandRoutes(app, {
	db,
	authContextMiddleware,
});

registerOrganizationCommandRoutes(app, {
	db,
	authContextMiddleware,
});

registerOrganizationSettingsCommandRoutes(app, {
	db,
	authContextMiddleware,
});

registerProfileCommandRoutes(app, {
	db,
	auth,
	authContextMiddleware,
});

registerPublicEngagementCommandRoutes(app, {
	db,
	authContextMiddleware,
});

registerLarvalSurveillanceCommandRoutes(app, {
	db,
	authContextMiddleware,
});

registerMapTileRoutes(app, {
	db,
	authContextMiddleware,
});

registerGeocoderRoutes(app, {
	apiKey: env.geocodioApiKey,
	authContextMiddleware,
});

registerSyncShapeRoutes(app, {
	electricUrl: env.electricUrl,
	authContextMiddleware,
	operatorAuthContextMiddleware,
});

if (env.nodeEnv !== 'production') {
	app.use(
		'/debug/*',
		cors({
			origin: allowedCorsOrigins(),
			credentials: true,
			allowMethods: ['GET', 'OPTIONS'],
		}),
	);

	app.get('/debug/auth-context', authContextMiddleware, (context) =>
		context.json(toPublicAuthContext(context.get('authContext'))),
	);
}

app.post('/auth/logout', async (context) => {
	const logoutUrl = await auth.getLogoutUrl(getCookie(context, WORKOS_SESSION_COOKIE_NAME));

	deleteCookie(context, WORKOS_SESSION_COOKIE_NAME, {
		path: '/',
	});

	return context.redirect(logoutUrl ?? env.appOrigin);
});

const server = serve(
	{
		fetch: app.fetch,
		hostname: env.host,
		port: env.port,
	},
	(info) => {
		console.log(`Server listening on http://${info.address}:${info.port}`);
	},
);

let isShuttingDown = false;
const shutdownTimeoutMs = env.nodeEnv === 'production' ? 5000 : 1000;

server.on('error', (error: NodeJS.ErrnoException) => {
	if (error.code === 'EADDRINUSE') {
		console.error(
			`Port ${env.port} is already in use. Stop the other server process or set PORT to a free port.`,
		);
		process.exit(1);
	}

	throw error;
});

function shutdown(signal: NodeJS.Signals): void {
	if (isShuttingDown) {
		return;
	}
	console.log(`Received ${signal}; closing server.`);

	const timeout = setTimeout(() => {
		console.error('Server shutdown timed out.');
		process.exit(1);
	}, shutdownTimeoutMs);
	timeout.unref();

	void closeServer()
		.then(() => {
			clearTimeout(timeout);
			process.exit(0);
		})
		.catch((error: unknown) => {
			console.error(error);
			process.exit(1);
		});
}

process.once('SIGINT', shutdown);
process.once('SIGTERM', shutdown);

export async function disposeServerForRestart(): Promise<void> {
	await closeServer();
}

async function closeServer(): Promise<void> {
	if (isShuttingDown) {
		return;
	}
	isShuttingDown = true;

	process.off('SIGINT', shutdown);
	process.off('SIGTERM', shutdown);
	closeOpenHttpConnectionsForShutdown();

	await new Promise<void>((resolve, reject) => {
		server.close((error) => {
			if (error !== undefined) {
				reject(error);
				return;
			}

			resolve();
		});
	});
	await db.destroy();
}

function closeOpenHttpConnectionsForShutdown(): void {
	const connectionCloser = server as {
		readonly closeAllConnections?: () => void;
		readonly closeIdleConnections?: () => void;
	};

	connectionCloser.closeIdleConnections?.();

	if (env.nodeEnv === 'production') {
		return;
	}

	connectionCloser.closeAllConnections?.();
}

function setAuthCookie(
	context: Parameters<typeof setCookie>[0],
	sealedSession: string | undefined,
): void {
	if (sealedSession === undefined) {
		return;
	}

	setCookie(context, WORKOS_SESSION_COOKIE_NAME, sealedSession, {
		httpOnly: true,
		maxAge: 60 * 60 * 24 * 30,
		path: '/',
		sameSite: 'Lax',
		secure: env.nodeEnv === 'production',
	});
}

function isOperatorEmail(email: string): boolean {
	return env.simmerOperatorEmails.includes(email.trim().toLowerCase());
}

function readAllowedReturnTo(value: string | undefined): string | null {
	if (value === undefined || value.trim() === '') {
		return null;
	}

	try {
		const url = new URL(value);
		return env.appOrigins.includes(url.origin) ? url.toString() : null;
	} catch {
		return null;
	}
}

function allowedCorsOrigins(): string[] {
	return [...env.appOrigins];
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

	if (value === 'trial' || value === 'active' || value === 'suspended' || value === 'canceled') {
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
