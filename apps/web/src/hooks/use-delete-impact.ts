import { sessionFetch } from '@simmer-mosquito/sync';
import { useQuery } from '@tanstack/react-query';
import { getServerUrl } from '../auth';

/**
 * The record kinds with a delete policy on the server.
 *
 * Mirrors `DeletableRecordType` in `@simmer-mosquito/db`. The web bundle does
 * not depend on the database package, so the union is restated here; the
 * endpoint answers 404 for a name it does not recognize, which is what a drift
 * between the two would look like.
 */
export type DeletableRecordType =
	| 'address'
	| 'region'
	| 'trap'
	| 'collection'
	| 'habitat'
	| 'inspection'
	| 'sample'
	| 'application'
	| 'sourceReduction'
	| 'outreachAction'
	| 'biocontrolAction'
	| 'contact'
	| 'serviceRequest'
	| 'route'
	| 'assignment'
	// Neither has a detail page yet, so nothing passes these today. They are here
	// because this union claims to mirror the database's, and a mirror missing two
	// members is the drift the comment above warns about rather than a shorter
	// list of what the endpoint answers.
	| 'requestedControlAction'
	| 'mission'
	// The catalogs. Every one of their rules blocks: a catalog row deletes only
	// while nothing refers to it, so `blockers` is the only list they ever fill.
	| 'collectionMethod'
	| 'collectionLure'
	| 'habitatType'
	| 'applicationMethod'
	| 'sourceReductionMethod'
	| 'outreachMethod'
	| 'biocontrolMethod'
	| 'vehicle'
	| 'equipment'
	| 'insecticide'
	| 'insecticideBatch'
	| 'formulation'
	| 'notificationType'
	| 'tag';

/** One consequence: how many rows, and what to call them. */
export interface DeleteImpactEntry {
	readonly key: string;
	readonly count: number;
	readonly singular: string;
	readonly plural: string;
}

export interface DeleteImpact {
	readonly recordType: DeletableRecordType;
	readonly recordId: string;
	readonly found: boolean;
	/** Non-empty means the server will refuse the delete. */
	readonly blockers: readonly DeleteImpactEntry[];
	/** Rows deleted alongside the record. */
	readonly cascades: readonly DeleteImpactEntry[];
	/** Rows kept, with their link to the record cleared. */
	readonly detaches: readonly DeleteImpactEntry[];
}

/**
 * What deleting this record would do, asked before the user commits.
 *
 * The counts are live data — a colleague can file a service request against
 * this address while the page sits open — so this stays short-lived and
 * refetches when the window regains focus. The app turns that refetch off by
 * default (`main.tsx`), which is right for the reference data most queries
 * read and wrong here: a detail page left open over lunch would otherwise
 * offer a delete against counts from before lunch. The server re-checks inside
 * the delete transaction regardless; this read is what lets the page say so
 * first instead of failing at the button.
 */
export function useDeleteImpact(
	recordType: DeletableRecordType,
	recordId: string,
	/**
	 * Whether to ask at all. A catalog page renders a delete dialog per row, and
	 * the question is only worth a request once one of them opens.
	 */
	enabled = true,
) {
	return useQuery({
		queryKey: deleteImpactQueryKey(recordType, recordId),
		queryFn: ({ signal }) => fetchDeleteImpact(recordType, recordId, signal),
		staleTime: 15_000,
		refetchOnWindowFocus: true,
		enabled,
	});
}

async function fetchDeleteImpact(
	recordType: DeletableRecordType,
	recordId: string,
	signal: AbortSignal,
): Promise<DeleteImpact> {
	const response = await sessionFetch(
		new URL(`/records/${recordType}/${recordId}/delete-impact`, getServerUrl()),
		{ credentials: 'include', signal },
	);
	if (!response.ok) {
		throw new Error(`Could not read what deleting this would affect (${response.status}).`);
	}
	return (await response.json()) as DeleteImpact;
}

/** `4 inspections`, `1 inspection`. */
export function impactCountLabel(entry: DeleteImpactEntry): string {
	return `${entry.count} ${entry.count === 1 ? entry.singular : entry.plural}`;
}

export function deleteImpactQueryKey(
	recordType: DeletableRecordType,
	recordId: string,
): readonly unknown[] {
	return ['delete-impact', recordType, recordId];
}
