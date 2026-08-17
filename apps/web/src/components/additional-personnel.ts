import type { MultiSelectOption } from '@simmer-mosquito/ui-web/components/multi-select';
import type { ProfileListing } from '../hooks/queries/use-profile-roster';
import { lifecycleOptions } from '../lib/lifecycle-options';

/**
 * The crew picker's options.
 *
 * What is left of this module. Reading a record's crew is
 * `hooks/queries/use-additional-personnel.ts` and writing it is
 * `hooks/mutations/use-additional-personnel-mutations.ts`; this is the part that
 * is neither — a pure function over the roster a form already holds.
 */

/**
 * Everyone on the roster, current staff first, so a crew from three seasons ago
 * can still be recorded. Only the person the record is already attributed to
 * drops out, and even they stay if they are somehow attached as crew too.
 */
export function additionalPersonnelOptions(
	profiles: readonly ProfileListing[],
	selectedIds: readonly string[],
	options: { readonly excludeProfileId?: string | null } = {},
): readonly MultiSelectOption[] {
	const selected = new Set(selectedIds);
	const excluded = options.excludeProfileId ?? null;
	return lifecycleOptions(
		profiles.filter((profile) => profile.id !== excluded || selected.has(profile.id)),
		(profile) => profile.isActive,
		(profile) => profile.displayName,
	);
}
