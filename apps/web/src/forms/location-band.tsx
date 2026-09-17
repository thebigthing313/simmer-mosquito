import type { OwnedGeometryKind } from '@simmer-mosquito/domain';
import { LocationSection } from '@simmer-mosquito/ui-web/components/form';
import type { ReactNode } from 'react';
import { GeometryControl } from '../components/map/geometry-control';
import type { DrawLocation } from '../components/map/use-draw-location';
import { AddressPicker } from '../components/pickers/address-picker';

/**
 * The location band, wired to a {@link DrawLocation} controller.
 *
 * `ui-web` owns the box; this owns the one thing the box cannot know, which is
 * that a record form holds its geometry in a controller rather than in separate
 * pieces of form state. So the geometry control is rendered here off `location`,
 * and the caller passes only the form-bound pickers.
 *
 * Every band used to destructure the controller back into ten loose props for
 * `GeometryControl`, in the same order, with the same conditional spread for the
 * address handler, which undid the consolidation `useDrawLocation` exists for at
 * every call site. All ten are derivable from the controller the caller already
 * holds, so this takes the controller.
 *
 * The pickers come first, above the geometry, because the address is what the
 * point is refined off. {@link below} is for a picker that is context rather
 * than location, such as the habitat a control action was carried out at.
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
	 * the record stores no area, and on the region form itself, where filling a
	 * region from a region is the shortcut offering to copy its own answer.
	 */
	readonly organizationId?: string;
	readonly description: string;
	/** The band's heading. */
	readonly title?: string;
	/** The geometry control's own label, which is not always the word Geometry. */
	readonly label?: string;
	readonly required?: boolean;
	/**
	 * A second way to a geometry, shown in the control's own button row. The
	 * address book's geocoder is the one that exists.
	 */
	readonly extraActions?: ReactNode;
	/** Form-bound pickers that belong above the geometry. */
	readonly children?: ReactNode;
	/** Form-bound fields that belong below the geometry. */
	readonly below?: ReactNode;
}) {
	return (
		<LocationSection description={description} error={location.locationError} title={title}>
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
				{...(extraActions === undefined ? {} : { extraActions })}
				{...(organizationId === undefined ? {} : { organizationId })}
				required={required}
				{...(location.addressCoord === null ? {} : { onMoveToAddress: location.moveToAddress })}
			/>

			{below}
		</LocationSection>
	);
}

/**
 * The address picker, with the map half of picking one already wired.
 *
 * Selecting an address does three things: it sets the form's `addressId`, it
 * clears the "you have not placed this yet" error, and it hands the address to
 * the controller so the map frames it and an unplaced point is seeded from it.
 * Those three statements were copied into eight forms and the habitat form's
 * copy had lost the middle one, so picking an address there left the refusal on
 * screen under a location the form now had. The caller passes the field half
 * and the rest is here.
 */
export function LocationAddressField({
	location,
	organizationId,
	value,
	onChange,
	label,
}: {
	readonly location: DrawLocation;
	readonly organizationId: string;
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
			organizationId={organizationId}
			value={value}
		/>
	);
}
