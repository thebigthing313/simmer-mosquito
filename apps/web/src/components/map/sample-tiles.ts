import { mapInteraction, mapStatus } from '@simmer-mosquito/design-tokens';
import { type MapFiltersOf, SAMPLE_MAP_FILTERS, type SampleStatus } from '@simmer-mosquito/domain';
import type { ExpressionSpecification } from 'mapbox-gl';
import {
	allLayerIds,
	type GeometryTileLayer,
	geometryTileLayers,
	interactiveLayerIds,
} from './geometry-tiles';
import { type TileDrawOptions, tileExtentUrl, tileFilterQuery, tileTemplateUrl } from './tile-urls';

/**
 * The filters the `samples` tiles and extent draw under, typed off the
 * spec in `@simmer-mosquito/domain` the server parses them with. The list
 * request encodes the same object, so the map and the list name one set of
 * params.
 */
export type SampleTileFilters = MapFiltersOf<typeof SAMPLE_MAP_FILTERS>;

export const SAMPLE_SOURCE_ID = 'samples';

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
} as const;

/**
 * The status colors, keyed by the resolved sample status, exported so the
 * explorer's status-filter chips and the map ramp read from a single source of
 * truth — the filter chips double as the map's legend.
 */
export const SAMPLE_STATUS_COLORS: Readonly<Record<SampleStatus, string>> = {
	identified: colors.identified,
	awaiting: colors.awaiting,
	zero_larvae: colors.zeroLarvae,
	unidentifiable: colors.unidentifiable,
};

/** Layers the user can click to select a sample. Order = hit priority. */
export const SAMPLE_INTERACTIVE_LAYER_IDS = interactiveLayerIds(SAMPLE_SOURCE_ID);

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
export function buildSampleTileUrl(
	serverUrl: string,
	filters?: SampleTileFilters,
	options?: TileDrawOptions,
): string {
	return tileTemplateUrl(
		serverUrl,
		SAMPLE_SOURCE_ID,
		tileFilterQuery(SAMPLE_MAP_FILTERS, filters),
		options,
	);
}

/** Build the extent URL for the same filters — the whole filtered set, no viewport. */
export function buildSampleExtentUrl(serverUrl: string, filters?: SampleTileFilters): string {
	return tileExtentUrl(serverUrl, SAMPLE_SOURCE_ID, tileFilterQuery(SAMPLE_MAP_FILTERS, filters));
}

/** The GL layers for the sample source. `selectedId` drives the highlight set. */
export function sampleTileLayers(selectedId: string | null): GeometryTileLayer[] {
	return geometryTileLayers(SAMPLE_SOURCE_ID, { fill: statusColor, line: statusColor }, selectedId);
}
