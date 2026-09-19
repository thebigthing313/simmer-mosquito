import { notification_types } from '../../lib/collections/notification_types';
import type { CatalogRecords, DescribedCatalogRecord } from './catalog-record-view';
import { useDescribedHalf } from './use-described-half';

/** The organization's notification types as their catalog page maintains them: the active rows and the retired rows, each in name order. */
export function useNotificationTypeRecords(): CatalogRecords<DescribedCatalogRecord> {
	return {
		activeRecords: useDescribedHalf(notification_types(), true),
		inactiveRecords: useDescribedHalf(notification_types(), false),
	};
}
