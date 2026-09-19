import { eq, useLiveQuery } from '@tanstack/react-db';
import { insecticide_batches } from '../../lib/collections/insecticide_batches';
import { batchesGcTimeMs, type InsecticideBatchRecord } from './use-insecticide-records';
/** One insecticide's batches, read on demand and gated on the subset being ready. */
export function useInsecticideBatches(insecticideId: string): {
	readonly batches: readonly InsecticideBatchRecord[];
	readonly isReady: boolean;
	readonly isError: boolean;
} {
	const result = useLiveQuery({
		gcTime: batchesGcTimeMs,
		query: (query) =>
			query
				.from({ batch: insecticide_batches() })
				.where(({ batch }) => eq(batch.insecticide_id, insecticideId))
				.orderBy(({ batch }) => batch.is_active, 'desc')
				.orderBy(({ batch }) => batch.batch_name, 'asc')
				.select(({ batch }) => ({
					id: batch.id,
					insecticideId: batch.insecticide_id,
					batchName: batch.batch_name,
					isActive: batch.is_active,
				})),
	});

	return {
		batches: result.data ?? [],
		isReady: result.isReady,
		isError: result.isError,
	};
}
