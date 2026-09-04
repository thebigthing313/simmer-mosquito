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
 * Server-side filters for the outreach vector tiles. Mirrors the query params
 * the `/map/tiles/outreach/{z}/{x}/{y}.mvt` endpoint understands; the same shape
 * drives the `/map/outreach` paged list so the map and the list stay in lockstep.
 */
export interface OutreachTileFilters extends RegionScopedTileFilters {
	readonly outreachMethodIds?: readonly string[];
	/** Match outreach performed by any of these profiles. */
	readonly technicianProfileIds?: readonly string[];
	/** Inclusive `YYYY-MM-DD` lower bound on outreach date. */
	readonly dateFrom?: string;
	/** Inclusive `YYYY-MM-DD` upper bound on outreach date. */
	readonly dateTo?: string;
}

export const OUTREACH_SOURCE_ID = 'outreach';

/** Map paint colors, from the shared palette in `@simmer-mosquito/design-tokens`. */
const colors = {
	base: mapDomain.outreach,
	line: mapDomain.outreachLine,
	pointStroke: mapInteraction.pointStroke,
	selected: mapInteraction.selected,
} as const;

/** Layers the user can click to select a outreach action. Order = hit priority. */
export const OUTREACH_INTERACTIVE_LAYER_IDS = interactiveLayerIds(OUTREACH_SOURCE_ID);

export const OUTREACH_LAYER_IDS = allLayerIds(OUTREACH_SOURCE_ID);

/** Build the tile template URL with the active filters folded into the query. */
export function buildOutreachTileUrl(serverUrl: string, filters?: OutreachTileFilters): string {
	return tileTemplateUrl(serverUrl, OUTREACH_SOURCE_ID, outreachTileParams(filters));
}

/** Build the extent URL for the same filters — the whole filtered set, no viewport. */
export function buildOutreachExtentUrl(serverUrl: string, filters?: OutreachTileFilters): string {
	return tileExtentUrl(serverUrl, OUTREACH_SOURCE_ID, outreachTileParams(filters));
}

function outreachTileParams(filters?: OutreachTileFilters): URLSearchParams {
	const params = new URLSearchParams();

	if (filters?.outreachMethodIds !== undefined && filters.outreachMethodIds.length > 0) {
		params.set('outreachMethodId', [...filters.outreachMethodIds].sort().join(','));
	}
	if (filters?.technicianProfileIds !== undefined && filters.technicianProfileIds.length > 0) {
		params.set('technician', [...filters.technicianProfileIds].sort().join(','));
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

/** The GL layers for the outreach action source. `selectedId` drives the highlight set. */
export function outreachTileLayers(selectedId: string | null): GeometryTileLayer[] {
	return geometryTileLayers(
		OUTREACH_SOURCE_ID,
		{ fill: colors.base, line: colors.line },
		selectedId,
	);
}
