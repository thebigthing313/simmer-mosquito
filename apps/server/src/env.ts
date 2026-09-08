import {
	parseOrigin,
	readEnv,
	readOptionalString,
	readOptionalUrl,
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
	/**
	 * Whether this server refuses every WorkOS identity write.
	 *
	 * Set on staging, which authenticates against WorkOS production, so an
	 * invitation or a revoke issued from unreleased code cannot reach a real
	 * person. Absent means settle: a variable missing in production cannot
	 * silently turn identity off. See `workos-identity-interlock.ts`.
	 */
	readonly workosIdentityWritesDisabled: boolean;
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
		simmerOperatorOrganizationId: readOptionalString(source, 'SIMMER_OPERATOR_ORG_ID') ?? null,
		workosApiKey: readRequiredString(source, 'WORKOS_API_KEY'),
		workosClientId: readRequiredString(source, 'WORKOS_CLIENT_ID'),
		workosCookiePassword: readRequiredString(source, 'WORKOS_COOKIE_PASSWORD'),
		workosIdentityWritesDisabled:
			readOptionalString(source, 'WORKOS_IDENTITY_WRITES_DISABLED') === 'true',
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

function readRequiredOrigin(source: NodeJS.ProcessEnv, key: string): string {
	const value = readRequiredString(source, key);

	return parseOrigin(key, value);
}
