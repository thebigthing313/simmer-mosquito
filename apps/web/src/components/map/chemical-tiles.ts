import { mapDomain, mapInteraction } from '@simmer-mosquito/design-tokens';
import {
	allLayerIds,
	type GeometryTileLayer,
	geometryTileLayers,
	interactiveLayerIds,
} from './geometry-tiles';
import {
	type RegionScopedTileFilters,
	setRegionTileParam,
	tileExtentUrl,
	tileTemplateUrl,
} from './tile-urls';

/**
 * Server-side filters for the chemical-application vector tiles. Mirrors the
 * query params the `/map/tiles/chemical/{z}/{x}/{y}.mvt` endpoint understands;
 * the same shape drives the `/map/chemical` paged list so the map and the list
 * stay in lockstep.
 */
export interface ChemicalTileFilters extends RegionScopedTileFilters {
	readonly insecticideIds?: readonly string[];
	readonly applicationMethodIds?: readonly string[];
	/** Match applications performed by any of these profiles. */
	readonly applicatorProfileIds?: readonly string[];
	/** Inclusive `YYYY-MM-DD` lower bound on application date. */
	readonly dateFrom?: string;
	/** Inclusive `YYYY-MM-DD` upper bound on application date. */
	readonly dateTo?: string;
}

export const CHEMICAL_SOURCE_ID = 'chemical';

/** Map paint colors, from the shared palette in `@simmer-mosquito/design-tokens`. */
const colors = {
	base: mapDomain.chemical,
	line: mapDomain.chemicalLine,
	pointStroke: mapInteraction.pointStroke,
	selected: mapInteraction.selected,
} as const;

/** Layers the user can click to select a chemical application. Order = hit priority. */
export const CHEMICAL_INTERACTIVE_LAYER_IDS = interactiveLayerIds(CHEMICAL_SOURCE_ID);

export const CHEMICAL_LAYER_IDS = allLayerIds(CHEMICAL_SOURCE_ID);

/** Build the tile template URL with the active filters folded into the query. */
export function buildChemicalTileUrl(serverUrl: string, filters?: ChemicalTileFilters): string {
	return tileTemplateUrl(serverUrl, CHEMICAL_SOURCE_ID, chemicalTileParams(filters));
}

/** Build the extent URL for the same filters — the whole filtered set, no viewport. */
export function buildChemicalExtentUrl(serverUrl: string, filters?: ChemicalTileFilters): string {
	return tileExtentUrl(serverUrl, CHEMICAL_SOURCE_ID, chemicalTileParams(filters));
}

function chemicalTileParams(filters?: ChemicalTileFilters): URLSearchParams {
	const params = new URLSearchParams();

	if (filters?.insecticideIds !== undefined && filters.insecticideIds.length > 0) {
		params.set('insecticideId', [...filters.insecticideIds].sort().join(','));
	}
	if (filters?.applicationMethodIds !== undefined && filters.applicationMethodIds.length > 0) {
		params.set('applicationMethodId', [...filters.applicationMethodIds].sort().join(','));
	}
	if (filters?.applicatorProfileIds !== undefined && filters.applicatorProfileIds.length > 0) {
		params.set('applicator', [...filters.applicatorProfileIds].sort().join(','));
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

/** The GL layers for the chemical application source. `selectedId` drives the highlight set. */
export function chemicalTileLayers(selectedId: string | null): GeometryTileLayer[] {
	return geometryTileLayers(
		CHEMICAL_SOURCE_ID,
		{ fill: colors.base, line: colors.line },
		selectedId,
	);
}
