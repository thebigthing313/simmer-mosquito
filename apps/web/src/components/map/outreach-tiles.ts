import { mapDomain, mapInteraction } from '@simmer-mosquito/design-tokens';
import { type MapFiltersOf, OUTREACH_MAP_FILTERS } from '@simmer-mosquito/domain';
import {
	allLayerIds,
	type GeometryTileLayer,
	geometryTileLayers,
	interactiveLayerIds,
} from './geometry-tiles';
import { type TileDrawOptions, tileExtentUrl, tileFilterQuery, tileTemplateUrl } from './tile-urls';

/**
 * The filters the `outreach` tiles and extent draw under, typed off the
 * spec in `@simmer-mosquito/domain` the server parses them with. The list
 * request encodes the same object, so the map and the list name one set of
 * params.
 */
export type OutreachTileFilters = MapFiltersOf<typeof OUTREACH_MAP_FILTERS>;

export const OUTREACH_SOURCE_ID = 'outreach';

/** Map paint colors, from the shared palette in `@simmer-mosquito/design-tokens`. */
const colors = {
	base: mapDomain.outreach,
	line: mapDomain.outreachLine,
	pointStroke: mapInteraction.pointStroke,
} as const;

/** Layers the user can click to select a outreach action. Order = hit priority. */
export const OUTREACH_INTERACTIVE_LAYER_IDS = interactiveLayerIds(OUTREACH_SOURCE_ID);

export const OUTREACH_LAYER_IDS = allLayerIds(OUTREACH_SOURCE_ID);

/** Build the tile template URL with the active filters folded into the query. */
export function buildOutreachTileUrl(
	serverUrl: string,
	filters?: OutreachTileFilters,
	options?: TileDrawOptions,
): string {
	return tileTemplateUrl(
		serverUrl,
		OUTREACH_SOURCE_ID,
		tileFilterQuery(OUTREACH_MAP_FILTERS, filters),
		options,
	);
}

/** Build the extent URL for the same filters — the whole filtered set, no viewport. */
export function buildOutreachExtentUrl(serverUrl: string, filters?: OutreachTileFilters): string {
	return tileExtentUrl(
		serverUrl,
		OUTREACH_SOURCE_ID,
		tileFilterQuery(OUTREACH_MAP_FILTERS, filters),
	);
}

/** The GL layers for the outreach action source. `selectedId` drives the highlight set. */
export function outreachTileLayers(selectedId: string | null): GeometryTileLayer[] {
	return geometryTileLayers(
		OUTREACH_SOURCE_ID,
		{ fill: colors.base, line: colors.line },
		selectedId,
	);
}
