import type { InsecticideType } from '@simmer-mosquito/domain';
import { useLiveSuspenseQuery } from '@tanstack/react-db';
import { insecticides } from '../../lib/collections/insecticides';

/** How long a product's batches stay warm after its row collapses. */
export const batchesGcTimeMs = 30_000;

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

/** The organization's insecticides, active first then by trade name. */
export function useInsecticideRecords(): readonly InsecticideRecord[] {
	return useLiveSuspenseQuery((query) =>
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
	).data;
}
