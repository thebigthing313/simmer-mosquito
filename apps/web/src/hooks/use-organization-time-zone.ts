import { useOrganizationSettings } from './queries/use-organization-settings';

/**
 * The organization's configured timezone.
 *
 * Operational dates are the organization's, not the browser's: a collector on
 * the road, a supervisor at home, and the server all have to agree on which day
 * a 9pm trap placement belongs to, and only the organization's own zone answers
 * that the same way for everyone.
 *
 * Always a zone, never undefined — see `use-organization-settings.ts` for why the
 * pre-hydration frame resolves to `DEFAULT_ORGANIZATION_TIMEZONE` rather than to
 * the browser's zone.
 */
export function useOrganizationTimeZone(): string {
	return useOrganizationSettings().timezone;
}
