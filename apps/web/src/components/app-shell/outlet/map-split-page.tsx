import { SplitPage } from '@simmer-mosquito/ui-web/components/app-shell/outlet/split-page';
import type React from 'react';
import { MapCanvas } from '../../map';

/**
 * A split layout for map-paired record work: the routed content (a list, detail,
 * or form column) owns the left half while a persistent map owns the right.
 * Where {@link OutletFullPageMap} hands the whole stage to a map, this keeps a
 * focused record column beside the geography so selection and place stay in view
 * together.
 *
 * The split geometry itself is {@link SplitPage}, in `ui-web`. What this adds is
 * the map: a caller-supplied `map` slot for pages that layer their own chrome
 * over the canvas, and a plain layers-off {@link MapCanvas} for those that do
 * not. Keeping the geometry in the package and the map here is what lets a
 * record form — or an operator-console page — use the same stage without pulling
 * in a map renderer.
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
		<SplitPage aside={map ?? <MapCanvas />} className={className}>
			{children}
		</SplitPage>
	);
}
