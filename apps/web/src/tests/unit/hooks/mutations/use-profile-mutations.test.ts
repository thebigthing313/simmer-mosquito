/**
 * What one press of Save on a Profile means, and the demotion it must not be.
 *
 * The edit sheet holds two things with two floors behind them: the Profile,
 * which an admin may edit, and the role beside it, which only an owner may
 * change. Both come off the same form and the same button, so an unchanged save
 * has to fire neither.
 *
 * The role half is the one worth a test. `person.role` arrives from the
 * unmatched side of a left join, so it is `null` or `undefined` on a Profile
 * with no login — and the picker shows `viewer` for one. Comparing the picker to
 * the role alone makes every historical Profile look changed, and a save would
 * grant a role to a membership that is not there. `membershipId == null` is the
 * question that answers it.
 *
 * A no-op save that writes nothing is invisible when it is wrong. It shows up as
 * somebody who lost access after an admin opened their record and closed it.
 */

import { describe, expect, it } from 'vitest';
import {
	type ProfileEditSubject,
	type ProfileEditValues,
	profileSavePlan,
} from '../../../../hooks/mutations/use-profile-mutations';

const linked: ProfileEditSubject = {
	displayName: 'Dana Reyes',
	isActive: true,
	membershipId: 'b2e1d3c4-5f6a-4b7c-8d9e-0f1a2b3c4d5e',
	role: 'manager',
};

const historical: ProfileEditSubject = {
	displayName: 'Sam Ordway',
	isActive: true,
	membershipId: null,
	role: null,
};

function values(overrides: Partial<ProfileEditValues> = {}): ProfileEditValues {
	return { displayName: 'Dana Reyes', isActive: true, role: 'manager', ...overrides };
}

describe('profileSavePlan', () => {
	it('writes nothing and changes no role when a linked profile is saved unchanged', () => {
		expect(profileSavePlan(values(), linked)).toEqual({ roleChange: null, changes: {} });
	});

	it('writes nothing and changes no role when a historical profile is saved unchanged', () => {
		// The picker shows `viewer` for somebody with no membership, and the record
		// holds `null`. Those differ, and the difference is not a role change.
		expect(
			profileSavePlan(values({ displayName: 'Sam Ordway', role: 'viewer' }), historical),
		).toEqual({
			roleChange: null,
			changes: {},
		});
	});

	it('names only the columns that moved', () => {
		expect(profileSavePlan(values({ displayName: 'Dana Okafor' }), linked)).toEqual({
			roleChange: null,
			changes: { display_name: 'Dana Okafor' },
		});

		expect(profileSavePlan(values({ isActive: false }), linked)).toEqual({
			roleChange: null,
			changes: { is_active: false },
		});
	});

	it('names the role only when it moved on a membership that exists', () => {
		expect(profileSavePlan(values({ role: 'admin' }), linked).roleChange).toBe('admin');
		expect(
			profileSavePlan(values({ displayName: 'Sam Ordway', role: 'admin' }), historical).roleChange,
		).toBeNull();
	});

	it('names both halves when both moved', () => {
		expect(profileSavePlan(values({ displayName: 'Dana Okafor', role: 'admin' }), linked)).toEqual({
			roleChange: 'admin',
			changes: { display_name: 'Dana Okafor' },
		});
	});
});
