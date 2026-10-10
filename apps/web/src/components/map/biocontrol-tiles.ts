import { mapDomain, mapInteraction } from '@simmer-mosquito/design-tokens';
import { BIOCONTROL_MAP_FILTERS, type MapFiltersOf } from '@simmer-mosquito/domain';
import {
	allLayerIds,
	type GeometryTileLayer,
	geometryTileLayers,
	interactiveLayerIds,
} from './geometry-tiles';
import { type TileDrawOptions, tileExtentUrl, tileFilterQuery, tileTemplateUrl } from './tile-urls';

/**
 * The filters the `biocontrol` tiles and extent draw under, typed off the
 * spec in `@simmer-mosquito/domain` the server parses them with. The list
 * request encodes the same object, so the map and the list name one set of
 * params.
 */
export type BiocontrolTileFilters = MapFiltersOf<typeof BIOCONTROL_MAP_FILTERS>;

export const BIOCONTROL_SOURCE_ID = 'biocontrol';

/** Map paint colors, from the shared palette in `@simmer-mosquito/design-tokens`. */
const colors = {
	base: mapDomain.biocontrol,
	line: mapDomain.biocontrolLine,
	pointStroke: mapInteraction.pointStroke,
} as const;

/** Layers the user can click to select a biocontrol. Order = hit priority. */
export const BIOCONTROL_INTERACTIVE_LAYER_IDS = interactiveLayerIds(BIOCONTROL_SOURCE_ID);

export const BIOCONTROL_LAYER_IDS = allLayerIds(BIOCONTROL_SOURCE_ID);

/** Build the tile template URL with the active filters folded into the query. */
export function buildBiocontrolTileUrl(
	serverUrl: string,
	filters?: BiocontrolTileFilters,
	options?: TileDrawOptions,
): string {
	return tileTemplateUrl(
		serverUrl,
		BIOCONTROL_SOURCE_ID,
		tileFilterQuery(BIOCONTROL_MAP_FILTERS, filters),
		options,
	);
}

/** Build the extent URL for the same filters — the whole filtered set, no viewport. */
export function buildBiocontrolExtentUrl(
	serverUrl: string,
	filters?: BiocontrolTileFilters,
): string {
	return tileExtentUrl(
		serverUrl,
		BIOCONTROL_SOURCE_ID,
		tileFilterQuery(BIOCONTROL_MAP_FILTERS, filters),
	);
}

/** The GL layers for the biocontrol source. `selectedId` drives the highlight set. */
export function biocontrolTileLayers(selectedId: string | null): GeometryTileLayer[] {
	return geometryTileLayers(
		BIOCONTROL_SOURCE_ID,
		{ fill: colors.base, line: colors.line },
		selectedId,
	);
}
