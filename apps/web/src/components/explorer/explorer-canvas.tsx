/**
 * An explorer's map: `MapCanvas` with the measure and readout controls, framed
 * on the surface's data and opening on the camera the reader left, inset by the
 * results panel, and the selected record's card over it. Takes the `canvas`
 * bundle `useExplorerResource` returns, the panel, the create menu, an optional
 * key, and a function that draws the card for a record id.
 */

import type { ReactNode } from 'react';
import type { ExplorerPanel } from '../../hooks/explorer/use-explorer-panel';
import type { ExplorerCanvasBinding } from '../../hooks/explorer/use-explorer-resource';
// The barrel rather than `../map/map-canvas`, so a route suite's stand-in for
// `MapCanvas` reaches this module too.
import { MapCanvas, type MapLegendEntry } from '../map';
import type { MapContextMenuConfig } from '../map/map-context-menu';
import type { MapInset } from '../map/map-inset';

/** What every explorer's map card takes. */
interface ExplorerCardProps {
	readonly id: string;
	readonly inset: MapInset;
	readonly onClose: () => void;
}

export function ExplorerCanvas({
	canvas,
	panel,
	contextMenu,
	legend,
	card,
}: {
	readonly canvas: ExplorerCanvasBinding;
	readonly panel: ExplorerPanel;
	readonly contextMenu: MapContextMenuConfig;
	readonly legend?: readonly MapLegendEntry[] | undefined;
	readonly card: (props: ExplorerCardProps) => ReactNode;
}) {
	return (
		<>
			<MapCanvas
				contextMenu={contextMenu}
				controls={{ measure: true, readout: true }}
				fitToData
				rememberCamera
				inset={panel.inset}
				layers={canvas.layers}
				legend={legend}
				onMapReady={canvas.onMapReady}
				searchWidth={panel.width}
			/>
			{canvas.selectedRecordId === null
				? null
				: card({
						id: canvas.selectedRecordId,
						inset: panel.inset,
						onClose: canvas.clearSelection,
					})}
		</>
	);
}
