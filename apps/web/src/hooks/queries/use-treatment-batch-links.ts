/**
 * The batch links on a Treatment's lines, as link rows: which lot each line
 * drew from, with the link's own id. Takes the line ids, which `useTreatment`
 * reads, and answers ready with no rows for an empty list.
 *
 * The edit form reads these so a kept lot travels with its stored link id,
 * because the server refuses a stored link id sent with a different batch, and
 * so a removed line can say how many links go with it.
 */

import { inArray, useLiveQuery } from '@tanstack/react-db';
import { application_batches } from '../../lib/collections/application_batches';
import { liveQueryGcTimeMs, unmatchableId } from './shared';

/** One stored link: a line, and one lot it drew from. */
export interface TreatmentBatchLink {
	readonly id: string;
	/** The Chemical Application the link names. */
	readonly applicationId: string;
	readonly insecticideBatchId: string;
}

export interface TreatmentBatchLinksResult {
	/** The link rows, oldest first. */
	readonly rows: readonly TreatmentBatchLink[];
	readonly isReady: boolean;
	readonly isError: boolean;
}

export function useTreatmentBatchLinks(lineIds: readonly string[]): TreatmentBatchLinksResult {
	// Sorted so the query reads the same set whatever order the lines arrive in.
	const ids = [...new Set(lineIds)].sort();
	const result = useLiveQuery({
		gcTime: liveQueryGcTimeMs,
		query: (query) =>
			query
				.from({ entry: application_batches() })
				.where(({ entry }) => inArray(entry.application_id, ids.length > 0 ? ids : [unmatchableId]))
				.orderBy(({ entry }) => entry.created_at, 'asc')
				.select(({ entry }) => ({
					id: entry.id,
					applicationId: entry.application_id,
					insecticideBatchId: entry.insecticide_batch_id,
				})),
	});

	return { rows: result.data, isReady: result.isReady, isError: result.isError };
}
