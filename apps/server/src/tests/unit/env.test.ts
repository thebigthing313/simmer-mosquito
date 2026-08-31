import { describe, expect, it } from 'vitest';
import { readServerEnv } from '../../env.js';

const baseEnv = {
	APP_ORIGIN: 'http://localhost:5173',
	DATABASE_URL: 'postgres://postgres:postgres@localhost:5432/simmer_mosquito',
	WORKOS_API_KEY: 'sk_test',
	WORKOS_CLIENT_ID: 'client_test',
	WORKOS_COOKIE_PASSWORD: 'replace-with-at-least-32-characters',
	WORKOS_REDIRECT_URI: 'http://localhost:3000/auth/callback',
};

describe('readServerEnv', () => {
	it('normalizes APP_ORIGIN to an origin for CORS matching', () => {
		expect(
			readServerEnv({
				...baseEnv,
				APP_ORIGIN: 'http://localhost:5173/',
			}).appOrigin,
		).toBe('http://localhost:5173');
	});

	it('normalizes a schemeless origin to https instead of failing to boot', () => {
		expect(
			readServerEnv({
				...baseEnv,
				ADMIN_APP_ORIGIN: 'admin.simmer-data.com',
			}).appOrigins,
		).toEqual(['http://localhost:5173', 'https://admin.simmer-data.com']);

		expect(
			readServerEnv({
				...baseEnv,
				APP_ORIGIN: 'app.simmer-data.com/',
			}).appOrigin,
		).toBe('https://app.simmer-data.com');
	});

	it('reads a schemeless host:port as a host and port, not as a scheme', () => {
		expect(
			readServerEnv({
				...baseEnv,
				APP_ORIGIN: 'localhost:5173',
			}).appOrigin,
		).toBe('https://localhost:5173');
	});

	it('still rejects an origin that cannot be an http origin at all', () => {
		expect(() => readServerEnv({ ...baseEnv, APP_ORIGIN: 'not a host' })).toThrow(
			/APP_ORIGIN must be a valid URL/,
		);
		expect(() => readServerEnv({ ...baseEnv, ADMIN_APP_ORIGIN: 'file:///etc/hosts' })).toThrow(
			/ADMIN_APP_ORIGIN must be an http\(s\) URL/,
		);
	});

	it('keeps ELECTRIC_URL optional for non-sync test/dev commands', () => {
		expect(readServerEnv(baseEnv).electricUrl).toBeNull();
		expect(
			readServerEnv({
				...baseEnv,
				ELECTRIC_URL: 'http://localhost:3001/v1/shape',
			}).electricUrl,
		).toBe('http://localhost:3001/v1/shape');
	});

	it('reads GEOCODIO_API_KEY when geocoding is configured', () => {
		expect(readServerEnv(baseEnv).geocodioApiKey).toBeNull();
		expect(
			readServerEnv({
				...baseEnv,
				GEOCODIO_API_KEY: 'geocodio_test',
			}).geocodioApiKey,
		).toBe('geocodio_test');
	});

	it('reads SIMMER_OPERATOR_ORG_ID as null when it is unset or blank', () => {
		// The operator check is an equality against this value, so a blank string
		// must not become one an empty session organization could match. Unset means
		// no operators, not no check — see `createOperatorAuthContextMiddleware`.
		expect(readServerEnv(baseEnv).simmerOperatorOrganizationId).toBeNull();
		expect(
			readServerEnv({ ...baseEnv, SIMMER_OPERATOR_ORG_ID: '   ' }).simmerOperatorOrganizationId,
		).toBeNull();
		expect(
			readServerEnv({ ...baseEnv, SIMMER_OPERATOR_ORG_ID: 'org_simmer' })
				.simmerOperatorOrganizationId,
		).toBe('org_simmer');
	});

	it('disables WorkOS identity writes only on the exact string true', () => {
		// Absent means settle. A variable that went missing in production and was
		// read loosely would turn identity off there instead of on staging, which
		// is the direction that has to fail safe.
		expect(readServerEnv(baseEnv).workosIdentityWritesDisabled).toBe(false);
		for (const value of ['', ' ', 'false', 'TRUE', '1', 'yes']) {
			expect(
				readServerEnv({ ...baseEnv, WORKOS_IDENTITY_WRITES_DISABLED: value })
					.workosIdentityWritesDisabled,
			).toBe(false);
		}
		expect(
			readServerEnv({ ...baseEnv, WORKOS_IDENTITY_WRITES_DISABLED: 'true' })
				.workosIdentityWritesDisabled,
		).toBe(true);
	});
});
