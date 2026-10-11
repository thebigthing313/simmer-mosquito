import { mapDomain, mapInteraction } from '@simmer-mosquito/design-tokens';
import type { CHEMICAL_MAP_FILTERS, MapFiltersOf } from '@simmer-mosquito/domain';
import {
	allLayerIds,
	type GeometryTileLayer,
	geometryTileLayers,
	interactiveLayerIds,
} from './geometry-tiles';

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

/** The GL layers for the chemical application source. `selectedId` drives the highlight set. */
export function chemicalTileLayers(selectedId: string | null): GeometryTileLayer[] {
	return geometryTileLayers(
		CHEMICAL_SOURCE_ID,
		{ fill: colors.base, line: colors.line },
		selectedId,
	);
}
