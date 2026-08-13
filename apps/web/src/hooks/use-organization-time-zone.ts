import { resolveOrganizationSettings } from '@simmer-mosquito/domain';
import { webCollections } from '../sync/webCollections';
import { useCollectionRows } from './use-collection-rows';

/**
 * The agency's configured timezone.
 *
 * Operational dates are the agency's, not the browser's: a collector on the
 * road, a supervisor at home, and the server all have to agree on which day a
 * 9pm trap placement belongs to, and only the agency's own zone answers that
 * the same way for everyone.
 *
 * Always a zone, never undefined. While the organization row is still streaming
 * this resolves to `DEFAULT_ORGANIZATION_TIMEZONE` — deliberately, because the
 * obvious alternative is the browser's zone and that is the disagreement this
 * exists to remove. A default is wrong for an agency that has set something
 * else, but it is wrong *identically for every viewer*, so the pre-hydration
 * frame cannot be the thing two people disagree about.
 */
export function useOrganizationTimeZone(): string {
	const { rows } = useCollectionRows(webCollections.currentOrganization);
	return resolveOrganizationSettings(rows[0]?.settings).settings.timezone;
}
