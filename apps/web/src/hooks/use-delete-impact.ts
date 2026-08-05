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
	| 'assignment';

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
 * refetches when the window regains focus. The server re-checks inside the
 * delete transaction regardless; this read is what lets the page say so first
 * instead of failing at the button.
 */
export function useDeleteImpact(recordType: DeletableRecordType, recordId: string) {
	return useQuery({
		queryKey: deleteImpactQueryKey(recordType, recordId),
		queryFn: ({ signal }) => fetchDeleteImpact(recordType, recordId, signal),
		staleTime: 15_000,
	});
}

async function fetchDeleteImpact(
	recordType: DeletableRecordType,
	recordId: string,
	signal: AbortSignal,
): Promise<DeleteImpact> {
	const response = await fetch(
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
