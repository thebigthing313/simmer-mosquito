/**
 * The insecticide batches one application drew from, by name.
 *
 * Keyed on the application id and nothing else, so it starts on the same render
 * as {@link useApplication} rather than after it. That is what makes it a
 * separate hook rather than a waterfall: the batch link table already names both
 * the application and the batch, so nothing here has to wait for a column the
 * application row returns.
 *
 * A link row whose batch has not streamed has no name to show, and a blank entry
 * in `Batch A, , C` reads as a data problem rather than as a pending one. The
 * old code dropped those the same way, by looking each id up in a map and
 * skipping the misses. Until #1028 that was an `inner` join; it is a `left` join
 * with the unmatched rows dropped after it, for the reason below.
 *
 * ## Why the join is `left` and the sort is in JavaScript (#1028)
 *
 * Both tables are on-demand (`docs/sync.md`), so what each subset request
 * carries is what the browser loads. Measured against the memory source with two
 * links on two batches, the `inner` join this used to make sent the
 * `insecticide_batches` subset with **no predicate at all**, only the `orderBy`,
 * and the links subset as `(application_id = a1 and insecticide_batch_id = ANY
 * [b1, b2])`: the whole batches table streamed to name two rows on a card, and
 * the links were then fetched by batch id, which is the join running backwards.
 *
 * The cause is `getActiveAndLazySources` in `@tanstack/db`'s join compiler,
 * which #1026 found. For an `inner` join it loads whole whichever collection
 * holds fewer rows in the browser at compile time and lazy-loads the other by
 * join key, so on a cold page, where both hold zero, the batches side streams
 * whole. A `left` join always lazy-loads the joined side by its key. Measured
 * the same way, the links subset is `application_id = a1` and the batches
 * subset is `id = ANY [b1, b2]`. The suite beside this asserts both strings.
 *
 * The `orderBy` stays off the query for the reason #1026 gave: the list is a
 * handful of names, and leaving the join nothing to read off the batches side
 * but the key is what keeps the lazy request to the ids. The engine sorted
 * strings with `localeCompare`, so sorting the same way here changes no order.
 */

import { eq, useLiveQuery } from '@tanstack/react-db';
import { application_batches } from '../../lib/collections/application_batches';
import { insecticide_batches } from '../../lib/collections/insecticide_batches';
import { mapCardGcTimeMs, unmatchableId } from './shared';

/**
 * Whether the joined side of a row arrived.
 *
 * An unmatched `left` join yields `undefined` for the whole `batch` namespace,
 * and the builder types every column off it as possibly absent, so the name is
 * `undefined` on a row whose batch has not streamed and a string on one whose
 * batch has.
 */
function hasName(name: string | undefined): name is string {
	return name !== undefined;
}

export function useApplicationBatchNames(applicationId: string | null): readonly string[] {
	const result = useLiveQuery(
		{
			gcTime: mapCardGcTimeMs,
			query: (query) =>
				query
					.from({ entry: application_batches() })
					.where(({ entry }) => eq(entry.application_id, applicationId ?? unmatchableId))
					.join(
						{ batch: insecticide_batches() },
						({ entry, batch }) => eq(entry.insecticide_batch_id, batch.id),
						'left',
					)
					.select(({ batch }) => ({ name: batch.batch_name })),
		},
		[applicationId],
	);

	// Memoized rather than mapped inline: `result.data` is the observer's cached
	// snapshot, so this hands back the same array until a batch actually changes.
	const names = result.data.map((row) => row.name).filter(hasName);
	names.sort((a, b) => a.localeCompare(b));
	return names;
}
