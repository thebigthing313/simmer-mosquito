import type { ProfileListing } from '../hooks/queries/use-profile-roster';
import { type LifecycleOption, lifecycleOptions } from './lifecycle-options';

/**
 * What a technician select carries when nobody is assigned.
 *
 * Radix Select forbids an empty-string item value, so "Unassigned" needs a
 * sentinel of its own, and every form holding a technician field reads the same
 * one: the biocontrol, source reduction and outreach forms draw the option, and
 * their edit routes map a null `technicianProfileId` onto it before the form
 * opens. It was written out three times before #908, once in each form module
 * and exported from each, so the value a form offered and the value its edit
 * route seeded were one fact in three places.
 *
 * It is a form-field value rather than a stored one. Nothing sends it: each form
 * maps it back to `null` on the way out.
 */
export const noTechnicianValue = 'none';

/**
 * The technician select's options: `Unassigned` first, then every Profile in
 * lifecycle order.
 *
 * The three forms above built this list themselves, and the option object was
 * the half #908's extraction could not reach: `fallow dead-code` sees an
 * export, and `{ label: 'Unassigned', value: noTechnicianValue }` was three
 * inline literals (#945). They fold because the three selects are the same
 * control over the same roster with the same sentinel, so there is nothing
 * form-specific in the list.
 *
 * Two other surfaces write an `Unassigned` option and stay where they are, and
 * `git grep "label: 'Unassigned'"` finds them. The mission form and
 * `useAssigneeOptions` in the assignments data module build the same shape over
 * `NO_ASSIGNEE`, which is the operations vocabulary's own sentinel for who a
 * plan is assigned to rather than who performed a record, and it is declared
 * twice there, once exported and once private to the mission form; reading this
 * function from them would rename that sentinel across a domain, which is its
 * own change. The two index routes' `{ id: UNASSIGNED, label: 'Unassigned' }` is
 * a `FilterOption` for a filter bar, keyed by `id`, and is not a select option.
 */
export function technicianOptions(profiles: readonly ProfileListing[]): readonly LifecycleOption[] {
	return [
		{ label: 'Unassigned', value: noTechnicianValue },
		...lifecycleOptions(
			profiles,
			(profile) => profile.isActive,
			(profile) => profile.displayName,
		),
	];
}
