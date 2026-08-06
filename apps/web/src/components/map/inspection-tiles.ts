import { mapDensity, mapDomain, mapInteraction } from '@simmer-mosquito/design-tokens';
import type { ExpressionSpecification } from 'mapbox-gl';
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
 * Server-side filters for the inspection vector tiles. Mirrors the query params
 * the `/map/tiles/inspections/{z}/{x}/{y}.mvt` endpoint understands; the same
 * shape drives the `/map/inspections` bbox list so the map and the list stay in
 * lockstep.
 */
export interface InspectionTileFilters extends RegionScopedTileFilters {
	readonly isWet?: boolean;
	/** Larval-density enum values (`none` … `very_heavy`). */
	readonly densities?: readonly string[];
	/** Only inspections where at least one life stage was found. */
	readonly positiveOnly?: boolean;
	readonly habitatTypeIds?: readonly string[];
	/** Match inspections recorded by any of these profiles. */
	readonly inspectedByProfileIds?: readonly string[];
	/** Inclusive `YYYY-MM-DD` lower bound on inspection date. */
	readonly dateFrom?: string;
	/** Inclusive `YYYY-MM-DD` upper bound on inspection date. */
	readonly dateTo?: string;
}

export const INSPECTION_SOURCE_ID = 'inspections';
const _INSPECTION_SOURCE_LAYER = 'inspections';

/**
 * Density heat ramp. Points are colored by the surveillance signal — a dry site
 * reads as neutral, a clean wet site as calm blue, and larval density climbs
 * amber → orange → red so the map itself surfaces where the pressure is. Kept as
 * literals: GL paint can't read CSS custom props. The list badges carry the same
 * meaning in words, so color is never the only channel.
 */
const colors = {
	dry: mapDensity.dry,
	none: mapDensity.none,
	light: mapDensity.light,
	medium: mapDensity.medium,
	heavy: mapDensity.heavy,
	veryHeavy: mapDensity.veryHeavy,
	pointStroke: mapInteraction.pointStroke,
	line: mapDomain.connector,
	selected: mapInteraction.selected,
} as const;

/**
 * The density heat colors, keyed by the `larval_density` enum, plus the dry tone.
 * Exported so the explorer's density-filter chips and the map ramp read from a
 * single source of truth — the filter chips double as the map's legend.
 */
export const INSPECTION_DENSITY_COLORS: Readonly<Record<string, string>> = {
	none: colors.none,
	light: colors.light,
	medium: colors.medium,
	heavy: colors.heavy,
	very_heavy: colors.veryHeavy,
};

export const INSPECTION_DRY_COLOR = colors.dry;

/** Layers the user can click to select a inspection. Order = hit priority. */
export const INSPECTION_INTERACTIVE_LAYER_IDS = interactiveLayerIds(INSPECTION_SOURCE_ID);

const INSPECTION_SELECTED_LAYER_IDS = selectedLayerIds(INSPECTION_SOURCE_ID);

export const INSPECTION_LAYER_IDS = allLayerIds(INSPECTION_SOURCE_ID);

// Wet sites match on density; a null/unrecorded density falls to the "none"
// tone. A dry site is neutral regardless of density.
const densityColor: ExpressionSpecification = [
	'case',
	['boolean', ['get', 'isWet'], false],
	[
		'match',
		['get', 'density'],
		'very_heavy',
		colors.veryHeavy,
		'heavy',
		colors.heavy,
		'medium',
		colors.medium,
		'light',
		colors.light,
		'none',
		colors.none,
		colors.none,
	],
	colors.dry,
];

/** Build the tile template URL with the active filters folded into the query. */
export function buildInspectionTileUrl(serverUrl: string, filters?: InspectionTileFilters): string {
	return tileTemplateUrl(serverUrl, INSPECTION_SOURCE_ID, inspectionTileParams(filters));
}

/** Build the extent URL for the same filters — the whole filtered set, no viewport. */
export function buildInspectionExtentUrl(
	serverUrl: string,
	filters?: InspectionTileFilters,
): string {
	return tileExtentUrl(serverUrl, INSPECTION_SOURCE_ID, inspectionTileParams(filters));
}

function inspectionTileParams(filters?: InspectionTileFilters): URLSearchParams {
	const params = new URLSearchParams();

	if (filters?.isWet !== undefined) {
		params.set('isWet', String(filters.isWet));
	}
	if (filters?.densities !== undefined && filters.densities.length > 0) {
		params.set('density', [...filters.densities].sort().join(','));
	}
	if (filters?.positiveOnly === true) {
		params.set('positive', 'true');
	}
	if (filters?.habitatTypeIds !== undefined && filters.habitatTypeIds.length > 0) {
		params.set('habitatTypeId', [...filters.habitatTypeIds].sort().join(','));
	}
	if (filters?.inspectedByProfileIds !== undefined && filters.inspectedByProfileIds.length > 0) {
		params.set('inspectedBy', [...filters.inspectedByProfileIds].sort().join(','));
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

/** The GL layers for the inspection source. `selectedId` drives the highlight set. */
export function inspectionTileLayers(selectedId: string | null): GeometryTileLayer[] {
	return geometryTileLayers(
		INSPECTION_SOURCE_ID,
		{ fill: densityColor, line: densityColor },
		selectedId,
	);
}

export { INSPECTION_SELECTED_LAYER_IDS };
