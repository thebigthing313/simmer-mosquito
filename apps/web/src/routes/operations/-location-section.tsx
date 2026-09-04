import { LocationSection as LocationBand } from '@simmer-mosquito/ui-web/components/form';
import type { ReactNode } from 'react';
import { GeometryControl } from '../../components/map/geometry-control';
import type { DrawLocation } from '../../components/map/use-draw-location';

/**
 * The location band, wired to a {@link DrawLocation} controller.
 *
 * `ui-web` owns the box; this owns the one thing the box cannot know, which is
 * that operations forms hold their geometry in a controller rather than in
 * separate pieces of form state. So the geometry control is rendered here off
 * `location`, and the caller passes only the form-bound pickers as `children`.
 *
 * The pickers come first, above the geometry, because the address is what the
 * point is refined off.
 */
export function LocationSection({
	location,
	organizationId,
	description,
	label = 'Location',
	required = true,
	children,
}: {
	readonly location: DrawLocation;
	readonly organizationId: string;
	readonly description: string;
	readonly label?: string;
	readonly required?: boolean;
	/** Form-bound pickers that belong beside the geometry. */
	readonly children?: ReactNode;
}) {
	return (
		<LocationBand description={description} error={location.locationError} title={label}>
			{children}

			<GeometryControl
				controller={location.draw}
				geometry={location.geometry}
				geometryType={location.geometryType}
				label="Geometry"
				onClear={location.clear}
				onDraw={location.startDraw}
				onTypeChange={location.changeType}
				organizationId={organizationId}
				required={required}
				{...(location.addressCoord === null ? {} : { onMoveToAddress: location.moveToAddress })}
			/>
		</LocationBand>
	);
}
