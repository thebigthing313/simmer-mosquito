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

import { coalesce, eq, useLiveSuspenseQuery } from '@tanstack/react-db';
import { addresses } from '../../lib/collections/addresses';
import { habitat_types } from '../../lib/collections/habitat_types';
import { habitats } from '../../lib/collections/habitats';
import { profiles } from '../../lib/collections/profiles';
import { type AuditedHabitat, habitatNameSelect } from './habitat-view';
import { addressSelect } from './shared';

export function useHabitatSuspense(habitatId: string): AuditedHabitat | undefined {
	const result = useLiveSuspenseQuery((query) =>
		query
			.from({ habitat: habitats() })
			.where(({ habitat }) => eq(habitat.id, habitatId))
			.join(
				{ type: habitat_types() },
				({ habitat, type }) => eq(habitat.habitat_type_id, type.id),
				'left',
			)
			.join(
				{ address: addresses() },
				({ habitat, address }) => eq(habitat.address_id, address.id),
				'left',
			)
			.join(
				{ creator: profiles() },
				({ habitat, creator }) => eq(habitat.created_by_profile_id, creator.id),
				'left',
			)
			.join(
				{ updater: profiles() },
				({ habitat, updater }) => eq(habitat.updated_by_profile_id, updater.id),
				'left',
			)
			.select(({ habitat, type, address, creator, updater }) => ({
				id: habitat.id,
				address: addressSelect(address),
				name: habitatNameSelect(habitat),
				description: habitat.description,
				typeId: habitat.habitat_type_id,
				typeName: coalesce(type.name, null),
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
				createdByName: coalesce(creator.display_name, null),
				updatedByProfileId: habitat.updated_by_profile_id,
				updatedByName: coalesce(updater.display_name, null),
			})),
	);

	return result.data[0];
}
