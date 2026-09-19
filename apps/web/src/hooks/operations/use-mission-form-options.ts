import type { ControlType } from '@simmer-mosquito/domain';
import { lifecycleOptions } from '../../lib/lifecycle-options';
import { useNotificationTypeRoster } from '../queries/use-catalog-rosters';
import { useProfileRoster } from '../queries/use-profile-roster';
import { useMethodsForControlType } from './use-methods-for-control-type';

/** Non-empty sentinels: Radix Select forbids empty-string item values. */
export const NO_METHOD = 'none';
export const NO_ASSIGNEE = 'none';
export const NO_NOTIFICATION_TYPE = 'none';

/** The three catalogs the form picks from, each with its own "unset" first. */
export function useMissionFormOptions(controlType: ControlType) {
	const { methods } = useMethodsForControlType(controlType);
	const profiles = useProfileRoster();
	const notificationTypes = useNotificationTypeRoster();

	return {
		methods: [
			{ label: 'No planned method', value: NO_METHOD },
			...lifecycleOptions(
				methods,
				(method) => method.isActive,
				(method) => method.name,
			),
		],
		assignees: [
			{ label: 'Unassigned', value: NO_ASSIGNEE },
			...lifecycleOptions(
				profiles,
				(profile) => profile.isActive,
				(profile) => profile.displayName,
			),
		],
		notificationTypes: [
			{ label: 'No notifications', value: NO_NOTIFICATION_TYPE },
			...lifecycleOptions(
				notificationTypes,
				(type) => type.isActive,
				(type) => type.name,
			),
		],
	};
}
