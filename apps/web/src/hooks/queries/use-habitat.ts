/**
 * One Habitat, for a surface that draws its own pending state.
 *
 * The map cards and the inspection form's read-only Habitat field, which appear
 * beside content that is already on screen — so they show their own placeholder
 * rather than suspending and blanking what surrounds them. The detail page wants
 * the opposite; that is `use-habitat-suspense.ts`.
 */

import { caseWhen, coalesce, concat, eq, isNull } from '@tanstack/react-db';
import { addresses } from '../../lib/collections/addresses';
import { habitat_types } from '../../lib/collections/habitat_types';
import { habitats } from '../../lib/collections/habitats';
import type { Habitat } from './habitat-view';
import { addressSelect, useRecordById } from './shared';

/**
 * Takes a nullable id so a form can ask before the user has chosen a Habitat,
 * which is {@link useRecordById}'s absent case.
 */
export function useHabitat(
	habitatId: string | null,
	options?: { readonly gcTime?: number },
): { readonly habitat: Habitat | undefined; readonly isReady: boolean; readonly isError: boolean } {
	const result = useRecordById({
		collection: habitats(),
		id: habitatId,
		gcTime: options?.gcTime,
		query: (query) =>
			query
				// `left`: a Habitat need not have a type, and an `inner` join would make
				// an untyped one disappear from its own card.
				.join(
					{ type: habitat_types() },
					({ record: habitat, type }) => eq(habitat.habitat_type_id, type.id),
					'left',
				)
				.join(
					{ address: addresses() },
					({ record: habitat, address }) => eq(habitat.address_id, address.id),
					'left',
				)
				.select(({ record: habitat, type, address }) => ({
					id: habitat.id,
					address: addressSelect(address),
					name: coalesce(habitat.habitat_name, concat(habitat.lat, ', ', habitat.lng)),
					description: habitat.description,
					typeId: habitat.habitat_type_id,
					// Guarded on the Habitat's own column, so an unmatched join reads as
					// `null` rather than as `undefined`.
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
	});

	return { habitat: result.record, isReady: result.isReady, isError: result.isError };
}
