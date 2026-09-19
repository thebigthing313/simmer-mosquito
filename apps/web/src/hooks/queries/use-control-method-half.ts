import { eq, useLiveSuspenseQuery } from '@tanstack/react-db';
import type { application_methods } from '../../lib/collections/application_methods';
import type { ControlMethodRecord } from './catalog-record-view';

/** One control method catalog on one side of the lifecycle split, in name order. */
export function useControlMethodHalf(
	collection: ReturnType<typeof application_methods>,
	isActive: boolean,
): readonly ControlMethodRecord[] {
	return useLiveSuspenseQuery((query) =>
		query
			.from({ row: collection })
			.where(({ row }) => eq(row.is_active, isActive))
			.orderBy(({ row }) => row.name, 'asc')
			.select(({ row }) => ({
				id: row.id,
				name: row.name,
				customSchema: row.custom_schema,
				isActive: row.is_active,
			})),
	).data;
}
