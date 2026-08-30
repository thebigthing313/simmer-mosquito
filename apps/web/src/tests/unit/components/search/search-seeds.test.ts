import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import type { AuthMe } from '../../../../auth';
import { shellSearchCandidates } from '../../../../components/app-shell/navigation';
import { seedNoun, seedSearch } from '../../../../components/search/search-seeds';

describe('seedSearch', () => {
	it('names the search param each create route reads', () => {
		expect(seedSearch('habitats', 'abc')).toEqual({ habitatId: 'abc' });
		expect(seedSearch('traps', 'abc')).toEqual({ trapId: 'abc' });
	});
});

describe('seedNoun', () => {
	it('names the record the pick step asks for', () => {
		expect(seedNoun('habitats')).toBe('habitat');
		expect(seedNoun('traps')).toBe('trap');
	});
});

/**
 * The seam this pins is the one that fails silently.
 *
 * A `seedFrom` on an action whose route does not validate the matching param
 * navigates to a create form that drops the id: TanStack Router strips a search
 * key no schema claims, so the form opens blank and the pick step reads as a
 * click that did nothing. Nothing in the types connects the two halves, because
 * one is a nav item and the other is a route file, so the route source is read
 * here instead.
 */
describe('seeded actions', () => {
	it('seeds only routes that validate the param', () => {
		const seeding = shellSearchCandidates(ownerAuth()).actions.filter(
			(candidate) => candidate.seedFrom !== undefined,
		);

		// Without this the loop below passes on an empty list, which is what
		// dropping the field off the candidate would produce.
		expect(seeding.map((candidate) => candidate.id)).toEqual([
			'inspections-create',
			'collections-create',
		]);

		for (const candidate of seeding) {
			const table = candidate.seedFrom;
			if (table === undefined) {
				throw new Error('filtered above');
			}
			const [param] = Object.keys(seedSearch(table, 'x'));
			expect(routeSource(String(candidate.to))).toContain(`${param}:`);
		}
	});
});

/** The route file behind a nav item's `to`. */
function routeSource(to: string): string {
	const path = fileURLToPath(new URL(`../../../../routes${to}.tsx`, import.meta.url));
	return readFileSync(path, 'utf8');
}

function ownerAuth(): AuthMe {
	return {
		authenticated: true,
		user: {
			workosUserId: 'user_1',
			email: 'crew@example.test',
			firstName: null,
			lastName: null,
			displayName: 'Crew',
			emailVerified: true,
			profilePictureUrl: null,
		},
		workosOrganizationId: 'org_1',
		localIdentity: {
			userId: 'user_1',
			organizationId: 'org_1',
			profileId: 'profile_1',
			membershipId: 'membership_1',
			role: 'owner',
		},
	};
}
