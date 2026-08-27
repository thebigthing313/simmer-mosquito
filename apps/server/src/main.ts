import { serve } from '@hono/node-server';
import { type AuthenticatedSession, createWorkOsAuth } from '@simmer-mosquito/auth';
import {
	createDb,
	resolveActiveLocalAuthIdentity,
	upsertWorkOsIdentity,
} from '@simmer-mosquito/db';
import { Hono } from 'hono';
import type { setCookie } from 'hono/cookie';
import { cors } from 'hono/cors';
import { toPublicAuthContext } from './auth-context.js';
import { createAuthMailer } from './auth-email.js';
import {
	type AuthVariables,
	createAuthContextMiddleware,
	createOperatorAuthContextMiddleware,
} from './auth-middleware.js';
import { SESSION_RESPONSE_HEADER, writeSealedSession } from './auth-session-transport.js';
import { PRIVATE_READ_PREFIXES, privateNoStore } from './cache-headers.js';
import { CORS_SURFACES } from './cors-options.js';
import { createDevSessionProvider } from './dev-impersonation.js';
import { readServerEnv } from './env.js';
import { COMPRESSED_READ_PREFIXES, compressReads } from './response-compression.js';
import { registerAllRoutes } from './routes.js';

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
const authMailer = createAuthMailer({
	apiKey: env.resendApiKey,
	from: env.authEmailFrom,
	nodeEnv: env.nodeEnv,
});

const app = new Hono<{ Variables: AuthVariables }>();
const localIdentityResolver = {
	resolveActiveLocalAuthIdentity: (input: {
		readonly workosUserId: string;
		readonly workosOrganizationId: string;
	}) => resolveActiveLocalAuthIdentity(db, input),
};

// DEV-ONLY: when impersonation is configured (never in production — see env.ts),
// every request authenticates as a fixed WorkOS user + organization instead of
// validating the WorkOS session cookie. The real WorkOS `auth` object is kept
// for the login/callback routes; only the per-request session check is swapped.
const sessionProvider = env.devImpersonate ? createDevSessionProvider(env.devImpersonate) : auth;
if (env.devImpersonate) {
	console.warn(
		`[dev-impersonation] AUTH BYPASS ACTIVE — every request is authenticated as workosUserId=${env.devImpersonate.workosUserId} workosOrganizationId=${env.devImpersonate.workosOrganizationId}. Never use this against production.`,
	);
}

// A missing key does not stop the server, but it does silently turn address
// lookup off — and the failure only shows up as one form button not working, on
// a deployment nobody is watching the console of. Say it once at boot, where a
// platform log will keep it.
if (env.geocodioApiKey === null) {
	console.warn(
		'[geocoder] GEOCODIO_API_KEY is not set — /geocoder/search will answer 503 geocoder_not_configured and address lookup will be unavailable. Addresses can still be placed on the map by hand.',
	);
}

// The same reason as the geocoder key above, one level worse: unset, this does
// not turn off a button, it turns off the whole operator console. Every
// `/admin/*` route refuses, and every `operator`-kind command is denied, because
// there is no organization to compare a session against. That is the safe
// reading and it stays, but it should not be silent.
if (env.simmerOperatorOrganizationId === null) {
	console.warn(
		'[operator] SIMMER_OPERATOR_ORG_ID is not set — every /admin/* route will answer 403 operator_not_configured and no session can be an operator. Set it to the WorkOS organization that is SIMMER in this environment.',
	);
}

const authContextMiddleware = createAuthContextMiddleware({
	auth: sessionProvider,
	localIdentityResolver,
	operatorOrganizationId: env.simmerOperatorOrganizationId,
	setAuthCookie,
});
const operatorAuthContextMiddleware = createOperatorAuthContextMiddleware({
	auth: sessionProvider,
	localIdentityResolver,
	operatorOrganizationId: env.simmerOperatorOrganizationId,
	setAuthCookie,
});

// CORS is one table, applied in one loop. `cors-options.ts` explains why the
// table lives there and what checks it against the routes; the short version is
// that nineteen hand-maintained `app.use` blocks had already drifted from the
// paths the route modules register.
for (const surface of CORS_SURFACES) {
	app.use(
		surface.prefix,
		cors({
			origin: allowedCorsOrigins(),
			credentials: true,
			allowMethods: [...surface.methods],
			// A token client reads its rotated sealed session off the response.
			// React Native does not enforce CORS so the field app never needs this,
			// but Expo's web target runs the same code in a browser, where an
			// unexposed header is simply invisible.
			exposeHeaders: [SESSION_RESPONSE_HEADER],
		}),
	);
}

// The map and shape reads, gzipped. Registered before the tenancy headers below
// so it wraps them: it appends `accept-encoding` to the `vary` they set, and
// appending only works from the outside. `response-compression.ts` has the
// measurements and says why it is not `hono/compress`.
for (const prefix of COMPRESSED_READ_PREFIXES) {
	app.use(prefix, compressReads);
}

// Organization-scoped reads on URLs that are byte-identical across tenants.
// `cache-headers.ts` explains why; the short version is that a tile URL carries
// no organization id and one login can switch between agencies without the URL
// changing. Registered before the routes so it wraps them.
for (const prefix of PRIVATE_READ_PREFIXES) {
	app.use(prefix, privateNoStore);
}

registerAllRoutes(app, {
	db,
	auth,
	mailer: authMailer,
	sessionProvider,
	localIdentityResolver,
	nodeEnv: env.nodeEnv,
	appOrigin: env.appOrigin,
	appOrigins: env.appOrigins,
	setAuthCookie,
	finalizeSession: finalizeWorkOsSession,
	geocoderApiKey: env.geocodioApiKey,
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

async function finalizeWorkOsSession(
	context: Parameters<typeof setCookie>[0],
	session: AuthenticatedSession,
): Promise<{ readonly organizationRequired: boolean }> {
	const organization = await auth.getOrganization(session.workosOrganizationId);
	const localIdentity = await upsertWorkOsIdentity(db, {
		...session.user,
		workosOrganizationId: session.workosOrganizationId,
		workosOrganizationName: organization?.name ?? null,
		workosRole: session.role,
	});

	setAuthCookie(context, session.sealedSession);

	return { organizationRequired: localIdentity.organizationId === null };
}

/**
 * Hand the sealed session back to whoever asked for it.
 *
 * Still named for the cookie because that is what it is for every web caller,
 * but a token client (`apps/mobile`) also gets the value in a response header —
 * see `auth-session-transport.ts` for why the two transports have to stay one
 * function.
 */
function setAuthCookie(
	context: Parameters<typeof setCookie>[0],
	sealedSession: string | undefined,
): void {
	writeSealedSession(context, sealedSession, { secure: env.nodeEnv === 'production' });
}

function allowedCorsOrigins(): string[] {
	return [...env.appOrigins];
}
