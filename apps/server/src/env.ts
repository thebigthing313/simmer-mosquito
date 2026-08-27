import {
	readEnv,
	readOptionalString,
	readRequiredString,
	readRequiredUrl,
} from '@simmer-mosquito/config';

export interface ServerEnv {
	readonly appOrigin: string;
	readonly appOrigins: readonly string[];
	readonly databaseUrl: string;
	readonly devImpersonate: DevImpersonationConfig | null;
	readonly electricUrl: string | null;
	readonly geocodioApiKey: string | null;
	readonly host: string;
	readonly nodeEnv: 'development' | 'production' | 'test';
	readonly port: number;
	readonly resendApiKey: string | null;
	readonly authEmailFrom: string;
	/**
	 * The one WorkOS organization that is SIMMER itself.
	 *
	 * There is exactly one, in any environment, which is what makes an equality
	 * check the whole of the operator test. `null` when unset, and every operator
	 * route then refuses — an unconfigured server has no operators rather than
	 * everyone.
	 */
	readonly simmerOperatorOrganizationId: string | null;
	readonly workosApiKey: string;
	readonly workosClientId: string;
	readonly workosCookiePassword: string;
	readonly workosRedirectUri: string;
}

/**
 * DEV-ONLY: fixed identity used to bypass WorkOS when developing against a copy
 * of the production database. Resolved to `null` unless both impersonation ids
 * are set, and forced to `null` when `NODE_ENV=production`.
 */
export interface DevImpersonationConfig {
	readonly workosUserId: string;
	readonly workosOrganizationId: string;
	readonly email: string;
	readonly displayName: string;
}

export function readServerEnv(source: NodeJS.ProcessEnv = process.env): ServerEnv {
	const base = readEnv(source);
	const appOrigin = readRequiredOrigin(source, 'APP_ORIGIN');
	const adminAppOrigin = readOptionalOrigin(source, 'ADMIN_APP_ORIGIN');

	return {
		appOrigin,
		appOrigins: adminAppOrigin === null ? [appOrigin] : [appOrigin, adminAppOrigin],
		databaseUrl: readRequiredString(source, 'DATABASE_URL'),
		devImpersonate: readDevImpersonation(source, base.nodeEnv),
		electricUrl: readElectricUrl(source),
		geocodioApiKey: readOptionalString(source, 'GEOCODIO_API_KEY') ?? null,
		host: base.host,
		nodeEnv: base.nodeEnv,
		port: base.port,
		resendApiKey: readOptionalString(source, 'RESEND_API_KEY') ?? null,
		authEmailFrom:
			readOptionalString(source, 'AUTH_EMAIL_FROM') ?? 'SIMMER <no-reply@simmer-data.com>',
		simmerOperatorOrganizationId:
			readOptionalString(source, 'SIMMER_OPERATOR_ORG_ID')?.trim() || null,
		workosApiKey: readRequiredString(source, 'WORKOS_API_KEY'),
		workosClientId: readRequiredString(source, 'WORKOS_CLIENT_ID'),
		workosCookiePassword: readRequiredString(source, 'WORKOS_COOKIE_PASSWORD'),
		workosRedirectUri: readRequiredUrl(source, 'WORKOS_REDIRECT_URI'),
	};
}

function readDevImpersonation(
	source: NodeJS.ProcessEnv,
	nodeEnv: ServerEnv['nodeEnv'],
): DevImpersonationConfig | null {
	const workosUserId = readOptionalString(source, 'DEV_IMPERSONATE_WORKOS_USER_ID');
	const workosOrganizationId = readOptionalString(source, 'DEV_IMPERSONATE_WORKOS_ORG_ID');

	if (workosUserId === undefined && workosOrganizationId === undefined) {
		return null;
	}

	// Fail closed: never let the auth bypass activate in production, even if the
	// vars leak into the deployed environment.
	if (nodeEnv === 'production') {
		console.warn(
			'[dev-impersonation] DEV_IMPERSONATE_* env vars are set but ignored because NODE_ENV=production.',
		);
		return null;
	}

	if (workosUserId === undefined || workosOrganizationId === undefined) {
		throw new Error(
			'Dev impersonation requires BOTH DEV_IMPERSONATE_WORKOS_USER_ID and DEV_IMPERSONATE_WORKOS_ORG_ID.',
		);
	}

	return {
		workosUserId,
		workosOrganizationId,
		email: readOptionalString(source, 'DEV_IMPERSONATE_EMAIL') ?? 'dev-impersonation@localhost',
		displayName: readOptionalString(source, 'DEV_IMPERSONATE_DISPLAY_NAME') ?? 'Dev Impersonation',
	};
}

function readOptionalOrigin(source: NodeJS.ProcessEnv, key: string): string | null {
	const value = readOptionalString(source, key);
	if (value === undefined) {
		return null;
	}

	return parseOrigin(key, value);
}

/**
 * Effective Electric shape URL, with the `ELECTRIC_SECRET` folded in as a
 * `secret` query param when set. Electric authenticates HTTP API requests via
 * that query param (https://electric.ax/docs/guides/security), so embedding it
 * in the base URL lets the shape proxy forward it on every upstream request
 * without threading the secret through every route. The proxy treats `secret`
 * as a server-owned shape param, so an incoming request can never override or
 * duplicate it. Returns `null` when `ELECTRIC_URL` is unset (shape routes then
 * respond 503 `electric_url_required`).
 */
function readElectricUrl(source: NodeJS.ProcessEnv): string | null {
	const base = readOptionalUrl(source, 'ELECTRIC_URL');
	if (base === null) {
		return null;
	}

	const secret = readOptionalString(source, 'ELECTRIC_SECRET');
	if (secret === undefined) {
		return base;
	}

	const url = new URL(base);
	url.searchParams.set('secret', secret);
	return url.toString();
}

function readOptionalUrl(source: NodeJS.ProcessEnv, key: string): string | null {
	const value = readOptionalString(source, key);
	if (value === undefined) {
		return null;
	}

	try {
		return new URL(value).toString();
	} catch {
		throw new Error(`${key} must be a valid URL. Received: ${value}`);
	}
}

function readRequiredOrigin(source: NodeJS.ProcessEnv, key: string): string {
	const value = readRequiredString(source, key);

	return parseOrigin(key, value);
}

const SCHEME_PREFIX = /^[a-z][a-z0-9+.-]*:\/\//i;

/**
 * Origin env vars are typed by hand into a deploy UI, and a bare hostname is the
 * natural thing to put in a field called "origin". `readServerEnv` runs at module
 * load, so throwing here means the process never reaches `listen` — a missing
 * `https://` on the optional admin CORS origin crash-loops the entire API. A
 * schemeless value is therefore normalized to `https://<host>` rather than taken
 * as fatal; a deployed origin is unambiguously https, and localhost origins in
 * `.env.example` carry their scheme already.
 *
 * `localhost:3000` is deliberately in the schemeless bucket: `new URL` reads it as
 * the `localhost:` scheme and yields the origin `"null"`, which matches no browser
 * `Origin` header. Genuinely unparseable input still throws.
 */
function parseOrigin(key: string, value: string): string {
	const trimmed = value.trim();
	const candidate = SCHEME_PREFIX.test(trimmed) ? trimmed : `https://${trimmed}`;

	let origin: string;
	try {
		origin = new URL(candidate).origin;
	} catch {
		throw new Error(`${key} must be a valid URL. Received: ${value}`);
	}

	// Opaque origins (`file:`, and every non-special scheme) stringify to "null".
	if (origin === 'null') {
		throw new Error(`${key} must be an http(s) URL. Received: ${value}`);
	}

	return origin;
}
