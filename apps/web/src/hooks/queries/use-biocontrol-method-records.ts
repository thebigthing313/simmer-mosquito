import { biocontrol_methods } from '../../lib/collections/biocontrol_methods';
import type { CatalogRecords, ControlMethodRecord } from './catalog-record-view';
import { useControlMethodHalf } from './use-control-method-half';

/** The organization's biocontrol methods as their catalog page maintains them: the active rows and the retired rows, each in name order. */
export function useBiocontrolMethodRecords(): CatalogRecords<ControlMethodRecord> {
	return {
		activeRecords: useControlMethodHalf(biocontrol_methods(), true),
		inactiveRecords: useControlMethodHalf(biocontrol_methods(), false),
	};
}
