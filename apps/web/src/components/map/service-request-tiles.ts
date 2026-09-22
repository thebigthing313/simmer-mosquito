import { mapInteraction, mapStatus } from '@simmer-mosquito/design-tokens';
import type { ExpressionSpecification } from 'mapbox-gl';
import {
	allLayerIds,
	type GeometryTileLayer,
	geometryTileLayers,
	interactiveLayerIds,
} from './geometry-tiles';
import {
	type RegionScopedTileFilters,
	setIdListTileParam,
	setRegionTileParam,
	setTextTileParam,
	tileExtentUrl,
	tileTemplateUrl,
} from './tile-urls';

/**
 * Server-side filters for the service request vector tiles. Mirrors the query
 * params the `/map/tiles/service-requests/{z}/{x}/{y}.mvt` endpoint
 * understands; the same shape drives the `/map/service-requests` paged list so
 * the map and the list stay in lockstep.
 */
export interface ServiceRequestTileFilters extends RegionScopedTileFilters {
	/** Open only when `true`, closed only when `false`, both when absent. */
	readonly isOpen?: boolean;
	readonly search?: string;
	readonly tagIds?: readonly string[];
	/** Inclusive `YYYY-MM-DD` lower bound on the request date. */
	readonly dateFrom?: string;
	/** Inclusive `YYYY-MM-DD` upper bound on the request date. */
	readonly dateTo?: string;
}

export const SERVICE_REQUEST_SOURCE_ID = 'service-requests';

/**
 * What each service-request state paints, and the only place it is written down.
 *
 * A request is open or it is closed, and the two are the same pair every other
 * surface draws: red for the ones still asking for work, and the resolved tone
 * for the ones that are done. The key and the result rail import this rather
 * than restating the colours, which DESIGN.md calls the Legend Truth Rule.
 */
export const SERVICE_REQUEST_STATUS_COLORS = {
	open: mapStatus.problem,
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
): string {
	return tileTemplateUrl(serverUrl, SERVICE_REQUEST_SOURCE_ID, serviceRequestTileParams(filters));
}

/** Build the extent URL for the same filters: the whole filtered set, no viewport. */
export function buildServiceRequestExtentUrl(
	serverUrl: string,
	filters?: ServiceRequestTileFilters,
): string {
	return tileExtentUrl(serverUrl, SERVICE_REQUEST_SOURCE_ID, serviceRequestTileParams(filters));
}

function serviceRequestTileParams(filters: ServiceRequestTileFilters = {}): URLSearchParams {
	const params = new URLSearchParams();

	if (filters.isOpen !== undefined) {
		params.set('status', filters.isOpen ? 'open' : 'closed');
	}
	setTextTileParam(params, 'search', filters.search);
	setIdListTileParam(params, 'tagId', filters.tagIds);
	setTextTileParam(params, 'dateFrom', filters.dateFrom);
	setTextTileParam(params, 'dateTo', filters.dateTo);
	setRegionTileParam(params, filters.regionIds);

	return params;
}

/** The GL layers for the service request source. `selectedId` drives the highlight set. */
export function serviceRequestTileLayers(selectedId: string | null): GeometryTileLayer[] {
	return geometryTileLayers(
		SERVICE_REQUEST_SOURCE_ID,
		{ fill: statusColor, line: statusColor },
		selectedId,
	);
}
