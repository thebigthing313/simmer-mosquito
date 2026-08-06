import { mapDomain, mapInteraction } from '@simmer-mosquito/design-tokens';
import {
	allLayerIds,
	type GeometryTileLayer,
	geometryTileLayers,
	interactiveLayerIds,
	selectedLayerIds,
} from './geometry-tiles';
import {
	type RegionScopedTileFilters,
	setRegionTileParam,
	tileExtentUrl,
	tileTemplateUrl,
} from './tile-urls';

/**
 * Server-side filters for the source-reduction vector tiles. Mirrors the
 * query params the `/map/tiles/source-reduction/{z}/{x}/{y}.mvt` endpoint
 * understands; the same shape drives the `/map/source-reduction` paged list so
 * the map and the list stay in lockstep.
 */
export interface SourceReductionTileFilters extends RegionScopedTileFilters {
	readonly sourceReductionMethodIds?: readonly string[];
	/** Match source reduction performed by any of these profiles. */
	readonly technicianProfileIds?: readonly string[];
	/** Inclusive `YYYY-MM-DD` lower bound on activity date. */
	readonly dateFrom?: string;
	/** Inclusive `YYYY-MM-DD` upper bound on activity date. */
	readonly dateTo?: string;
}

export const SOURCE_REDUCTION_SOURCE_ID = 'source-reduction';
const _SOURCE_REDUCTION_SOURCE_LAYER = 'source-reduction';

/** Map paint colors, from the shared palette in `@simmer-mosquito/design-tokens`. */
const colors = {
	base: mapDomain.sourceReduction,
	line: mapDomain.sourceReductionLine,
	pointStroke: mapInteraction.pointStroke,
	selected: mapInteraction.selected,
} as const;

/** Layers the user can click to select a source-reduction activity. Order = hit priority. */
export const SOURCE_REDUCTION_INTERACTIVE_LAYER_IDS = interactiveLayerIds(
	SOURCE_REDUCTION_SOURCE_ID,
);

const SOURCE_REDUCTION_SELECTED_LAYER_IDS = selectedLayerIds(SOURCE_REDUCTION_SOURCE_ID);

export const SOURCE_REDUCTION_LAYER_IDS = allLayerIds(SOURCE_REDUCTION_SOURCE_ID);

/** Build the tile template URL with the active filters folded into the query. */
export function buildSourceReductionTileUrl(
	serverUrl: string,
	filters?: SourceReductionTileFilters,
): string {
	return tileTemplateUrl(serverUrl, SOURCE_REDUCTION_SOURCE_ID, sourceReductionTileParams(filters));
}

/** Build the extent URL for the same filters — the whole filtered set, no viewport. */
export function buildSourceReductionExtentUrl(
	serverUrl: string,
	filters?: SourceReductionTileFilters,
): string {
	return tileExtentUrl(serverUrl, SOURCE_REDUCTION_SOURCE_ID, sourceReductionTileParams(filters));
}

function sourceReductionTileParams(filters?: SourceReductionTileFilters): URLSearchParams {
	const params = new URLSearchParams();

	if (
		filters?.sourceReductionMethodIds !== undefined &&
		filters.sourceReductionMethodIds.length > 0
	) {
		params.set('sourceReductionMethodId', [...filters.sourceReductionMethodIds].sort().join(','));
	}
	if (filters?.technicianProfileIds !== undefined && filters.technicianProfileIds.length > 0) {
		params.set('technician', [...filters.technicianProfileIds].sort().join(','));
	}
	if (filters?.dateFrom !== undefined) {
		params.set('dateFrom', filters.dateFrom);
	}
	if (filters?.dateTo !== undefined) {
		params.set('dateTo', filters.dateTo);
	}

	setRegionTileParam(params, filters?.regionIds);

	return params;
}

/** The GL layers for the source-reduction activity source. `selectedId` drives the highlight set. */
export function sourceReductionTileLayers(selectedId: string | null): GeometryTileLayer[] {
	return geometryTileLayers(
		SOURCE_REDUCTION_SOURCE_ID,
		{ fill: colors.base, line: colors.line },
		selectedId,
	);
}

export { SOURCE_REDUCTION_SELECTED_LAYER_IDS };
