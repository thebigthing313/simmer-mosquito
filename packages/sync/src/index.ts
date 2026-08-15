import {
	type ElectricCollectionConfig,
	electricCollectionOptions,
} from '@tanstack/electric-db-collection';
import * as syncDescriptors from './descriptors/index.js';

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

export interface SyncDescriptor<TRow extends { readonly id: string }> {
	readonly id: string;
	readonly table: string;
	readonly endpointPath: string;
	readonly columns: readonly (keyof TRow & string)[];
	readonly getKey: (row: TRow) => string;
}

/**
 * Everything the server needs to register a shape route, with the row type
 * erased so one loop can carry all of them.
 *
 * No scope: which rows an agency may read is the server's decision and lives in
 * its own map, keyed by table. A descriptor that carried one would be a second
 * place for the answer to be written, and a second place for it to be wrong.
 */
export interface SyncShapeRoute {
	readonly id: string;
	readonly table: string;
	readonly endpointPath: string;
	readonly columns: readonly string[];
}

/**
 * The rewrite. Reachable from here so that it is compiled, linted and checked for
 * reachability like everything else — not because anything imports it yet. Both
 * worlds are exported side by side while the call sites move over; the descriptor
 * exports below are what apps still use.
 */
export * from './collections/index.js';

export * from './descriptor-factory.js';
export * from './row-payload-mapper.js';
export * from './rows/index.js';

/**
 * Every shape the server exposes, read off the descriptor barrel rather than
 * listed again. Adding a descriptor file adds its route; there is no second
 * place to remember, and no way for a path to be typed twice and disagree.
 *
 * This is the only list. There used to be two more beside it —
 * `observationalReadOnlySyncDescriptors` and `foundationWritableSyncDescriptors`,
 * plus an alias each — which stated all fifty-five descriptors again in a
 * hand-maintained order and split them by whether `apps/web` writes to the table.
 * Neither app ever read them: which collections an app creates, and which of them
 * take writes, is the app's own decision and is made in `apps/web/src/sync`.
 */
export const syncShapeDescriptors: readonly SyncShapeRoute[] = Object.values(syncDescriptors);

export * from './descriptors/index.js';

export function electricShapeCollectionOptions<TRow extends { readonly id: string }>(
	input: {
		readonly descriptor: SyncDescriptor<TRow>;
		readonly url: string;
		readonly syncMode: WebSyncMode;
	} & Pick<ElectricCollectionConfig<TRow, never>, 'onInsert' | 'onUpdate' | 'onDelete'>,
) {
	return electricCollectionOptions<TRow>({
		id: input.descriptor.id,
		getKey: input.descriptor.getKey,
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
			params: {
				table: input.descriptor.table,
				columns: [...input.descriptor.columns],
			},
		},
	});
}
