import type { OwnedGeometryKind } from '@simmer-mosquito/domain';
import { LocationSection } from '@simmer-mosquito/ui-web/components/form';
import type { ReactNode } from 'react';
import type { DrawLocation } from '../../hooks/map/use-draw-location';
import { GeometryControl } from '../map/geometry-control';
import { AddressPicker } from '../pickers/address-picker';
import { StopGeometryButton, stopGeometryError } from './stop-geometry-button';

/**
 * The location band, wired to a {@link DrawLocation} controller. `ui-web` owns
 * the box; this renders the geometry control off the controller, and the
 * caller passes only the form-bound pickers. The pickers come first because
 * the address is what the point is refined off. {@link below} is for a picker
 * that is context rather than location, such as the habitat a control action
 * was carried out at.
 */
export function LocationBand({
	location,
	geometryKind,
	organizationId,
	description,
	title = 'Location',
	label = 'Geometry',
	required = true,
	extraActions,
	children,
	below,
}: {
	readonly location: DrawLocation;
	/** The record kind being placed. Its policy in the register sets the toggle. */
	readonly geometryKind: OwnedGeometryKind;
	/**
	 * The organization whose regions may be adopted as a polygon. Omitted where
	 * the record stores no area, and on the region form itself.
	 */
	readonly organizationId?: string;
	readonly description: string;
	/** The band's heading. */
	readonly title?: string;
	/** The geometry control's own label, which is not always the word Geometry. */
	readonly label?: string;
	readonly required?: boolean;
	/** A second way to a geometry, shown in the control's own button row. */
	readonly extraActions?: ReactNode;
	/** Form-bound pickers that belong above the geometry. */
	readonly children?: ReactNode;
	/** Form-bound fields that belong below the geometry. */
	readonly below?: ReactNode;
}) {
	return (
		<LocationSection
			description={description}
			error={location.locationError ?? stopGeometryError(location.missionStop)}
			title={title}
		>
			{children}

			<GeometryControl
				controller={location.draw}
				geometry={location.geometry}
				geometryType={location.geometryType}
				geometryKind={geometryKind}
				label={label}
				onClear={location.clear}
				onDraw={location.startDraw}
				onTypeChange={location.changeType}
				extraActions={
					<>
						<StopGeometryButton location={location} />
						{extraActions}
					</>
				}
				{...(organizationId === undefined ? {} : { organizationId })}
				required={required}
				{...(location.addressCoord === null ? {} : { onMoveToAddress: location.moveToAddress })}
			/>

			{below}
		</LocationSection>
	);
}

/**
 * The address picker, with the map half of picking one wired: selecting an
 * address sets the form's `addressId`, clears the unplaced-location error, and
 * hands the address to the controller so the map frames it and an unplaced
 * point is seeded from it.
 */
export function LocationAddressField({
	location,
	value,
	onChange,
	label,
}: {
	readonly location: DrawLocation;
	readonly value: string | null;
	readonly onChange: (addressId: string | null) => void;
	readonly label?: string;
}) {
	return (
		<AddressPicker
			create={{ requestMapPoint: location.requestMapPoint }}
			{...(label === undefined ? {} : { label })}
			onSelect={(address) => {
				onChange(address?.id ?? null);
				location.clearError();
				location.selectAddress(address);
			}}
			value={value}
		/>
	);
}
