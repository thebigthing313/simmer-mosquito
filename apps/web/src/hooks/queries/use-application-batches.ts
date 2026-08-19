/**
 * The lots one application drew from, as link rows.
 *
 * {@link useApplicationBatchNames} answers the same question for a card, which
 * only ever renders them — so it joins the batch table and hands back strings.
 * This is for the two surfaces that *write* them: the detail page removes a link
 * by its own id, and the edit form reconciles a selection against what is
 * already there. Neither can work from names.
 *
 * Mount it wherever batches are written as well as read. The subscription is what
 * keeps this on-demand collection's live stream warm, which is also what lets a
 * write wait for its own txid — see `command-transaction.ts` for why a collection
 * nobody is watching never sees one.
 */

import { eq, useLiveQuery } from '@tanstack/react-db';
import { useMemo } from 'react';
import { application_batches } from '../../lib/collections/application_batches';
import type { ApplicationBatchLink } from '../mutations/use-application-mutations';
import { unmatchableId } from './shared';

// Keep an application's subset warm briefly after unmount so reopening the record
// reuses it rather than re-requesting.
const applicationBatchesGcTimeMs = 30_000;

export interface ApplicationBatchesResult {
	/** The link rows, oldest first. */
	readonly rows: readonly ApplicationBatchLink[];
	/** The lots they point at — what a form's field holds. */
	readonly insecticideBatchIds: readonly string[];
	readonly isReady: boolean;
	readonly isError: boolean;
}

export function useApplicationBatches(applicationId: string | null): ApplicationBatchesResult {
	const result = useLiveQuery(
		{
			gcTime: applicationBatchesGcTimeMs,
			query: (query) =>
				query
					.from({ entry: application_batches })
					.where(({ entry }) => eq(entry.application_id, applicationId ?? unmatchableId))
					.orderBy(({ entry }) => entry.created_at, 'asc')
					.select(({ entry }) => ({
						id: entry.id,
						insecticideBatchId: entry.insecticide_batch_id,
					})),
		},
		[applicationId],
	);

	const rows = result.data;

	// Deduplicated: two link rows naming the same lot are one selection to a form,
	// and reconciling against the raw list would try to add what is already there.
	const insecticideBatchIds = useMemo(
		() => [...new Set(rows.map((row) => row.insecticideBatchId))],
		[rows],
	);

	return {
		rows,
		insecticideBatchIds,
		isReady: result.isReady,
		isError: result.isError,
	};
}
