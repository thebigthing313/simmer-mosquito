import { notification_types } from '../../lib/collections/notification_types';
import type { CatalogListing } from './catalog-roster-view';
import { usePlainCatalogRoster } from './use-plain-catalog-roster';

/** The organization's notification types as a record form picks from them, retired rows included. */
export function useNotificationTypeRoster(): readonly CatalogListing[] {
	return usePlainCatalogRoster(notification_types());
}
