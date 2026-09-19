import { outreach_methods } from '../../lib/collections/outreach_methods';
import type { CatalogRecords, ControlMethodRecord } from './catalog-record-view';
import { useControlMethodHalf } from './use-control-method-half';

/** The organization's outreach methods as their catalog page maintains them: the active rows and the retired rows, each in name order. */
export function useOutreachMethodRecords(): CatalogRecords<ControlMethodRecord> {
	return {
		activeRecords: useControlMethodHalf(outreach_methods(), true),
		inactiveRecords: useControlMethodHalf(outreach_methods(), false),
	};
}
