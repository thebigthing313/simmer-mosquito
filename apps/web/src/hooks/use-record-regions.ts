import { type QueryClient, useQuery } from '@tanstack/react-query';
import { getServerUrl } from '../auth';

/**
 * The record kinds the regions endpoint answers for.
 *
 * Mirrors `REGION_MEMBERSHIP_RECORD_TYPES` in `@simmer-mosquito/db`, and these
 * are table names rather than the camelCase nouns `useDeleteImpact` uses,
 * because the two endpoints keyed themselves differently. The web bundle does
 * not depend on the database package, so the union is restated here; the
 * endpoint answers 404 for a name it does not recognize, which is what a drift
 * between the two would look like.
 *
 * Fifteen members and thirteen surfaces. `mission_items` and
 * `notification_registrations` have no detail page, and they stay in the union
 * because it claims to mirror the database's list.
 */
export type RegionMembershipRecordType =
	| 'addresses'
	| 'regions'
	| 'traps'
	| 'collections'
	| 'habitats'
	| 'inspections'
	| 'applications'
	| 'source_reductions'
	| 'outreach_actions'
	| 'biocontrol_actions'
	| 'requested_control_actions'
	| 'mission_items'
	| 'service_requests'
	| 'notification_registrations'
	| 'weather_sources';

export interface RecordRegion {
	readonly id: string;
	readonly name: string;
}

export interface RecordRegionGroup {
	/** Null with `folderName` for the unfiled group. Folder names are not unique. */
	readonly folderId: string | null;
	readonly folderName: string | null;
	readonly regions: readonly RecordRegion[];
}

export interface RecordRegions {
	readonly recordType: RegionMembershipRecordType;
	readonly recordId: string;
	/** False when the record is missing, another agency's, or already deleted. */
	readonly found: boolean;
	readonly groups: readonly RecordRegionGroup[];
}

/**
 * Which regions contain this record.
 *
 * Membership is computed on read and never stored (ADR 0015), so this is a live
 * answer that a colleague redrawing a district boundary changes. Same shape as
 * `useDeleteImpact`: short staleness and a refetch on focus, because the app
 * turns focus refetching off by default and that default is wrong for a fact
 * another person can move while the page sits open.
 *
 * The region library is deliberately not subscribed to derive a cache version.
 * `regions` is an on-demand collection, so subscribing would pull the whole
 * library onto every detail page, and on-demand collections carry a known
 * suspense hang.
 *
 * `refetchOnMount: 'always'` is what covers a record's own geometry write. The
 * spec asks for that write to invalidate this key, and doing it by hand would
 * mean a call in every geometry-writing mutation across thirteen record types,
 * where the fourteenth surface's omission is silent and looks like data. Coming
 * back to a detail page remounts the band, so refetching there covers every
 * write path at the cost of one query per visit — and ADR 0015 measured an
 * ordinary detail page's read at 0.048 ms. The cached answer still renders
 * immediately; only the correction is a round-trip behind.
 */
export function useRecordRegions(recordType: RegionMembershipRecordType, recordId: string) {
	return useQuery({
		queryKey: recordRegionsQueryKey(recordType, recordId),
		queryFn: ({ signal }) => fetchRecordRegions(recordType, recordId, signal),
		staleTime: 15_000,
		refetchOnWindowFocus: true,
		refetchOnMount: 'always',
	});
}

async function fetchRecordRegions(
	recordType: RegionMembershipRecordType,
	recordId: string,
	signal: AbortSignal,
): Promise<RecordRegions> {
	const response = await fetch(
		new URL(`/records/${recordType}/${recordId}/regions`, getServerUrl()),
		{ credentials: 'include', signal },
	);
	if (!response.ok) {
		throw new Error(`Could not read which regions hold this record (${response.status}).`);
	}
	return (await response.json()) as RecordRegions;
}

function recordRegionsQueryKey(
	recordType: RegionMembershipRecordType,
	recordId: string,
): readonly unknown[] {
	return ['record-regions', recordType, recordId];
}

/**
 * After a write that moved a region boundary, which can change the answer for
 * any record at all.
 *
 * Region edits happen in one place, the GIS region pages, so the page causing
 * the staleness is the page that clears it — precisely, and for one client.
 * Chasing the other clients is what a materialized membership table would be
 * for, and ADR 0015 ruled that out.
 */
export function invalidateAllRecordRegions(queryClient: QueryClient): void {
	void queryClient.invalidateQueries({ queryKey: ['record-regions'] });
}
