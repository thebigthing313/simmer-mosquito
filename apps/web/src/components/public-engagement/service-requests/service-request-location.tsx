import { LocationSection } from '@simmer-mosquito/ui-web/components/form';
import type { DrawGeometry, DrawGeometryType } from '../../../hooks/map/use-map-draw';
import type { MapDrawController } from '../../map/draw-controller';
import { GeometryControl } from '../../map/geometry-control';
import type { AddressOption } from '../../pickers/address-picker';
import { AddressPicker } from '../../pickers/address-picker';
import type { RequestMapPoint } from '../../pickers/new-address-form';

export function RequestLocation({
	form,
	geometry,
	geometryType,
	controller,
	addressCoord,
	locationError,
	requireLocation,
	requestMapPoint,
	onAddressSelected,
	onDrawPoint,
	onMoveToAddress,
	onClearPoint,
}: {
	// biome-ignore lint/suspicious/noExplicitAny: useAppForm instance has no exported type
	readonly form: any;
	readonly geometry: DrawGeometry | null;
	readonly geometryType: DrawGeometryType;
	readonly controller: MapDrawController;
	readonly addressCoord: { readonly lat: number; readonly lng: number } | null;
	readonly locationError: string | null;
	readonly requireLocation: boolean;
	readonly requestMapPoint: RequestMapPoint;
	readonly onAddressSelected: (address: AddressOption | null) => void;
	readonly onDrawPoint: () => void;
	readonly onMoveToAddress: () => void;
	readonly onClearPoint: () => void;
}) {
	return (
		<LocationSection
			description="The point is the request’s exact location. Use an address to frame the map, then refine the point to the precise spot."
			error={locationError}
		>
			{/* One way in to a new address: the picker's own "Create Address", which
			    geocodes the entry and can place its point on this form's map. */}
			<form.AppField name="addressId">
				{/* biome-ignore lint/suspicious/noExplicitAny: field ref has no exported type */}
				{(field: any) => (
					<AddressPicker
						create={{ requestMapPoint }}
						onSelect={(address: AddressOption | null) => {
							field.handleChange(address?.id ?? null);
							onAddressSelected(address);
						}}
						value={field.state.value}
					/>
				)}
			</form.AppField>

			<GeometryControl
				controller={controller}
				geometry={geometry}
				geometryType={geometryType}
				geometryKind="serviceRequest"
				label="Point"
				required={requireLocation}
				onClear={onClearPoint}
				onDraw={onDrawPoint}
				{...(addressCoord === null ? {} : { onMoveToAddress })}
			/>
		</LocationSection>
	);
}

// --- controls ---------------------------------------------------------------
