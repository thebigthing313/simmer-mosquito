import {
	ChevronsDownIcon,
	ChevronsUpIcon,
	MinusIcon,
	PlusIcon,
} from '@simmer-mosquito/ui-web/icons/registry';
import type { Map as MapboxMap } from 'mapbox-gl';
import { MapControlButton, MapControlDivider, MapControlGroup } from './map-control';

/** How long a jump to either end of the zoom range takes. */
const LIMIT_DURATION_MS = 500;

/**
 * The zoom column: both ends of the range, and a step either way between them.
 *
 * The ends read as one scale top to bottom, closest at the top. They matter on
 * an agency-wide surface, where a reader who has followed one Habitat down to
 * street level would otherwise press zoom out a dozen times to see the county
 * again.
 */
export function MapZoomControls({ map }: { readonly map: MapboxMap | null }) {
	const disabled = map === null;

	return (
		<MapControlGroup>
			<MapControlButton
				disabled={disabled}
				label="Zoom all the way in"
				onClick={() => map?.easeTo({ zoom: map.getMaxZoom(), duration: LIMIT_DURATION_MS })}
			>
				<ChevronsUpIcon />
			</MapControlButton>
			<MapControlDivider />
			<MapControlButton disabled={disabled} label="Zoom in" onClick={() => map?.zoomIn()}>
				<PlusIcon />
			</MapControlButton>
			<MapControlDivider />
			<MapControlButton disabled={disabled} label="Zoom out" onClick={() => map?.zoomOut()}>
				<MinusIcon />
			</MapControlButton>
			<MapControlDivider />
			<MapControlButton
				disabled={disabled}
				label="Zoom all the way out"
				onClick={() => map?.easeTo({ zoom: map.getMinZoom(), duration: LIMIT_DURATION_MS })}
			>
				<ChevronsDownIcon />
			</MapControlButton>
		</MapControlGroup>
	);
}
