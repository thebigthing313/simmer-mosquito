import type { CatalogRecords } from './catalog-record-view';
import type { ControlAssetRecord } from './control-asset-record-view';
import { useVehicleHalf } from './use-vehicle-half';

/** The organization's vehicles as the settings page maintains them: active and retired. */
export function useVehicleRecords(): CatalogRecords<ControlAssetRecord> {
	return {
		activeRecords: useVehicleHalf(true),
		inactiveRecords: useVehicleHalf(false),
	};
}
