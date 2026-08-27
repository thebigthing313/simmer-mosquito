/**
 * The insecticide batches one application drew from, by name.
 *
 * Keyed on the application id and nothing else, so it starts on the same render
 * as {@link useApplication} rather than after it. That is what makes it a
 * separate hook rather than a waterfall: the batch link table already names both
 * the application and the batch, so nothing here has to wait for a column the
 * application row returns.
 *
 * `inner`, unlike almost every other join in this folder: a link row whose batch
 * has not streamed has no name to show, and a blank entry in
 * `Batch A, , C` reads as a data problem rather than as a pending one. The old
 * code dropped those the same way, by looking each id up in a map and skipping
 * the misses.
 */

import { eq, useLiveQuery } from '@tanstack/react-db';
import { useMemo } from 'react';
import { application_batches } from '../../lib/collections/application_batches';
import { insecticide_batches } from '../../lib/collections/insecticide_batches';
import { mapCardGcTimeMs, unmatchableId } from './shared';

export function useApplicationBatchNames(applicationId: string | null): readonly string[] {
	const result = useLiveQuery(
		{
			gcTime: mapCardGcTimeMs,
			query: (query) =>
				query
					.from({ entry: application_batches })
					.where(({ entry }) => eq(entry.application_id, applicationId ?? unmatchableId))
					.join(
						{ batch: insecticide_batches },
						({ entry, batch }) => eq(entry.insecticide_batch_id, batch.id),
						'inner',
					)
					.orderBy(({ batch }) => batch.batch_name, 'asc')
					.select(({ batch }) => ({ name: batch.batch_name })),
		},
		[applicationId],
	);

	const rows = result.data;

	// Memoized rather than mapped inline: `rows` is the observer's cached snapshot,
	// so this hands back the same array until a batch actually changes.
	return useMemo(() => rows.map((row) => row.name), [rows]);
}
