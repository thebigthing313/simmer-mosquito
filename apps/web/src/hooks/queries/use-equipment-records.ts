import type { CatalogRecords } from './catalog-record-view';
import type { ControlAssetRecord } from './control-asset-record-view';
import { useEquipmentHalf } from './use-equipment-half';

/** The organization's equipment as the settings page maintains it: active and retired. */
export function useEquipmentRecords(): CatalogRecords<ControlAssetRecord> {
	return {
		activeRecords: useEquipmentHalf(true),
		inactiveRecords: useEquipmentHalf(false),
	};
}
