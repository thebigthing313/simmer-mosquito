import { source_reduction_methods } from '../../lib/collections/source_reduction_methods';
import type { CatalogRecords, ControlMethodRecord } from './catalog-record-view';
import { useControlMethodHalf } from './use-control-method-half';

/** The organization's source reduction methods as their catalog page maintains them: the active rows and the retired rows, each in name order. */
export function useSourceReductionMethodRecords(): CatalogRecords<ControlMethodRecord> {
	return {
		activeRecords: useControlMethodHalf(source_reduction_methods(), true),
		inactiveRecords: useControlMethodHalf(source_reduction_methods(), false),
	};
}
