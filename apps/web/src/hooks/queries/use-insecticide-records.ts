/**
 * The agency's insecticides and their batches, as the chemical catalog needs them.
 *
 * Two reads with different sync modes behind them. Products are eager — every
 * application form picks one — so the list is one query over the whole table.
 * Batches are on-demand, so they are read one product at a time, and through the
 * status-gated `useLiveQuery` rather than the suspense variant: the suspense hook
 * sticks after a navigation unmount over an on-demand collection.
 *
 * The list is one query rather than the two halves the lookup catalogs use. This
 * page renders retired products inline under a disclosure rather than as a second
 * table, and the order — active first, then by trade name — is what puts them
 * there.
 */

import type { InsecticideType } from '@simmer-mosquito/domain';
import { eq, useLiveQuery, useLiveSuspenseQuery } from '@tanstack/react-db';
import { insecticide_batches } from '../../lib/collections/insecticide_batches';
import { insecticides } from '../../lib/collections/insecticides';

/** How long a product's batches stay warm after its row collapses. */
const batchesGcTimeMs = 30_000;

/** A product as the catalog lists and edits one. */
export interface InsecticideRecord {
	readonly id: string;
	readonly tradeName: string;
	readonly activeIngredient: string;
	readonly type: InsecticideType;
	readonly registrationNumber: string;
	readonly defaultUnitId: string;
	readonly labelUrl: string | null;
	readonly msdsUrl: string | null;
	readonly shorthand: string | null;
	readonly metadata: unknown;
	readonly isActive: boolean;
}

/** A batch as the list under a product shows one. */
export interface InsecticideBatchRecord {
	readonly id: string;
	readonly insecticideId: string;
	readonly batchName: string;
	readonly isActive: boolean;
}

/** Every product, active ones first and then by trade name. */
export function useInsecticideRecords(): readonly InsecticideRecord[] {
	return useLiveSuspenseQuery(
		(query) =>
			query
				.from({ row: insecticides() })
				.orderBy(({ row }) => row.is_active, 'desc')
				.orderBy(({ row }) => row.trade_name, 'asc')
				.select(({ row }) => ({
					id: row.id,
					tradeName: row.trade_name,
					activeIngredient: row.active_ingredient,
					type: row.type,
					registrationNumber: row.registration_number,
					defaultUnitId: row.default_unit_id,
					labelUrl: row.label_url,
					msdsUrl: row.msds_url,
					shorthand: row.shorthand,
					metadata: row.metadata,
					isActive: row.is_active,
				})),
		[],
	).data;
}

export function useInsecticideBatches(insecticideId: string): {
	readonly batches: readonly InsecticideBatchRecord[];
	readonly isReady: boolean;
	readonly isError: boolean;
} {
	const result = useLiveQuery(
		{
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
		},
		[insecticideId],
	);

	return {
		batches: result.data ?? [],
		isReady: result.isReady,
		isError: result.isError,
	};
}
