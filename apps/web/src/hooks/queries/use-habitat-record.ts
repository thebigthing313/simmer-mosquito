/**
 * One Habitat, as its own edit form reads it.
 *
 * Narrower than `use-habitat.ts` in what it joins — nothing — and wider in one
 * column that matters: the *raw* `habitat_name`. Every display surface coalesces
 * that to the coordinates when it is null, which is right on a card and wrong in
 * a text field, where it would put a centroid in the name box and save it the
 * next time someone pressed Save.
 *
 * `updatedAt` rides along because the form keys its geometry fetch on it, so a
 * re-opened form loads the shape as it stands rather than a cached earlier one.
 *
 * `habitats` is on-demand, so this uses the status-gated `useLiveQuery` rather
 * than the suspense variant, which sticks after a navigation unmount over an
 * on-demand collection. `isReady` separates "no such habitat" from "it has not
 * arrived yet" — both read as `undefined`, and the difference decides between a
 * not-found page and a skeleton.
 */

import { eq, useLiveQuery } from '@tanstack/react-db';
import { habitats } from '../../lib/collections/habitats';
import { mapCardGcTimeMs, unmatchableId } from './shared';

/** A Habitat as its edit form holds one. */
export interface HabitatRecord {
	readonly id: string;
	/** The column, not the display fallback — `null` when the crew left it unnamed. */
	readonly habitatName: string | null;
	readonly description: string;
	readonly addressId: string | null;
	readonly habitatTypeId: string | null;
	readonly metadata: unknown;
	readonly isActive: boolean;
	readonly isInaccessible: boolean;
	readonly latitude: number;
	readonly longitude: number;
	/** What the geometry fetch is keyed on, so an edited shape is not read back stale. */
	readonly updatedAt: Date;
}

export function useHabitatRecord(habitatId: string | null | undefined): {
	readonly habitat: HabitatRecord | undefined;
	readonly isReady: boolean;
	readonly isError: boolean;
} {
	const id = habitatId ?? unmatchableId;

	const result = useLiveQuery(
		{
			gcTime: mapCardGcTimeMs,
			query: (query) =>
				query
					.from({ habitat: habitats() })
					.where(({ habitat }) => eq(habitat.id, id))
					.select(({ habitat }) => ({
						id: habitat.id,
						habitatName: habitat.habitat_name,
						description: habitat.description,
						addressId: habitat.address_id,
						habitatTypeId: habitat.habitat_type_id,
						metadata: habitat.metadata,
						isActive: habitat.is_active,
						isInaccessible: habitat.is_inaccessible,
						latitude: habitat.lat,
						longitude: habitat.lng,
						updatedAt: habitat.updated_at,
					})),
		},
		[id],
	);

	return { habitat: result.data[0], isReady: result.isReady, isError: result.isError };
}
