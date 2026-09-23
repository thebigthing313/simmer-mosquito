import { application_methods } from '../../lib/collections/application_methods';
import type { CatalogRecords, ControlMethodRecord } from './catalog-record-view';
import { useControlMethodHalf } from './use-control-method-half';

/** The organization's application methods as their catalog page maintains them: the active rows and the retired rows, each in name order. */
export function useApplicationMethodRecords(): CatalogRecords<ControlMethodRecord> {
	return {
		activeRecords: useControlMethodHalf(application_methods(), true),
		inactiveRecords: useControlMethodHalf(application_methods(), false),
	};
}
