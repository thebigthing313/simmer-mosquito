import { useLiveSuspenseQuery } from '@tanstack/react-db';
import { insecticides } from '../../lib/collections/insecticides';
import type { InsecticideListing } from './chemical-roster-view';

/** The organization's insecticides as an application form picks from them, with the unit each is measured in. */
export function useInsecticideRoster(): readonly InsecticideListing[] {
	return useLiveSuspenseQuery((query) =>
		query.from({ row: insecticides() }).select(({ row }) => ({
			id: row.id,
			tradeName: row.trade_name,
			isActive: row.is_active,
			defaultUnitId: row.default_unit_id,
		})),
	).data;
}
