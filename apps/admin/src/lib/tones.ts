import type { AdminOrganization, MembershipStatus, SimmerRole } from '../api';

/**
 * Badge tones for the three enums the console shows repeatedly.
 *
 * These live together because they are read together — an agency row shows a
 * subscription tone beside a member's role and status — and because a colour
 * scheme that disagrees with itself between two pages reads as a bug in the
 * data rather than in the styling.
 */
export type Tone = 'catalog' | 'danger' | 'info' | 'neutral' | 'success' | 'warning';

export function subscriptionTone(
	status: AdminOrganization['subscription']['subscriptionStatus'],
): Tone {
	if (status === 'active') {
		return 'success';
	}
	if (status === 'trial') {
		return 'info';
	}
	if (status === 'suspended') {
		return 'warning';
	}
	return 'danger';
}

export function roleTone(role: SimmerRole): Tone {
	if (role === 'owner' || role === 'admin') {
		return 'catalog';
	}
	if (role === 'manager') {
		return 'info';
	}
	if (role === 'collector') {
		return 'success';
	}
	return 'neutral';
}

export function membershipStatusTone(status: MembershipStatus): Tone {
	if (status === 'active') {
		return 'success';
	}
	if (status === 'invited') {
		return 'info';
	}
	return 'neutral';
}
