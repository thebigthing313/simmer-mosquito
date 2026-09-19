import { eq, useLiveSuspenseQuery } from '@tanstack/react-db';
import { habitat_types } from '../../lib/collections/habitat_types';
import type { SchemaCatalogRecord } from './catalog-record-view';

/** The organization's habitat types on one side of the lifecycle split, in name order. */
export function useHabitatTypeHalf(isActive: boolean): readonly SchemaCatalogRecord[] {
	return useLiveSuspenseQuery((query) =>
		query
			.from({ row: habitat_types() })
			.where(({ row }) => eq(row.is_active, isActive))
			.orderBy(({ row }) => row.name, 'asc')
			.select(({ row }) => ({
				id: row.id,
				name: row.name,
				description: row.description,
				customSchema: row.custom_schema,
				isActive: row.is_active,
			})),
	).data;
}
