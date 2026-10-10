import { mapDomain, mapInteraction } from '@simmer-mosquito/design-tokens';
import { CHEMICAL_MAP_FILTERS, type MapFiltersOf } from '@simmer-mosquito/domain';
import {
	allLayerIds,
	type GeometryTileLayer,
	geometryTileLayers,
	interactiveLayerIds,
} from './geometry-tiles';
import { type TileDrawOptions, tileExtentUrl, tileFilterQuery, tileTemplateUrl } from './tile-urls';

/**
 * The filters the `chemical` tiles and extent draw under, typed off the
 * spec in `@simmer-mosquito/domain` the server parses them with. The list
 * request encodes the same object, so the map and the list name one set of
 * params.
 */
export type ChemicalTileFilters = MapFiltersOf<typeof CHEMICAL_MAP_FILTERS>;

export const CHEMICAL_SOURCE_ID = 'chemical';

/** Map paint colors, from the shared palette in `@simmer-mosquito/design-tokens`. */
const colors = {
	base: mapDomain.chemical,
	line: mapDomain.chemicalLine,
	pointStroke: mapInteraction.pointStroke,
} as const;

/** Layers the user can click to select a chemical application. Order = hit priority. */
export const CHEMICAL_INTERACTIVE_LAYER_IDS = interactiveLayerIds(CHEMICAL_SOURCE_ID);

export const CHEMICAL_LAYER_IDS = allLayerIds(CHEMICAL_SOURCE_ID);

/** Build the tile template URL with the active filters folded into the query. */
export function buildChemicalTileUrl(
	serverUrl: string,
	filters?: ChemicalTileFilters,
	options?: TileDrawOptions,
): string {
	return tileTemplateUrl(
		serverUrl,
		CHEMICAL_SOURCE_ID,
		tileFilterQuery(CHEMICAL_MAP_FILTERS, filters),
		options,
	);
}

/** Build the extent URL for the same filters — the whole filtered set, no viewport. */
export function buildChemicalExtentUrl(serverUrl: string, filters?: ChemicalTileFilters): string {
	return tileExtentUrl(
		serverUrl,
		CHEMICAL_SOURCE_ID,
		tileFilterQuery(CHEMICAL_MAP_FILTERS, filters),
	);
}

/** The GL layers for the chemical application source. `selectedId` drives the highlight set. */
export function chemicalTileLayers(selectedId: string | null): GeometryTileLayer[] {
	return geometryTileLayers(
		CHEMICAL_SOURCE_ID,
		{ fill: colors.base, line: colors.line },
		selectedId,
	);
}
