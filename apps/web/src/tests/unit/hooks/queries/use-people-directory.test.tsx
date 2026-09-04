/** @vitest-environment jsdom */

/**
 * Identity's read: the people directory, in its three groups.
 *
 * One query shape run three times, and what separates the groups is the
 * predicate on `user_id` and `is_active`, not a filter afterwards. The
 * membership is left-joined because a Profile can exist without a login and
 * without a Membership, which is what the historical group is.
 */

import { beforeEach, describe, expect, it } from 'vitest';
import { usePeopleDirectory } from '../../../../hooks/queries/use-people-directory';
import { memberships } from '../../../../lib/collections/memberships';
import { profiles } from '../../../../lib/collections/profiles';
import { installMemoryCollections, seedRows } from '../../lib/collections/memory-collections';
import { renderRead } from './read-harness';

function profile(
	id: string,
	displayName: string,
	overrides: { readonly user_id?: string | null; readonly is_active?: boolean } = {},
) {
	return {
		id,
		display_name: displayName,
		email: `${id}@example.test`,
		user_id: `user-${id}`,
		is_active: true,
		...overrides,
	};
}

beforeEach(() => {
	installMemoryCollections();
});

describe('usePeopleDirectory', () => {
	it('carries the role and status off the joined membership', async () => {
		seedRows(profiles, [profile('p1', 'Rivera')]);
		seedRows(memberships, [{ id: 'm1', profile_id: 'p1', role: 'manager', status: 'active' }]);

		const { result } = await renderRead(usePeopleDirectory);

		expect(result.current.activeLinked).toEqual([
			expect.objectContaining({ profileId: 'p1', role: 'manager', membershipStatus: 'active' }),
		]);
	});

	it('splits linked people by whether the profile is active', async () => {
		seedRows(profiles, [profile('p1', 'Rivera'), profile('p2', 'Okafor', { is_active: false })]);
		seedRows(memberships, [
			{ id: 'm1', profile_id: 'p1', role: 'manager', status: 'active' },
			{ id: 'm2', profile_id: 'p2', role: 'collector', status: 'ended' },
		]);

		const { result } = await renderRead(usePeopleDirectory);

		expect(result.current.activeLinked.map((row) => row.profileId)).toEqual(['p1']);
		expect(result.current.inactiveLinked.map((row) => row.profileId)).toEqual(['p2']);
	});

	it('puts a profile with no login in the historical group', async () => {
		// A Profile exists for attribution whether or not anybody signs in as it, so
		// this group is the people a record can be attributed to and nothing more.
		seedRows(profiles, [profile('p1', 'Rivera'), profile('p2', 'Okafor', { user_id: null })]);
		seedRows(memberships, []);

		const { result } = await renderRead(usePeopleDirectory);

		expect(result.current.historical.map((row) => row.profileId)).toEqual(['p2']);
		expect(result.current.activeLinked.map((row) => row.profileId)).toEqual(['p1']);
	});

	it('reads a linked person with no membership rather than dropping them', async () => {
		// The left join. An `inner` would hide somebody who has a login and no
		// membership, which is exactly the person an operator is looking for.
		seedRows(profiles, [profile('p1', 'Rivera')]);
		seedRows(memberships, []);

		const { result } = await renderRead(usePeopleDirectory);

		expect(result.current.activeLinked.map((row) => row.profileId)).toEqual(['p1']);
		expect(result.current.activeLinked[0]?.role).toBeUndefined();
	});

	it('orders each group by name, and the historical group by active first', async () => {
		seedRows(profiles, [
			profile('p1', 'Zamora'),
			profile('p2', 'Alvarez'),
			profile('p3', 'Bell', { user_id: null }),
			profile('p4', 'Ames', { user_id: null, is_active: false }),
		]);
		seedRows(memberships, []);

		const { result } = await renderRead(usePeopleDirectory);

		expect(result.current.activeLinked.map((row) => row.displayName)).toEqual([
			'Alvarez',
			'Zamora',
		]);
		expect(result.current.historical.map((row) => row.displayName)).toEqual(['Bell', 'Ames']);
	});
});
