import { afterEach, describe, expect, it, vi } from 'vitest';
import { updateOrganizationMembershipRole } from '../../../sync/profileMutations';

describe('profile mutation responses', () => {
	afterEach(() => {
		vi.unstubAllGlobals();
	});

	it('reports non-json 404 responses without leaking JSON parser errors', async () => {
		const fetch = vi.fn(async () => new Response('404 Not Found', { status: 404 }));
		vi.stubGlobal('fetch', fetch);

		await expect(
			updateOrganizationMembershipRole('http://localhost:3002', 'membership-1', 'viewer'),
		).rejects.toThrow('Unable to update role.');
		expect(fetch).toHaveBeenCalledWith(
			'http://localhost:3002/organization/memberships/membership-1/role',
			expect.objectContaining({ method: 'PATCH' }),
		);
	});
});
