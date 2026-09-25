import type { GeoJsonGeometry } from '@simmer-mosquito/mapping';
import { sessionFetch } from '@simmer-mosquito/sync';
import { useQuery } from '@tanstack/react-query';
import { getServerUrl } from '../../auth';

export type SampleStatus = 'identified' | 'awaiting' | 'zero_larvae' | 'unidentifiable';

/**
 * The `/map/samples/:id` projection: the sample's own fields plus the parent
 * inspection's owned geometry and habitat labels. This is the single source for the
 * header, map, and context; the editable result fields (species counts, disposition
 * flags) are read back from the synced collections so optimistic edits reflect live.
 */
export interface SampleGeoRow {
	readonly id: string;
	readonly organizationId: string;
	readonly lat: number | null;
	readonly lng: number | null;
	readonly geojson: GeoJsonGeometry | null;
	readonly geomType: string | null;
	readonly displayName: string | null;
	readonly inspectionId: string;
	readonly inspectionDate: string;
	readonly habitatId: string | null;
	readonly habitatName: string | null;
	/** The parent inspection's Address, the rung below the Habitat name. */
	readonly addressDisplayName: string | null;
	readonly isZeroLarvae: boolean;
	readonly hasNonMosquito: boolean;
	readonly unidentifiableReason: string | null;
	readonly createdByProfileId: string | null;
	readonly status: SampleStatus;
	readonly identifiedAt: string | null;
	readonly larvaeTotal: number;
	readonly createdAt: string;
	readonly updatedAt: string;
}

/** One sample's projection from `/map/samples/:id`, or `null` when it does not exist. */
export function useSampleGeoContext(id: string) {
	return useQuery({
		queryKey: ['sample-detail', id],
		queryFn: ({ signal }) => fetchSampleGeoContext(id, signal),
		placeholderData: (previous) => previous,
	});
}

async function fetchSampleGeoContext(
	id: string,
	signal: AbortSignal,
): Promise<SampleGeoRow | null> {
	const response = await sessionFetch(new URL(`/map/samples/${id}`, getServerUrl()), { signal });
	if (response.status === 404) {
		return null;
	}
	if (!response.ok) {
		throw new Error(`Sample request failed (${response.status}).`);
	}
	const body = (await response.json()) as { readonly sample?: SampleGeoRow };
	return body.sample ?? null;
}
