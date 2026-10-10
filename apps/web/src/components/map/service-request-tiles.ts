import { mapInteraction, mapStatus } from '@simmer-mosquito/design-tokens';
import { type MapFiltersOf, SERVICE_REQUEST_MAP_FILTERS } from '@simmer-mosquito/domain';
import type { ExpressionSpecification } from 'mapbox-gl';
import {
	allLayerIds,
	type GeometryTileLayer,
	geometryTileLayers,
	interactiveLayerIds,
} from './geometry-tiles';
import { type TileDrawOptions, tileExtentUrl, tileFilterQuery, tileTemplateUrl } from './tile-urls';

/**
 * The filters the `service-requests` tiles and extent draw under, typed off the
 * spec in `@simmer-mosquito/domain` the server parses them with. The list
 * request encodes the same object, so the map and the list name one set of
 * params.
 */
export type ServiceRequestTileFilters = MapFiltersOf<typeof SERVICE_REQUEST_MAP_FILTERS>;

export const SERVICE_REQUEST_SOURCE_ID = 'service-requests';

/**
 * What each service-request state paints, and the only place it is written down.
 *
 * A request is open or it is closed: the attention tone for the ones still
 * asking for work, and the resolved tone for the ones that are done. Open was
 * red until red was kept for errors, destructive actions and inaccessible
 * sites, none of which an open request is. The key and the result rail import this rather
 * than restating the colours, which DESIGN.md calls the Legend Truth Rule.
 */
export const SERVICE_REQUEST_STATUS_COLORS = {
	open: mapStatus.attention,
	closed: mapStatus.resolved,
} as const;

/**
 * Map paint colors. Requests carry an `isOpen` feature property, so points read
 * their status straight off the tile. Kept as literals: GL paint can't read CSS
 * custom props.
 */
const colors = {
	...SERVICE_REQUEST_STATUS_COLORS,
	pointStroke: mapInteraction.pointStroke,
} as const;

/** Layers the user can click to select a request. Order = hit priority. */
export const SERVICE_REQUEST_INTERACTIVE_LAYER_IDS = interactiveLayerIds(SERVICE_REQUEST_SOURCE_ID);

export const SERVICE_REQUEST_LAYER_IDS = allLayerIds(SERVICE_REQUEST_SOURCE_ID);

// A request whose tile carries no `isOpen` reads as open, which is the state a
// request is in until somebody closes it.
const statusColor: ExpressionSpecification = [
	'case',
	['boolean', ['get', 'isOpen'], true],
	colors.open,
	colors.closed,
];

/** Build the tile template URL with the active filters folded into the query. */
export function buildServiceRequestTileUrl(
	serverUrl: string,
	filters?: ServiceRequestTileFilters,
	options?: TileDrawOptions,
): string {
	return tileTemplateUrl(
		serverUrl,
		SERVICE_REQUEST_SOURCE_ID,
		tileFilterQuery(SERVICE_REQUEST_MAP_FILTERS, filters),
		options,
	);
}

/** Build the extent URL for the same filters: the whole filtered set, no viewport. */
export function buildServiceRequestExtentUrl(
	serverUrl: string,
	filters?: ServiceRequestTileFilters,
): string {
	return tileExtentUrl(
		serverUrl,
		SERVICE_REQUEST_SOURCE_ID,
		tileFilterQuery(SERVICE_REQUEST_MAP_FILTERS, filters),
	);
}

/** The GL layers for the service request source. `selectedId` drives the highlight set. */
export function serviceRequestTileLayers(selectedId: string | null): GeometryTileLayer[] {
	return geometryTileLayers(
		SERVICE_REQUEST_SOURCE_ID,
		{ fill: statusColor, line: statusColor },
		selectedId,
	);
}
