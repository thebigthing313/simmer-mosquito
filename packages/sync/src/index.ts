import {
	type ElectricCollectionConfig,
	electricCollectionOptions,
} from '@tanstack/electric-db-collection';

export {
	isTxIdConfirmationTimeout,
	type PersistableTransaction,
	settleWrite,
} from './settle-write.js';

/**
 * How a table streams: the whole thing up front, or the subsets a live query
 * asks for.
 *
 * A parameter rather than a descriptor field, because the same table is wanted
 * differently by different apps — `apps/mobile` needs habitats before the signal
 * goes, `apps/web` is online-only. Each app declares its own; `apps/web` does so
 * in `src/sync/sync-modes.ts`.
 */
export type WebSyncMode = 'eager' | 'on-demand';

export * from './collections/index.js';

export * from './row-payload-mapper.js';
export * from './rows/index.js';

/**
 * A collection over a table's shape route.
 *
 * Takes the table rather than a descriptor, because a descriptor's remaining
 * fields were the table name spelled four ways: its `id` was the table, its
 * `getKey` was `row.id` on all fifty-six, its `endpointPath` is what
 * `shapePathFor` derives, and its `columns` were sent as a query param that the
 * server strips and the Electric client never reads — so that list decided
 * nothing on either side. The server takes its columns from the table's schema.
 *
 * Superseded by the factories in `collections/`, which need no call-site
 * arguments at all. This is what the apps use until they move over.
 */
export function electricShapeCollectionOptions<TRow extends { readonly id: string }>(
	input: {
		/** The Postgres table. Names the collection, and nothing else needs saying. */
		readonly table: string;
		readonly url: string;
		readonly syncMode: WebSyncMode;
	} & Pick<ElectricCollectionConfig<TRow, never>, 'onInsert' | 'onUpdate' | 'onDelete'>,
) {
	return electricCollectionOptions<TRow>({
		id: input.table,
		getKey: (row) => row.id,
		syncMode: input.syncMode,
		...(input.onInsert === undefined ? {} : { onInsert: input.onInsert }),
		...(input.onUpdate === undefined ? {} : { onUpdate: input.onUpdate }),
		...(input.onDelete === undefined ? {} : { onDelete: input.onDelete }),
		shapeOptions: {
			url: input.url,
			// Subset snapshot requests ride in a POST body so large id/predicate sets
			// never hit the URL-length ceiling (and align with Electric 2.0, which
			// deprecates GET for subsets). The live shape-log stream stays on GET.
			subsetMethod: 'POST',
			fetchClient: (request, init) =>
				fetch(request, {
					...init,
					credentials: 'include',
				}),
		},
	});
}
