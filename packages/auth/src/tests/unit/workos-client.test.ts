/**
 * The seam `createWorkOsAuth` opens over its WorkOS client (#714).
 *
 * The vendor constructor is stubbed to throw, which is what lets the first two
 * cases assert the branch rather than the call: an injected client is one the
 * object never constructs, and no client still means the vendor. The two after
 * them read the delegation off both namespaces the seam names, since a client
 * that is accepted and not called would pass the first case.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { WorkOsClient } from '../../index.js';

const CONSTRUCTED_THE_VENDOR = 'constructed the vendor client';

vi.mock('@workos-inc/node', () => ({
	WorkOS: class {
		constructor() {
			throw new Error(CONSTRUCTED_THE_VENDOR);
		}
	},
}));

const { createWorkOsAuth } = await import('../../index.js');

const config = {
	apiKey: 'sk_test',
	clientId: 'client_test',
	cookiePassword: 'x'.repeat(32),
	redirectUri: 'https://app.example.test/auth/callback',
};

/** Every call the object made on the injected client, in order. */
let calls: string[] = [];

/** The calls these cases reach, and nothing else the SDK carries. */
function stubClient(): WorkOsClient {
	const records =
		<TAnswer>(name: string, answer: TAnswer) =>
		(): TAnswer => {
			calls.push(name);
			return answer;
		};

	return {
		userManagement: {
			getAuthorizationUrl: records('getAuthorizationUrl', 'https://workos.test/authorize'),
		},
		organizations: {
			getOrganization: records(
				'getOrganization',
				Promise.resolve({ id: 'org_1', name: 'Delta Vector Control' }),
			),
		},
	} as unknown as WorkOsClient;
}

beforeEach(() => {
	calls = [];
});

describe('createWorkOsAuth', () => {
	it('constructs no client of its own when handed one', () => {
		expect(() => createWorkOsAuth(config, stubClient())).not.toThrow();
	});

	it('constructs the vendor client when handed none', () => {
		expect(() => createWorkOsAuth(config)).toThrow(CONSTRUCTED_THE_VENDOR);
	});

	it('calls the injected client for a user management read', () => {
		const auth = createWorkOsAuth(config, stubClient());

		expect(auth.getAuthorizationUrl()).toBe('https://workos.test/authorize');
		expect(calls).toEqual(['getAuthorizationUrl']);
	});

	it('calls the injected client for an organization read', async () => {
		const auth = createWorkOsAuth(config, stubClient());

		await expect(auth.getOrganization('org_1')).resolves.toEqual({
			workosOrganizationId: 'org_1',
			name: 'Delta Vector Control',
		});
		expect(calls).toEqual(['getOrganization']);
	});
});
