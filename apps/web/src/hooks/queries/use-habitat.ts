/**
 * One Habitat, for a surface that draws its own pending state.
 *
 * The map cards and the inspection form's read-only Habitat field, which appear
 * beside content that is already on screen — so they show their own placeholder
 * rather than suspending and blanking what surrounds them. The detail page wants
 * the opposite; that is `use-habitat-suspense.ts`.
 */

import { coalesce, concat, eq, useLiveQuery } from '@tanstack/react-db';
import { habitats } from '../../lib/collections/habitats';
import type { Habitat } from './habitat-view';
import { mapCardGcTimeMs, unmatchableId } from './shared';

/**
 * Takes a nullable id so a form can ask before the user has chosen a Habitat. A
 * hook cannot be called conditionally, so the absent case asks for an id no row
 * has rather than being skipped — which is an empty result instead of the table.
 */
export function useHabitat(
	habitatId: string | null,
	options?: { readonly gcTime?: number },
): { readonly habitat: Habitat | undefined; readonly isReady: boolean } {
	const result = useLiveQuery(
		{
			gcTime: options?.gcTime ?? mapCardGcTimeMs,
			query: (query) =>
				query
					.from({ habitat: habitats })
					.where(({ habitat }) => eq(habitat.id, habitatId ?? unmatchableId))
					.select(({ habitat }) => ({
						id: habitat.id,
						name: coalesce(habitat.habitat_name, concat(habitat.lat, ', ', habitat.lng)),
						description: habitat.description,
						typeId: habitat.habitat_type_id,
						addressId: habitat.address_id,
						isActive: habitat.is_active,
						isInaccessible: habitat.is_inaccessible,
						latitude: habitat.lat,
						longitude: habitat.lng,
						geometryKind: habitat.geom_type,
						metadata: habitat.metadata,
						createdAt: habitat.created_at,
						updatedAt: habitat.updated_at,
						createdByProfileId: habitat.created_by_profile_id,
						updatedByProfileId: habitat.updated_by_profile_id,
					})),
		},
		[habitatId],
	);

	return { habitat: result.data[0], isReady: result.isReady };
}
