import { createOrganizationClock, type OrganizationClock } from '../lib/organization-clock';
import { useOrganizationTimeZone } from './use-organization-time-zone';

/**
 * The Organization's clock, bound to its configured zone: `now()`, `today()`,
 * `dayOf(instant)`, `formatInstant(value, style)` and the `zone` itself.
 *
 * Takes nothing. The zone comes from the Organization's settings, and now is
 * `getToday()`. A module that is not a component builds its clock with
 * `createOrganizationClock` from `lib/organization-clock.ts` instead.
 */
export function useOrganizationClock(): OrganizationClock {
	return createOrganizationClock(useOrganizationTimeZone());
}
