import { mapInteraction, mapStatus } from '@simmer-mosquito/design-tokens';
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
 * Server-side filters for the sample vector tiles. Mirrors the query params the
 * `/map/tiles/samples/{z}/{x}/{y}.mvt` endpoint understands; the same shape drives
 * the `/map/samples` bbox list so the map and the list stay in lockstep.
 */
export interface SampleTileFilters extends RegionScopedTileFilters {
	/** Species ids the sample must have an identified result for. */
	readonly speciesIds?: readonly string[];
	/** Lifecycle status (`identified` … `unidentifiable`). */
	readonly status?: string;
	/** Only samples flagged with non-mosquito material. */
	readonly nonMosquitoOnly?: boolean;
	/** Inclusive `YYYY-MM-DD` lower bound on the parent inspection date. */
	readonly dateFrom?: string;
	/** Inclusive `YYYY-MM-DD` upper bound on the parent inspection date. */
	readonly dateTo?: string;
}

export const SAMPLE_SOURCE_ID = 'samples';
const _SAMPLE_SOURCE_LAYER = 'samples';

/**
 * Status palette. Points are colored by where a sample sits in the lab workflow —
 * amber for the awaiting queue that needs attention, teal once identified, slate
 * when it held no larvae, and red when it couldn't be identified. Kept as literals
 * (GL paint can't read CSS custom props); the list badges carry the same meaning
 * in words, so color is never the only channel.
 */
const colors = {
	identified: mapStatus.resolved,
	awaiting: mapStatus.pending,
	zeroLarvae: mapStatus.neutral,
	unidentifiable: mapStatus.problem,
	pointStroke: mapInteraction.pointStroke,
	selected: mapInteraction.selected,
} as const;

/**
 * The status colors, keyed by the resolved sample status, exported so the
 * explorer's status-filter chips and the map ramp read from a single source of
 * truth — the filter chips double as the map's legend.
 */
/** The status the server resolves for a sample. */
export type SampleStatus = 'identified' | 'awaiting' | 'zero_larvae' | 'unidentifiable';

export const SAMPLE_STATUS_COLORS: Readonly<Record<SampleStatus, string>> = {
	identified: colors.identified,
	awaiting: colors.awaiting,
	zero_larvae: colors.zeroLarvae,
	unidentifiable: colors.unidentifiable,
};

/** Layers the user can click to select a sample. Order = hit priority. */
export const SAMPLE_INTERACTIVE_LAYER_IDS = interactiveLayerIds(SAMPLE_SOURCE_ID);

const SAMPLE_SELECTED_LAYER_IDS = selectedLayerIds(SAMPLE_SOURCE_ID);

export const SAMPLE_LAYER_IDS = allLayerIds(SAMPLE_SOURCE_ID);

// Color by the server-resolved status property; an unexpected value falls to the
// awaiting tone so a point is never left unpainted.
const statusColor: ExpressionSpecification = [
	'match',
	['get', 'status'],
	'identified',
	colors.identified,
	'awaiting',
	colors.awaiting,
	'zero_larvae',
	colors.zeroLarvae,
	'unidentifiable',
	colors.unidentifiable,
	colors.awaiting,
];

/** Build the tile template URL with the active filters folded into the query. */
export function buildSampleTileUrl(serverUrl: string, filters?: SampleTileFilters): string {
	return tileTemplateUrl(serverUrl, SAMPLE_SOURCE_ID, sampleTileParams(filters));
}

/** Build the extent URL for the same filters — the whole filtered set, no viewport. */
export function buildSampleExtentUrl(serverUrl: string, filters?: SampleTileFilters): string {
	return tileExtentUrl(serverUrl, SAMPLE_SOURCE_ID, sampleTileParams(filters));
}

function sampleTileParams(filters?: SampleTileFilters): URLSearchParams {
	const params = new URLSearchParams();

	if (filters?.speciesIds !== undefined && filters.speciesIds.length > 0) {
		params.set('species', [...filters.speciesIds].sort().join(','));
	}
	if (filters?.status !== undefined && filters.status.length > 0) {
		params.set('status', filters.status);
	}
	if (filters?.nonMosquitoOnly === true) {
		params.set('nonMosquito', 'true');
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

/** The GL layers for the sample source. `selectedId` drives the highlight set. */
export function sampleTileLayers(selectedId: string | null): GeometryTileLayer[] {
	return geometryTileLayers(SAMPLE_SOURCE_ID, { fill: statusColor, line: statusColor }, selectedId);
}

export { SAMPLE_SELECTED_LAYER_IDS };
