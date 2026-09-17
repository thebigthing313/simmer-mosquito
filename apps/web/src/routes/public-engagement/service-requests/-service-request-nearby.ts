import type { ActivityCategory, ActivityFamily } from '@simmer-mosquito/domain';
import {
	circlePolygon,
	type GeoJsonFeature,
	type GeoJsonFeatureCollection,
} from '@simmer-mosquito/mapping';
import { sessionFetch } from '@simmer-mosquito/sync';
import { useQuery } from '@tanstack/react-query';
import { getServerUrl } from '../../../auth';
import type { ActivityEntry } from '../../-activity-data';

// Data + display helpers for the service-request map context (nearby records).
// Dash-prefixed so TanStack Router ignores this file as a route.

/**
 * The families this page asks the endpoint for. The endpoint can also answer
 * `publicEngagement`, the other requests around this one, and the redesigned
 * page will ask for it; until then the type below says what this page draws.
 */
const NEARBY_REQUEST_FAMILIES: readonly ActivityFamily[] = ['larval', 'adult', 'control'];

/** The seven record kinds the three families above hold. */
export type NearbyCategory = Exclude<ActivityCategory, 'outreach' | 'serviceRequest'>;

/** The page's own grouping of those kinds, which is what its three toggles switch. */
export type NearbyFamily = 'infrastructure' | 'surveillance' | 'control';

/**
 * One record near the request: the activity row for that record, less the two
 * fields that say whose entry it is, plus how far away it is. One shape on
 * both endpoints is what lets Daily Work's list row draw a nearby record too.
 */
export interface NearbyItem extends Omit<ActivityEntry, 'involvement' | 'role' | 'category'> {
	readonly category: NearbyCategory;
	readonly distanceMeters: number;
}

export interface NearbyResponse {
	readonly request: {
		readonly id: string;
		readonly lat: number;
		readonly lng: number;
		readonly requestDate: string;
	};
	readonly radius: { readonly amount: number; readonly unitCode: string; readonly meters: number };
	readonly timeWindow: { readonly daysBefore: number; readonly daysAfter: number };
	readonly dateFrom: string;
	readonly dateTo: string;
	readonly families: readonly ActivityFamily[];
	readonly items: readonly NearbyItem[];
}

export const NEARBY_FAMILY_OF: Readonly<Record<NearbyCategory, NearbyFamily>> = {
	habitat: 'infrastructure',
	trap: 'infrastructure',
	inspection: 'surveillance',
	collection: 'surveillance',
	application: 'control',
	sourceReduction: 'control',
	biocontrol: 'control',
};

export const NEARBY_FAMILIES: readonly { readonly key: NearbyFamily; readonly label: string }[] = [
	{ key: 'infrastructure', label: 'Infrastructure' },
	{ key: 'surveillance', label: 'Surveillance' },
	{ key: 'control', label: 'Control' },
];

export const NEARBY_CATEGORY_LABEL: Readonly<Record<NearbyCategory, string>> = {
	habitat: 'Habitat',
	trap: 'Trap',
	inspection: 'Inspection',
	collection: 'Collection',
	application: 'Application',
	sourceReduction: 'Source reduction',
	biocontrol: 'Biocontrol',
};

/** How many nearby records fell in each family, for the toggle counts. */
export function countNearbyByFamily(
	items: readonly NearbyItem[],
): Readonly<Record<NearbyFamily, number>> {
	const counts: Record<NearbyFamily, number> = {
		infrastructure: 0,
		surveillance: 0,
		control: 0,
	};
	for (const item of items) {
		counts[NEARBY_FAMILY_OF[item.category]] += 1;
	}
	return counts;
}

/** The records the visible-family toggles let through, nearest first. */
export function visibleNearbyItems(
	items: readonly NearbyItem[],
	visibleFamilies: ReadonlySet<NearbyFamily>,
): readonly NearbyItem[] {
	return items
		.filter((item) => visibleFamilies.has(NEARBY_FAMILY_OF[item.category]))
		.sort((first, second) => first.distanceMeters - second.distanceMeters);
}

/** Fetch the nearby operational records around a service request (server-scoped by radius + window). */
export function useServiceRequestNearby(id: string) {
	return useQuery({
		queryKey: ['service-request-nearby', id],
		queryFn: ({ signal }) => fetchNearby(id, signal),
		staleTime: 30_000,
	});
}

async function fetchNearby(id: string, signal: AbortSignal): Promise<NearbyResponse> {
	const url = new URL(`/map/service-requests/${id}/nearby`, getServerUrl());
	url.searchParams.set('families', NEARBY_REQUEST_FAMILIES.join(','));
	const response = await sessionFetch(url, { signal });
	if (!response.ok) {
		throw new Error(`Nearby request failed (${response.status}).`);
	}
	return (await response.json()) as NearbyResponse;
}

/**
 * The date the list shows beside a nearby record, or null for a site.
 *
 * The row dates a habitat or a trap by the day its record was created, which
 * is the activity register's rule and what places a person on Daily Work. Next
 * to a request it says nothing about the site, so the list leaves it off, as
 * it did when the row carried no date for a site at all.
 */
export function nearbyItemDate(item: NearbyItem): string | null {
	return NEARBY_FAMILY_OF[item.category] === 'infrastructure' ? null : item.date;
}

/** A title + optional subtitle for a nearby item, resolving lookup names where useful. */
export function describeNearbyItem(
	item: NearbyItem,
	nameById: ReadonlyMap<string, string>,
): { readonly title: string; readonly subtitle: string | null } {
	const refName = item.refId === null ? null : (nameById.get(item.refId) ?? null);
	const ownName = item.label?.trim() ? item.label.trim() : null;
	switch (item.category) {
		case 'habitat':
			return { title: ownName ?? refName ?? 'Habitat', subtitle: ownName ? refName : null };
		case 'trap':
			return { title: ownName ?? 'Trap', subtitle: refName };
		case 'inspection':
			return { title: 'Inspection', subtitle: null };
		case 'collection':
			return { title: 'Collection', subtitle: refName };
		case 'application':
			return { title: 'Application', subtitle: refName };
		case 'sourceReduction':
			return { title: 'Source reduction', subtitle: refName };
		case 'biocontrol':
			return { title: 'Biocontrol', subtitle: refName };
	}
}

/**
 * The map overlay for the context view: the proximity ring, the request's own
 * marker, and the nearby records (points) for the currently-visible families,
 * each tagged with the `role`/`family` properties the nearby layer paints on.
 */
export function buildNearbyMapData(
	center: { readonly lat: number; readonly lng: number },
	response: NearbyResponse | undefined,
	visibleFamilies: ReadonlySet<NearbyFamily>,
): GeoJsonFeatureCollection {
	const features: GeoJsonFeature[] = [];

	if (response !== undefined) {
		const ring = circlePolygon({ lng: center.lng, lat: center.lat }, response.radius.meters);
		features.push({ type: 'Feature', properties: { role: 'ring' }, geometry: ring });
		for (const item of response.items) {
			const family = NEARBY_FAMILY_OF[item.category];
			if (!visibleFamilies.has(family)) {
				continue;
			}
			features.push({
				type: 'Feature',
				properties: { role: 'nearby', id: item.id, family, category: item.category },
				geometry: { type: 'Point', coordinates: [item.lng, item.lat] },
			});
		}
	}

	features.push({
		type: 'Feature',
		properties: { role: 'center' },
		geometry: { type: 'Point', coordinates: [center.lng, center.lat] },
	});

	return { type: 'FeatureCollection', features };
}

/** Distance shown in the family of the org's radius unit (feet/miles for imperial, m/km otherwise). */
export function formatNearbyDistance(meters: number, unitCode: string): string {
	const imperial = ['mile', 'miles', 'mi', 'foot', 'feet', 'ft', 'yard', 'yd'].includes(
		unitCode.trim().toLowerCase(),
	);
	if (imperial) {
		const feet = meters / 0.3048;
		return feet < 1000 ? `${Math.round(feet)} ft` : `${(feet / 5280).toFixed(2)} mi`;
	}
	return meters < 1000 ? `${Math.round(meters)} m` : `${(meters / 1000).toFixed(2)} km`;
}

const UNIT_ABBREVIATION: Readonly<Record<string, string>> = {
	mile: 'mi',
	kilometer: 'km',
	meter: 'm',
	foot: 'ft',
	yard: 'yd',
};

/** A compact radius label like "0.25 mi". */
export function formatRadiusLabel(amount: number, unitCode: string): string {
	const abbr = UNIT_ABBREVIATION[unitCode.trim().toLowerCase()] ?? unitCode;
	return `${amount} ${abbr}`;
}
