import type { Collection } from '@tanstack/db';
import { useLiveSuspenseQuery } from '@tanstack/react-db';
import type { SchemaCatalogListing } from './catalog-roster-view';

/** A catalog with a custom schema, as a record form picks from it. */
export function useSchemaCatalogRoster<
	TRow extends {
		readonly id: string;
		readonly name: string;
		readonly is_active: boolean;
		readonly custom_schema: unknown;
	},
>(collection: Collection<TRow, string | number>): readonly SchemaCatalogListing[] {
	const result = useLiveSuspenseQuery((query) =>
		query.from({ row: collection }).select(({ row }) => ({
			id: row.id,
			name: row.name,
			isActive: row.is_active,
			customSchema: row.custom_schema,
		})),
	);

	return result.data;
}
