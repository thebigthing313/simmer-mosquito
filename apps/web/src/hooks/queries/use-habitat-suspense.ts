/**
 * One Habitat, for a surface that is nothing without it.
 *
 * The detail page, which has no content of its own until the record arrives, so it
 * suspends and the route's skeleton stands in. Surfaces that draw beside existing
 * content use `use-habitat.ts` and render their own pending state.
 *
 * `undefined` here means the Habitat does not exist rather than that it is still
 * loading — the loading case never returns.
 */

import { caseWhen, coalesce, concat, eq, isNull, useLiveSuspenseQuery } from '@tanstack/react-db';
import { addresses } from '../../lib/collections/addresses';
import { habitat_types } from '../../lib/collections/habitat_types';
import { habitats } from '../../lib/collections/habitats';
import type { Habitat } from './habitat-view';

export function useHabitatSuspense(habitatId: string): Habitat | undefined {
	const result = useLiveSuspenseQuery(
		(query) =>
			query
				.from({ habitat: habitats })
				.where(({ habitat }) => eq(habitat.id, habitatId))
				.join(
					{ type: habitat_types },
					({ habitat, type }) => eq(habitat.habitat_type_id, type.id),
					'left',
				)
				.join(
					{ address: addresses },
					({ habitat, address }) => eq(habitat.address_id, address.id),
					'left',
				)
				.select(({ habitat, type, address }) => ({
					id: habitat.id,
					address: {
						id: address.id,
						displayName: address.display_name,
						addressLine1: address.address_line_1,
						addressLine2: address.address_line_2,
						locality: address.locality,
						region: address.region,
						postalCode: address.postal_code,
					},
					name: coalesce(habitat.habitat_name, concat(habitat.lat, ', ', habitat.lng)),
					description: habitat.description,
					typeId: habitat.habitat_type_id,
					typeName: caseWhen(isNull(habitat.habitat_type_id), null, type.name),
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
		[habitatId],
	);

	return result.data[0];
}
