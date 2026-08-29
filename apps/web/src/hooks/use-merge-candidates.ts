import { sessionFetch } from '@simmer-mosquito/sync';
import { useQuery } from '@tanstack/react-query';
import { getServerUrl } from '../auth';

/**
 * The record kinds a merge can fold together.
 *
 * Mirrors `MergeableRecordType` in `@simmer-mosquito/db`. The web bundle does
 * not depend on the database package, so the union is restated here the way
 * `use-delete-impact.ts` restates the deletable one; both endpoints answer 404
 * for a name they do not recognize, which is what a drift between the two would
 * look like.
 *
 * It is a shorter list than the deletable types on purpose. Deleting asks what
 * blocks a record; merging asks what can be re-pointed onto another one, and
 * only these three have somewhere for their references to go.
 */
export type MergeableRecordType = 'address' | 'habitat' | 'contact';

/** Why the server put a set of records together. */
export type DuplicateReason = 'same_name' | 'same_email' | 'same_phone' | 'same_place';

export interface DuplicateRecord {
	readonly id: string;
	/** The record's own name. Empty when it has none, which habitats often do. */
	readonly label: string;
	readonly detail: string | null;
	/** ISO, as JSON carries it. Rendered through `lib/local-date`. */
	readonly createdAt: string;
	readonly lat: number | null;
	readonly lng: number | null;
}

export interface DuplicateGroup {
	readonly key: string;
	readonly reason: DuplicateReason;
	/** The shared value, or null for `same_place`. */
	readonly value: string | null;
	/** Oldest first, which is the survivor the page preselects. */
	readonly records: readonly DuplicateRecord[];
}

/** One referencing table's share of a merge, and how many rows it is. */
export interface MergeMoveEntry {
	readonly key: string;
	readonly moved: number;
	readonly deduped: number;
	readonly singular: string;
	readonly plural: string;
}

/**
 * The duplicate sets this agency's records suggest.
 *
 * Live data, and a merge is irreversible, so this refetches on focus for the
 * same reason `useDeleteImpact` does: a cleanup page left open over lunch would
 * otherwise offer a merge over a set a colleague has already dealt with. The
 * merge command re-checks every id inside its transaction regardless, and
 * refuses ids that are gone; this read is what lets the page stop proposing them
 * rather than fail at the button.
 */
export function useDuplicateCandidates(recordType: MergeableRecordType) {
	return useQuery({
		queryKey: duplicateCandidatesQueryKey(recordType),
		queryFn: async ({ signal }) => {
			const response = await sessionFetch(
				new URL(`/records/${recordType}/duplicates`, getServerUrl()),
				{ credentials: 'include', signal },
			);
			if (!response.ok) {
				throw new Error(`Could not look for duplicates (${response.status}).`);
			}
			const body = (await response.json()) as { readonly groups: readonly DuplicateGroup[] };
			return body.groups;
		},
		staleTime: 15_000,
		refetchOnWindowFocus: true,
	});
}

/**
 * What folding these records into that one would move.
 *
 * Counted from the same registry the write uses, so the number in the
 * confirmation is the number that moves. Asked only once a merge is actually
 * being reviewed: a cleanup page holding twenty proposals would otherwise open
 * with twenty requests for counts nobody has looked at yet.
 */
export function useMergeImpact(
	recordType: MergeableRecordType,
	targetId: string | null,
	sourceIds: readonly string[],
	enabled: boolean,
) {
	return useQuery({
		queryKey: mergeImpactQueryKey(recordType, targetId, sourceIds),
		queryFn: async ({ signal }) => {
			const url = new URL(`/records/${recordType}/${targetId ?? ''}/merge-impact`, getServerUrl());
			for (const sourceId of sourceIds) {
				url.searchParams.append('source', sourceId);
			}
			const response = await sessionFetch(url, { credentials: 'include', signal });
			if (!response.ok) {
				throw new Error(`Could not read what this merge would move (${response.status}).`);
			}
			const body = (await response.json()) as { readonly moves: readonly MergeMoveEntry[] };
			return body.moves;
		},
		staleTime: 15_000,
		refetchOnWindowFocus: true,
		enabled: enabled && targetId !== null && sourceIds.length > 0,
	});
}

export function duplicateCandidatesQueryKey(recordType: MergeableRecordType): readonly unknown[] {
	return ['duplicate-candidates', recordType];
}

/**
 * Keyed by the sources as a sorted set.
 *
 * Excluding one record from a group and putting it back must land on the cached
 * answer for that set rather than on a third one, and the order the page holds
 * them in is not part of what a merge means.
 */
function mergeImpactQueryKey(
	recordType: MergeableRecordType,
	targetId: string | null,
	sourceIds: readonly string[],
): readonly unknown[] {
	return ['merge-impact', recordType, targetId, [...sourceIds].sort().join(',')];
}

/** `4 inspections`, `1 inspection`. */
export function moveCountLabel(entry: MergeMoveEntry): string {
	return `${entry.moved} ${entry.moved === 1 ? entry.singular : entry.plural}`;
}
