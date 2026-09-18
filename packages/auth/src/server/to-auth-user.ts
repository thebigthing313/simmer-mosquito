import type { AuthUser } from '../client/auth-me.js';
import type { WorkOsUserLike } from './workos-user-like.js';

export function toAuthUser(user: WorkOsUserLike): AuthUser {
	const firstName = user.firstName ?? null;
	const lastName = user.lastName ?? null;
	const displayName = [firstName, lastName].filter(Boolean).join(' ').trim();

	return {
		workosUserId: user.id,
		email: user.email,
		firstName,
		lastName,
		displayName: displayName === '' ? user.email : displayName,
		emailVerified: user.emailVerified ?? null,
		profilePictureUrl: user.profilePictureUrl ?? null,
	};
}
