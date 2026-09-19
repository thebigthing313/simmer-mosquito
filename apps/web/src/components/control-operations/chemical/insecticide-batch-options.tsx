import type { FieldOption } from '@simmer-mosquito/ui-web/components/form';
import { eq, useLiveQuery } from '@tanstack/react-db';
import type { ReactNode } from 'react';
import { activityGcTimeMs } from '../../../hooks/queries/shared';
import { insecticide_batches } from '../../../lib/collections/insecticide_batches';
import { lifecycleOptions } from '../../../lib/lifecycle-options';

/**
 * The chosen product's lots, as picker options. They sync on demand, so the list
 * comes from a live subset scoped to that product rather than a client-side
 * filter over an eager set — which is why this sits in its own component,
 * mounted only once a product is chosen.
 */
export function InsecticideBatchOptions({
	insecticideId,
	children,
}: {
	readonly insecticideId: string;
	readonly children: (options: readonly FieldOption[]) => ReactNode;
}) {
	const result = useLiveQuery({
		gcTime: activityGcTimeMs,
		query: (query) =>
			query
				.from({ batch: insecticide_batches() })
				.where(({ batch }) => eq(batch.insecticide_id, insecticideId))
				.orderBy(({ batch }) => batch.batch_name, 'asc'),
	});
	const batches = result.data;
	// Spent and retired lots stay on offer, behind the ones still on the shelf —
	// an application being keyed in after the fact used whatever it used.
	const options = lifecycleOptions(
		batches,
		(batch) => batch.is_active,
		(batch) => batch.batch_name,
	);

	return <>{children(options)}</>;
}
