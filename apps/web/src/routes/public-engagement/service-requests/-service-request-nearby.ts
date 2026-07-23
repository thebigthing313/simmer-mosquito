import { circlePolygon } from '@simmer-mosquito/mapping';
import type {
	ControlMethodRow,
	HabitatTypeRow,
	InsecticideRow,
	OrgLookupRowBase,
} from '@simmer-mosquito/sync';
import { useLiveQuery } from '@tanstack/react-db';
import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import { getServerUrl } from '../../../auth';
import { webCollections } from '../../../sync/webCollections';

// Data + display helpers for the service-request map context (nearby records).
// Dash-prefixed so TanStack Router ignores this file as a route.

export type NearbyCategory =
	| 'habitat'
	| 'trap'
	| 'inspection'
	| 'collection'
	| 'application'
	| 'sourceReduction'
	| 'biocontrol';

export type NearbyFamily = 'infrastructure' | 'surveillance' | 'control';

export interface NearbyItem {
	readonly category: NearbyCategory;
	readonly id: string;
	readonly lat: number;
	readonly lng: number;
	readonly distanceMeters: number;
	readonly date: string | null;
	readonly label: string | null;
	readonly refId: string | null;
	readonly status: string | null;
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

/** Fetch the nearby operational records around a service request (server-scoped by radius + window). */
export function useServiceRequestNearby(id: string) {
	return useQuery({
		queryKey: ['service-request-nearby', id],
		queryFn: ({ signal }) => fetchNearby(id, signal),
		staleTime: 30_000,
	});
}

async function fetchNearby(id: string, signal: AbortSignal): Promise<NearbyResponse> {
	const response = await fetch(new URL(`/map/service-requests/${id}/nearby`, getServerUrl()), {
		credentials: 'include',
		signal,
	});
	if (!response.ok) {
		throw new Error(`Nearby request failed (${response.status}).`);
	}
	return (await response.json()) as NearbyResponse;
}

/**
 * A merged id → display-name map over the eager lookup collections a nearby item
 * references (habitat types, collection methods, insecticides, source-reduction
 * and biocontrol methods). Ids are globally unique, so one map serves every
 * category's `refId`.
 */
export function useNearbyNameById(): ReadonlyMap<string, string> {
	const habitatTypes = useLiveQuery(
		(query) => query.from({ row: webCollections.habitatTypes }),
		[],
	);
	const collectionMethods = useLiveQuery(
		(query) => query.from({ row: webCollections.collectionMethods }),
		[],
	);
	const insecticides = useLiveQuery(
		(query) => query.from({ row: webCollections.insecticides }),
		[],
	);
	const sourceReductionMethods = useLiveQuery(
		(query) => query.from({ row: webCollections.sourceReductionMethods }),
		[],
	);
	const biocontrolMethods = useLiveQuery(
		(query) => query.from({ row: webCollections.biocontrolMethods }),
		[],
	);

	return useMemo(() => {
		const map = new Map<string, string>();
		for (const row of (habitatTypes.data ?? []) as readonly HabitatTypeRow[]) {
			map.set(row.id, row.name);
		}
		for (const row of (collectionMethods.data ?? []) as readonly OrgLookupRowBase[]) {
			map.set(row.id, row.name);
		}
		for (const row of (sourceReductionMethods.data ?? []) as readonly ControlMethodRow[]) {
			map.set(row.id, row.name);
		}
		for (const row of (biocontrolMethods.data ?? []) as readonly ControlMethodRow[]) {
			map.set(row.id, row.name);
		}
		for (const row of (insecticides.data ?? []) as readonly InsecticideRow[]) {
			map.set(row.id, row.tradeName);
		}
		return map;
	}, [
		habitatTypes.data,
		collectionMethods.data,
		sourceReductionMethods.data,
		biocontrolMethods.data,
		insecticides.data,
	]);
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
): GeoJSON.FeatureCollection {
	const features: GeoJSON.Feature[] = [];

	if (response !== undefined) {
		const ring = circlePolygon(
			{ lng: center.lng, lat: center.lat },
			response.radius.meters,
		) as unknown as GeoJSON.Polygon;
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
