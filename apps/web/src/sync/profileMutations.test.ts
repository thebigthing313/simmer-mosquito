import { afterEach, describe, expect, it, vi } from 'vitest';
import { listOrganizationMemberships } from './profileMutations';

describe('profile mutation responses', () => {
	afterEach(() => {
		vi.unstubAllGlobals();
	});

	it('reports non-json 404 responses without leaking JSON parser errors', async () => {
		const fetch = vi.fn(async () => new Response('404 Not Found', { status: 404 }));
		vi.stubGlobal('fetch', fetch);

		await expect(listOrganizationMemberships('http://localhost:3002')).rejects.toThrow(
			'Unable to load memberships.',
		);
		expect(fetch).toHaveBeenCalledWith(
			'http://localhost:3002/organization/memberships/list',
			expect.objectContaining({ method: 'POST' }),
		);
	});
});
