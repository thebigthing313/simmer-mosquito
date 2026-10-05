import type { ProfileListing } from '../hooks/queries/use-profile-roster';
import { type LifecycleOption, lifecycleOptions } from './lifecycle-options';

/**
 * A Profile select's options: every Profile in lifecycle order, by display name.
 *
 * The inspection and collection form modules each exported this under the same
 * name until #871, which `fallow dead-code` reports as a duplicate export once
 * one module imports both. `technicianOptions` puts `Unassigned` in front of it.
 */
export function profileOptions(profiles: readonly ProfileListing[]): readonly LifecycleOption[] {
	return lifecycleOptions(
		profiles,
		(profile) => profile.isActive,
		(profile) => profile.displayName,
	);
}
