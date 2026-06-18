import { cn } from '@simmer-mosquito/ui-web/lib/utils';
import type React from 'react';
import { MapCanvas } from '../../map';

/**
 * A split layout for map-paired record work: the routed content (a list, detail,
 * or form column) owns the left half while a persistent map owns the right.
 * Where {@link OutletFullPageMap} hands the whole stage to a map, this keeps a
 * focused record column beside the geography so selection and place stay in view
 * together.
 *
 * The split is a fixed 40/60 (content/map) for now. The map region is `relative`
 * so a caller-supplied `map` slot can layer floating chrome (a detail card,
 * legend) over the canvas. When no slot is given it falls back to a plain,
 * layers-off `MapCanvas`.
 */
export function MapSplitPage({
	children,
	className,
	map,
}: {
	readonly children: React.ReactNode;
	readonly className?: string;
	/** The right-half map surface. Defaults to a layers-off {@link MapCanvas}. */
	readonly map?: React.ReactNode;
}) {
	return (
		<div
			className={cn('grid h-full min-h-0 w-full grid-cols-[2fr_3fr] overflow-hidden', className)}
		>
			<div className="min-h-0 min-w-0 overflow-y-auto">{children}</div>
			<div className="relative min-h-0 min-w-0 border-border/40 border-l">
				{map ?? <MapCanvas controls={{ layers: false }} />}
			</div>
		</div>
	);
}
