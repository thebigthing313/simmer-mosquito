import type { LarvalDensity } from '@simmer-mosquito/domain';
import type { GeoJsonGeometry } from '@simmer-mosquito/mapping';
import { sessionFetch } from '@simmer-mosquito/sync';
import { useQuery } from '@tanstack/react-query';
import { getServerUrl } from '../../auth';

/**
 * The `/map/inspections/:id` display projection: the owned-geometry columns plus
 * the record fields and the joined habitat / address / inspector labels. This is
 * the single source for the header, map, findings, and context — an inspection is
 * not editable in v1, so a one-shot fetch (which also bundles the geometry Electric
 * omits, ADR 0009) is simpler than reassembling the record from synced collections.
 */
export interface InspectionDetailRow {
	readonly id: string;
	readonly organizationId: string;
	readonly lat: number | null;
	readonly lng: number | null;
	readonly geojson: GeoJsonGeometry | null;
	readonly geomType: string | null;
	readonly habitatId: string | null;
	readonly habitatName: string | null;
	readonly habitatTypeId: string | null;
	readonly addressId: string | null;
	readonly addressDisplayName: string | null;
	readonly inspectedByProfileId: string | null;
	readonly inspectedByName: string | null;
	readonly inspectionDate: string;
	readonly isWet: boolean;
	readonly dipCount: number | null;
	readonly density: LarvalDensity | null;
	readonly larvaeCount: number | null;
	readonly hasEggs: boolean;
	readonly hasFirstInstar: boolean;
	readonly hasSecondInstar: boolean;
	readonly hasThirdInstar: boolean;
	readonly hasFourthInstar: boolean;
	readonly hasPupae: boolean;
	readonly createdAt: string;
	readonly updatedAt: string;
}

/** One inspection's display projection from `/map/inspections/:id`, or `null` when it does not exist. */
export function useInspectionDetail(id: string) {
	return useQuery({
		queryKey: ['inspection-detail', id],
		queryFn: ({ signal }) => fetchInspectionDetail(id, signal),
		placeholderData: (previous) => previous,
	});
}

async function fetchInspectionDetail(
	id: string,
	signal: AbortSignal,
): Promise<InspectionDetailRow | null> {
	const response = await sessionFetch(new URL(`/map/inspections/${id}`, getServerUrl()), {
		signal,
	});
	if (response.status === 404) {
		return null;
	}
	if (!response.ok) {
		throw new Error(`Inspection request failed (${response.status}).`);
	}
	const body = (await response.json()) as { readonly inspection?: InspectionDetailRow };
	return body.inspection ?? null;
}
