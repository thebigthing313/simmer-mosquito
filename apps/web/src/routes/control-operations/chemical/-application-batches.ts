import type { ApplicationBatchRow } from '@simmer-mosquito/sync';
import { settleWrite } from '@simmer-mosquito/sync';
import { eq, useLiveQuery } from '@tanstack/react-db';
import { useMemo } from 'react';
import { reconcileLinks } from '../../../sync/reconcile-links';
import { webCollections } from '../../../sync/webCollections';

/**
 * The insecticide lots an application drew from. Add/remove only — a batch link
 * has nothing to update — so both the form and the detail card work off this
 * one read/write seam.
 */

// application_batches is on-demand (docs/sync.md); keep an application's subset
// warm briefly after unmount so reopening the record reuses it.
const applicationBatchesGcTimeMs = 30_000;

export interface ApplicationBatchesResult {
	/** The link rows, oldest first. */
	readonly rows: readonly ApplicationBatchRow[];
	/** The batches they point at — the form's field value. */
	readonly insecticideBatchIds: readonly string[];
	readonly isReady: boolean;
	readonly isError: boolean;
}

/**
 * Load one application's batch links. Mount it wherever batches are written as
 * well as read: the subscription is what keeps the on-demand live stream warm.
 */
export function useApplicationBatches(applicationId: string): ApplicationBatchesResult {
	const result = useLiveQuery(
		{
			gcTime: applicationBatchesGcTimeMs,
			query: (query) =>
				query
					.from({ batch: webCollections.applicationBatches })
					.where(({ batch }) => eq(batch.applicationId, applicationId))
					.orderBy(({ batch }) => batch.createdAt, 'asc'),
		},
		[applicationId],
	);

	const rows = (result.data ?? []) as unknown as readonly ApplicationBatchRow[];
	const insecticideBatchIds = useMemo(
		() => [...new Set(rows.map((row) => row.insecticideBatchId))],
		[rows],
	);

	return { rows, insecticideBatchIds, isReady: result.isReady, isError: result.isError };
}

/**
 * Reconcile an application's batch links with what the form holds.
 *
 * Call it after the application itself has settled: on create the row must
 * exist before a link can reference it.
 */
export async function saveApplicationBatches(input: {
	readonly applicationId: string;
	readonly organizationId: string;
	readonly actorProfileId: string | null;
	/** What is linked now — empty when the application was just created. */
	readonly existing: readonly ApplicationBatchRow[];
	/** Which batches the form says should be linked. */
	readonly insecticideBatchIds: readonly string[];
}): Promise<void> {
	const { removals, additions } = reconcileLinks(
		input.existing,
		(row) => row.insecticideBatchId,
		input.insecticideBatchIds,
	);

	if (removals.length === 0 && additions.length === 0) {
		return;
	}

	const now = new Date().toISOString();
	await Promise.all([
		...removals.map((row) => settleWrite(webCollections.applicationBatches.delete(row.id))),
		...additions.map((insecticideBatchId) =>
			settleWrite(
				webCollections.applicationBatches.insert({
					id: crypto.randomUUID(),
					organizationId: input.organizationId,
					applicationId: input.applicationId,
					insecticideBatchId,
					createdByProfileId: input.actorProfileId,
					updatedByProfileId: input.actorProfileId,
					createdAt: now,
					updatedAt: now,
				} satisfies ApplicationBatchRow),
			),
		),
	]);
}
