import { cn } from '@simmer-mosquito/ui-web/lib/utils';
import type { ReactNode } from 'react';
import { GeometryControl } from '../../components/map/geometry-control';
import type { DrawLocation } from './-draw-location';

/**
 * The panel that says where the work is.
 *
 * Anything bound to a form field — an address picker, a habitat picker — is
 * passed in as `children` rather than rendered here: this section knows about
 * the map, not the form. Everything else — the heading, the draw control, and
 * the "you have not placed this yet" state that tints the border — belongs to
 * the geometry.
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
	const hasError = location.locationError !== null;
	const labelId = 'operations-location-label';

	return (
		<section
			aria-labelledby={labelId}
			className={cn(
				'grid gap-4 rounded-md border bg-muted/30 p-4',
				hasError ? 'border-destructive/60' : 'border-border/50',
			)}
		>
			<div className="grid gap-0.5">
				<span className="font-semibold text-foreground text-sm leading-none" id={labelId}>
					{label}
				</span>
				<span className="text-muted-foreground text-xs">{description}</span>
			</div>

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

			{hasError ? <p className="m-0 text-destructive text-sm">{location.locationError}</p> : null}
		</section>
	);
}
