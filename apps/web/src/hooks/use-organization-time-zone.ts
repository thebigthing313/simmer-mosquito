import { resolveOrganizationSettings } from '@simmer-mosquito/domain';
import { webCollections } from '../sync/webCollections';
import { useCollectionRows } from './use-collection-rows';

/**
 * The agency's configured timezone.
 *
 * Operational dates are the agency's, not the browser's: a collector on the
 * road, a supervisor at home, and the server all have to agree on which day a
 * 9pm trap placement belongs to, and only the agency's own zone answers that
 * the same way for everyone. Falls back to the browser's zone while the
 * organization row is still streaming, which is the same answer the rest of the
 * app currently gives.
 */
export function useOrganizationTimeZone(): string | undefined {
	const { rows } = useCollectionRows(webCollections.currentOrganization);
	return resolveOrganizationSettings(rows[0]?.settings).settings.timezone;
}
