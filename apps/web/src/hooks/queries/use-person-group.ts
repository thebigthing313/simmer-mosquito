import { eq, isNull, not, useLiveSuspenseQuery } from '@tanstack/react-db';
import { memberships } from '../../lib/collections/memberships';
import { profiles } from '../../lib/collections/profiles';
import type { PersonGroup, PersonListing } from './use-people-directory';
/** One group of the People section: active linked, inactive linked or historical Profiles. */
export function usePersonGroup(group: PersonGroup): readonly PersonListing[] {
	const result = useLiveSuspenseQuery((query) => {
		const joined = query
			.from({ profile: profiles() })
			.leftJoin({ membership: memberships() }, ({ profile, membership }) =>
				eq(profile.id, membership.profile_id),
			);

		const scoped =
			group === 'historical'
				? joined
						.where(({ profile }) => isNull(profile.user_id))
						.orderBy(({ profile }) => profile.is_active, 'desc')
						.orderBy(({ profile }) => profile.display_name, 'asc')
				: joined
						.where(({ profile }) => not(isNull(profile.user_id)))
						.where(({ profile }) => eq(profile.is_active, group === 'activeLinked'))
						.orderBy(({ profile }) => profile.display_name, 'asc');

		return scoped.select(({ profile, membership }) => ({
			profileId: profile.id,
			displayName: profile.display_name,
			isActive: profile.is_active,
			userId: profile.user_id,
			email: profile.email,
			membershipId: membership.id,
			role: membership.role,
			membershipStatus: membership.status,
		}));
	});

	return result.data as readonly PersonListing[];
}
