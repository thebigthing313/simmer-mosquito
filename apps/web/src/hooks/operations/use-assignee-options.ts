import { NO_ASSIGNEE } from '../../components/operations/assignments/assignment-data';
import { type LifecycleOption, lifecycleOptions } from '../../lib/lifecycle-options';
import { useProfileRoster } from '../queries/use-profile-roster';
/** Assignee choices, with "Unassigned" first. */
export function useAssigneeOptions(): {
	readonly options: readonly LifecycleOption[];
	readonly nameById: ReadonlyMap<string, string>;
} {
	const profiles = useProfileRoster();

	return {
		options: [
			{ label: 'Unassigned', value: NO_ASSIGNEE },
			...lifecycleOptions(
				profiles,
				(profile) => profile.isActive,
				(profile) => profile.displayName,
			),
		],
		nameById: new Map(profiles.map((profile) => [profile.id, profile.displayName])),
	};
}
