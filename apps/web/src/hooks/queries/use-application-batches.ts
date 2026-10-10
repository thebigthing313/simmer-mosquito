/**
 * The lots one application drew from, as link rows.
 *
 * {@link useApplicationBatchNames} answers the same question for a card, which
 * only ever renders them — so it joins the batch table and hands back strings.
 * This is for the two surfaces that *write* them: the detail page removes a link
 * by its own id, and the edit form reconciles a selection against what is
 * already there. Neither can work from names.
 */

import { eq, useLiveQuery } from '@tanstack/react-db';
import { application_batches } from '../../lib/collections/application_batches';
import type { ApplicationBatchLink } from '../mutations/use-application-mutations';
import { liveQueryGcTimeMs, unmatchableId } from './shared';

export interface ApplicationBatchesResult {
	/** The link rows, oldest first. */
	readonly rows: readonly ApplicationBatchLink[];
	/** The lots they point at — what a form's field holds. */
	readonly insecticideBatchIds: readonly string[];
	readonly isReady: boolean;
	readonly isError: boolean;
}

export function useApplicationBatches(applicationId: string | null): ApplicationBatchesResult {
	const result = useLiveQuery({
		gcTime: liveQueryGcTimeMs,
		query: (query) =>
			query
				.from({ entry: application_batches() })
				.where(({ entry }) => eq(entry.application_id, applicationId ?? unmatchableId))
				.orderBy(({ entry }) => entry.created_at, 'asc')
				.select(({ entry }) => ({
					id: entry.id,
					insecticideBatchId: entry.insecticide_batch_id,
				})),
	});

	const rows = result.data;

	// Deduplicated: two link rows naming the same lot are one selection to a form,
	// and reconciling against the raw list would try to add what is already there.
	const insecticideBatchIds = [...new Set(rows.map((row) => row.insecticideBatchId))];

	return {
		rows,
		insecticideBatchIds,
		isReady: result.isReady,
		isError: result.isError,
	};
}
