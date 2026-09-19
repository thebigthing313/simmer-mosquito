import { useProfileRoster } from '../queries/use-profile-roster';

/** One Profile's display name by id off the profile roster. */
export function useProfileName(profileId: string | null): string | null {
	const profiles = useProfileRoster();
	return profileId === null
		? null
		: (profiles.find((profile) => profile.id === profileId)?.displayName ?? 'Unknown profile');
}
