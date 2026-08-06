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
 * Server-side filters for the biocontrol vector tiles. Mirrors the query params
 * the `/map/tiles/biocontrol/{z}/{x}/{y}.mvt` endpoint understands; the same
 * shape drives the `/map/biocontrol` paged list so the map and the list stay in
 * lockstep.
 */
export interface BiocontrolTileFilters extends RegionScopedTileFilters {
	readonly biocontrolMethodIds?: readonly string[];
	/** Match releases performed by any of these profiles. */
	readonly technicianProfileIds?: readonly string[];
	/** Only activities tied to a habitat record. */
	readonly habitatLinkedOnly?: boolean;
	/** Inclusive `YYYY-MM-DD` lower bound on activity date. */
	readonly dateFrom?: string;
	/** Inclusive `YYYY-MM-DD` upper bound on activity date. */
	readonly dateTo?: string;
}

export const BIOCONTROL_SOURCE_ID = 'biocontrol';
const _BIOCONTROL_SOURCE_LAYER = 'biocontrol';

/** Map paint colors, from the shared palette in `@simmer-mosquito/design-tokens`. */
const colors = {
	base: mapDomain.biocontrol,
	line: mapDomain.biocontrolLine,
	pointStroke: mapInteraction.pointStroke,
	selected: mapInteraction.selected,
} as const;

/** Layers the user can click to select a biocontrol. Order = hit priority. */
export const BIOCONTROL_INTERACTIVE_LAYER_IDS = interactiveLayerIds(BIOCONTROL_SOURCE_ID);

const BIOCONTROL_SELECTED_LAYER_IDS = selectedLayerIds(BIOCONTROL_SOURCE_ID);

export const BIOCONTROL_LAYER_IDS = allLayerIds(BIOCONTROL_SOURCE_ID);

/** Build the tile template URL with the active filters folded into the query. */
export function buildBiocontrolTileUrl(serverUrl: string, filters?: BiocontrolTileFilters): string {
	return tileTemplateUrl(serverUrl, BIOCONTROL_SOURCE_ID, biocontrolTileParams(filters));
}

/** Build the extent URL for the same filters — the whole filtered set, no viewport. */
export function buildBiocontrolExtentUrl(
	serverUrl: string,
	filters?: BiocontrolTileFilters,
): string {
	return tileExtentUrl(serverUrl, BIOCONTROL_SOURCE_ID, biocontrolTileParams(filters));
}

function biocontrolTileParams(filters?: BiocontrolTileFilters): URLSearchParams {
	const params = new URLSearchParams();

	if (filters?.biocontrolMethodIds !== undefined && filters.biocontrolMethodIds.length > 0) {
		params.set('biocontrolMethodId', [...filters.biocontrolMethodIds].sort().join(','));
	}
	if (filters?.technicianProfileIds !== undefined && filters.technicianProfileIds.length > 0) {
		params.set('technician', [...filters.technicianProfileIds].sort().join(','));
	}
	if (filters?.habitatLinkedOnly === true) {
		params.set('habitatLinked', 'true');
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

/** The GL layers for the biocontrol source. `selectedId` drives the highlight set. */
export function biocontrolTileLayers(selectedId: string | null): GeometryTileLayer[] {
	return geometryTileLayers(
		BIOCONTROL_SOURCE_ID,
		{ fill: colors.base, line: colors.line },
		selectedId,
	);
}

export { BIOCONTROL_SELECTED_LAYER_IDS };
