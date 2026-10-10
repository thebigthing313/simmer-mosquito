import { mapDomain, mapInteraction } from '@simmer-mosquito/design-tokens';
import { type MapFiltersOf, SOURCE_REDUCTION_MAP_FILTERS } from '@simmer-mosquito/domain';
import {
	allLayerIds,
	type GeometryTileLayer,
	geometryTileLayers,
	interactiveLayerIds,
} from './geometry-tiles';
import { type TileDrawOptions, tileExtentUrl, tileFilterQuery, tileTemplateUrl } from './tile-urls';

/**
 * The filters the `source-reduction` tiles and extent draw under, typed off the
 * spec in `@simmer-mosquito/domain` the server parses them with. The list
 * request encodes the same object, so the map and the list name one set of
 * params.
 */
export type SourceReductionTileFilters = MapFiltersOf<typeof SOURCE_REDUCTION_MAP_FILTERS>;

export const SOURCE_REDUCTION_SOURCE_ID = 'source-reduction';

/** Map paint colors, from the shared palette in `@simmer-mosquito/design-tokens`. */
const colors = {
	base: mapDomain.sourceReduction,
	line: mapDomain.sourceReductionLine,
	pointStroke: mapInteraction.pointStroke,
} as const;

/** Layers the user can click to select a source-reduction activity. Order = hit priority. */
export const SOURCE_REDUCTION_INTERACTIVE_LAYER_IDS = interactiveLayerIds(
	SOURCE_REDUCTION_SOURCE_ID,
);

export const SOURCE_REDUCTION_LAYER_IDS = allLayerIds(SOURCE_REDUCTION_SOURCE_ID);

/** Build the tile template URL with the active filters folded into the query. */
export function buildSourceReductionTileUrl(
	serverUrl: string,
	filters?: SourceReductionTileFilters,
	options?: TileDrawOptions,
): string {
	return tileTemplateUrl(
		serverUrl,
		SOURCE_REDUCTION_SOURCE_ID,
		tileFilterQuery(SOURCE_REDUCTION_MAP_FILTERS, filters),
		options,
	);
}

/** Build the extent URL for the same filters — the whole filtered set, no viewport. */
export function buildSourceReductionExtentUrl(
	serverUrl: string,
	filters?: SourceReductionTileFilters,
): string {
	return tileExtentUrl(
		serverUrl,
		SOURCE_REDUCTION_SOURCE_ID,
		tileFilterQuery(SOURCE_REDUCTION_MAP_FILTERS, filters),
	);
}

/** The GL layers for the source-reduction activity source. `selectedId` drives the highlight set. */
export function sourceReductionTileLayers(selectedId: string | null): GeometryTileLayer[] {
	return geometryTileLayers(
		SOURCE_REDUCTION_SOURCE_ID,
		{ fill: colors.base, line: colors.line },
		selectedId,
	);
}
