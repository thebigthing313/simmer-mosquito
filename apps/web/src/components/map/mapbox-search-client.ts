import type { Map as MapboxMap } from 'mapbox-gl';
import { getMapboxToken } from './map-styles';

/**
 * Thin client for the Mapbox Search Box API (suggest + retrieve). Pure network
 * and shaping logic, separated from the search control so the request flow can
 * be reasoned about — and tested — without React.
 */

const SEARCH_BASE = 'https://api.mapbox.com/search/searchbox/v1';

const SUGGEST_TYPES = 'address,poi,category,place,locality,neighborhood,region,postcode';

export interface MapboxSearchResult {
	readonly id: string;
	readonly label: string;
	readonly description: string;
}

export interface MapboxResolvedResult {
	readonly center: [number, number];
	readonly bbox: readonly [number, number, number, number] | null;
}

interface MapboxSuggestion {
	readonly mapbox_id: string;
	readonly name: string;
	readonly name_preferred?: string;
	readonly feature_type: string;
	readonly address?: string;
	readonly full_address?: string;
	readonly place_formatted?: string;
}

interface MapboxRetrieveFeature {
	readonly geometry?: { readonly type?: string; readonly coordinates?: readonly number[] };
	readonly bbox?: readonly [number, number, number, number];
}

/** A session token groups suggest+retrieve calls for Mapbox session billing. */
export function createSessionToken(): string {
	if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
		return crypto.randomUUID();
	}
	return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export async function suggestPlaces(options: {
	readonly query: string;
	readonly sessionToken: string;
	readonly signal: AbortSignal;
	readonly map: MapboxMap | null;
}): Promise<readonly MapboxSearchResult[]> {
	const url = new URL(`${SEARCH_BASE}/suggest`);
	url.searchParams.set('access_token', getMapboxToken().trim());
	url.searchParams.set('q', options.query);
	url.searchParams.set('session_token', options.sessionToken);
	url.searchParams.set('limit', '6');
	url.searchParams.set('types', SUGGEST_TYPES);
	if (options.map !== null) {
		const center = options.map.getCenter();
		url.searchParams.set('proximity', `${center.lng},${center.lat}`);
	}

	const response = await fetch(url, { signal: options.signal });
	if (!response.ok) {
		throw new Error(`Mapbox search failed (${response.status})`);
	}
	const body = (await response.json()) as { suggestions?: readonly MapboxSuggestion[] };
	return (body.suggestions ?? []).map(toSearchResult);
}

export async function retrievePlace(options: {
	readonly id: string;
	readonly sessionToken: string;
	readonly signal: AbortSignal;
}): Promise<MapboxResolvedResult> {
	const url = new URL(`${SEARCH_BASE}/retrieve/${encodeURIComponent(options.id)}`);
	url.searchParams.set('access_token', getMapboxToken().trim());
	url.searchParams.set('session_token', options.sessionToken);

	const response = await fetch(url, { signal: options.signal });
	if (!response.ok) {
		throw new Error(`Mapbox retrieve failed (${response.status})`);
	}
	const body = (await response.json()) as { features?: readonly MapboxRetrieveFeature[] };
	const resolved = toResolvedResult(body.features ?? []);
	if (resolved === null) {
		throw new Error('Mapbox retrieve did not include coordinates.');
	}
	return resolved;
}

/** Pan/zoom the map to a resolved result, preferring its bbox when present. */
export function moveMapToResult(map: MapboxMap, result: MapboxResolvedResult): void {
	if (result.bbox !== null) {
		const [west, south, east, north] = result.bbox;
		map.fitBounds(
			[
				[west, south],
				[east, north],
			],
			{ duration: 700, maxZoom: 16, padding: 72 },
		);
		return;
	}
	map.flyTo({
		center: result.center,
		zoom: Math.max(map.getZoom(), 14),
		duration: 700,
		essential: true,
	});
}

function toSearchResult(suggestion: MapboxSuggestion): MapboxSearchResult {
	return {
		id: suggestion.mapbox_id,
		label: suggestion.name_preferred ?? suggestion.name,
		description:
			suggestion.full_address ??
			suggestion.place_formatted ??
			suggestion.address ??
			formatFeatureType(suggestion.feature_type),
	};
}

function toResolvedResult(features: readonly MapboxRetrieveFeature[]): MapboxResolvedResult | null {
	const feature = features.find((candidate) => {
		const [lng, lat] = candidate.geometry?.coordinates ?? [];
		return (
			candidate.geometry?.type === 'Point' && typeof lng === 'number' && typeof lat === 'number'
		);
	});

	const [lng, lat] = feature?.geometry?.coordinates ?? [];
	if (typeof lng !== 'number' || typeof lat !== 'number') {
		return null;
	}
	return { center: [lng, lat], bbox: feature?.bbox ?? null };
}

function formatFeatureType(featureType: string): string {
	switch (featureType) {
		case 'poi':
			return 'Point of interest';
		case 'category':
			return 'Places category';
		default:
			return featureType;
	}
}
