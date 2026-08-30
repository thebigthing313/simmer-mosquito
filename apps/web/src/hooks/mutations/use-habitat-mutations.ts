/**
 * Mapping a larval habitat, correcting one, and taking one out of service.
 *
 * ## One save, up to three commands
 *
 * The habitat form is one screen, but the domain splits what it collects three
 * ways and each half is a different builder that ignores the others' fields:
 *
 * - the name, the description and the custom fields are `updateHabitatDetails`
 * - the address and the habitat type are `updateHabitatConfiguration`
 * - the drawn shape is `updateHabitatLocation`
 *
 * The route this replaces sent all six columns under one nameless PATCH and let
 * `buildHabitatUpdateCommands` guess which commands were meant from which keys
 * arrived. Naming them here means the guess is gone — but it also means a save
 * that names a command with nothing to change is *refused*, because the domain
 * will not run one. So the intents are computed from a real comparison against
 * the row as it stands, never declared up front.
 *
 * All three travel as one write. TanStack DB merges two updates to a key and
 * keeps only the last `metadata`, so a second call would arrive carrying the
 * first command's fields under the second command's name and be dropped behind
 * a 200.
 *
 * ## The geometry is a location source, not a column
 *
 * `geom` never syncs (ADR 0009), so the shape rides beside the row as
 * `{ kind: 'geometry', geometry }` rather than in it. The centroid columns
 * `lat`/`lng`/`geom_type` are written optimistically all the same, because the
 * pin on the map has to move before the server answers — the trigger overwrites
 * them with its own when the row syncs back.
 *
 * ## The delete asks; the other four still do not
 *
 * Five of these commands take an acknowledgement. Deleting a habitat unlinks its
 * inspections and any control work recorded against it, and {@link remove} sends
 * both flags withheld so the delete registry answers with the counts — see
 * `lib/acknowledgement-copy.ts`. The other three, changing a habitat's
 * configuration or location and retiring it, still send nothing, and
 * `acknowledged()` on the server reads an absent flag as answered. Turning one
 * of those on means sending it as `false` from the form and giving the surface a
 * test that says so, which is the whole of #319.
 */

import type { GeoJsonGeometry } from '@simmer-mosquito/mapping';
import { type Habitat, settleWrite } from '@simmer-mosquito/sync';
import { useCallback } from 'react';
import { habitats } from '../../lib/collections/habitats';
import { mutateCollection } from '../../lib/collections/mutate';
import { useAuthSnapshot } from '../use-auth-snapshot';
import { newRecordId, optimisticStamp } from './shared';

/** Where a habitat sits, as the form holds it before the row is built. */
export interface HabitatCentroid {
	readonly lat: number;
	readonly lng: number;
	readonly geomType: string;
}

/** A habitat as its form holds one, before the shape. */
export interface HabitatFields {
	/** `null` when the crew left it unnamed — the detail page labels it by coordinates. */
	readonly habitatName: string | null;
	readonly description: string;
	/** `null` when the habitat is not tied to an address. */
	readonly addressId: string | null;
	/** `null` for an unclassified habitat, which is allowed. */
	readonly habitatTypeId: string | null;
	readonly metadata: unknown;
}

export interface HabitatMutations {
	/** Returns the new habitat's id, so the caller can navigate to it. */
	readonly create: (
		fields: HabitatFields,
		geometry: GeoJsonGeometry,
		centroid: HabitatCentroid,
	) => Promise<string>;
	/**
	 * Save an edited habitat.
	 *
	 * `geometry` is null when the shape was not redrawn, which is not the same as
	 * clearing it: naming the location command with the shape it already has is a
	 * write with no edit behind it, and the domain refuses it.
	 *
	 * Resolves without sending anything when nothing moved, so a form's Save on an
	 * untouched record is not a refused request.
	 */
	readonly save: (
		habitatId: string,
		fields: HabitatFields,
		current: HabitatFields,
		geometry: { readonly geometry: GeoJsonGeometry; readonly centroid: HabitatCentroid } | null,
	) => Promise<void>;
	/** Whether crews can reach it — two commands rather than a boolean read for its direction. */
	readonly setInaccessible: (habitatId: string, isInaccessible: boolean) => Promise<void>;
	/** In or out of service. Retiring drops the habitat from any route that visits it. */
	readonly setActive: (habitatId: string, isActive: boolean) => Promise<void>;
	/**
	 * Delete a habitat.
	 *
	 * `acknowledgements` is what the user answered. Withheld flags go on the wire
	 * as `false`, which is the only reading that makes the registry refuse.
	 */
	readonly remove: (
		habitatId: string,
		acknowledgements?: Readonly<Record<string, boolean>>,
	) => Promise<void>;
	/** False while the auth snapshot is still resolving; every write throws until then. */
	readonly canWrite: boolean;
}

export function useHabitatMutations(): HabitatMutations {
	const auth = useAuthSnapshot();
	const identity = auth?.authenticated === true ? auth.localIdentity : null;
	const organizationId = identity?.organizationId ?? null;
	const actorProfileId = identity?.profileId ?? null;

	const create = useCallback(
		async (fields: HabitatFields, geometry: GeoJsonGeometry, centroid: HabitatCentroid) => {
			if (organizationId === null) {
				throw new Error('Organization details are still loading.');
			}

			const now = optimisticStamp();
			const habitatId = newRecordId();
			await settleWrite(
				mutateCollection(habitats, {
					operation: 'insert',
					intent: 'larvalSurveillance.createHabitat',
					row: {
						id: habitatId,
						organization_id: organizationId,
						lat: centroid.lat,
						lng: centroid.lng,
						geom_type: centroid.geomType,
						address_id: fields.addressId,
						habitat_type_id: fields.habitatTypeId,
						habitat_name: fields.habitatName,
						description: fields.description,
						is_active: true,
						is_inaccessible: false,
						metadata: fields.metadata ?? null,
						created_by_profile_id: actorProfileId,
						updated_by_profile_id: actorProfileId,
						created_at: now,
						updated_at: now,
					} satisfies Habitat,
					locationSource: { kind: 'geometry', geometry },
				}),
			);
			return habitatId;
		},
		[organizationId, actorProfileId],
	);

	const save = useCallback(
		async (
			habitatId: string,
			fields: HabitatFields,
			current: HabitatFields,
			geometry: { readonly geometry: GeoJsonGeometry; readonly centroid: HabitatCentroid } | null,
		) => {
			const intents: (
				| 'larvalSurveillance.updateHabitatDetails'
				| 'larvalSurveillance.updateHabitatConfiguration'
				| 'larvalSurveillance.updateHabitatLocation'
			)[] = [];
			const changes: Partial<Habitat> = {};

			if (
				fields.habitatName !== current.habitatName ||
				fields.description !== current.description ||
				metadataChanged(current.metadata, fields.metadata)
			) {
				intents.push('larvalSurveillance.updateHabitatDetails');
				changes.habitat_name = fields.habitatName;
				changes.description = fields.description;
				changes.metadata = fields.metadata ?? null;
			}

			if (
				fields.addressId !== current.addressId ||
				fields.habitatTypeId !== current.habitatTypeId
			) {
				intents.push('larvalSurveillance.updateHabitatConfiguration');
				changes.address_id = fields.addressId;
				changes.habitat_type_id = fields.habitatTypeId;
			}

			if (geometry !== null) {
				intents.push('larvalSurveillance.updateHabitatLocation');
				changes.lat = geometry.centroid.lat;
				changes.lng = geometry.centroid.lng;
				changes.geom_type = geometry.centroid.geomType;
			}

			if (intents.length === 0) {
				return;
			}

			await settleWrite(
				mutateCollection(habitats, {
					operation: 'update',
					intent: intents,
					key: habitatId,
					changes: {
						...changes,
						updated_by_profile_id: actorProfileId,
						updated_at: optimisticStamp(),
					},
					// Absent unless the location command is one of the names: a shape sent
					// under a command with no reader for it is a key the server ignores,
					// and sending one anyway makes the body claim an edit it is not making.
					...(geometry === null
						? {}
						: { locationSource: { kind: 'geometry', geometry: geometry.geometry } }),
				}),
			);
		},
		[actorProfileId],
	);

	const setInaccessible = useCallback(
		async (habitatId: string, isInaccessible: boolean) => {
			await settleWrite(
				mutateCollection(habitats, {
					operation: 'update',
					intent: isInaccessible
						? 'larvalSurveillance.markHabitatInaccessible'
						: 'larvalSurveillance.clearHabitatInaccessible',
					key: habitatId,
					changes: {
						is_inaccessible: isInaccessible,
						updated_by_profile_id: actorProfileId,
						updated_at: optimisticStamp(),
					},
				}),
			);
		},
		[actorProfileId],
	);

	const setActive = useCallback(
		async (habitatId: string, isActive: boolean) => {
			await settleWrite(
				mutateCollection(habitats, {
					operation: 'update',
					intent: isActive
						? 'larvalSurveillance.reactivateHabitat'
						: 'larvalSurveillance.retireHabitat',
					key: habitatId,
					changes: {
						is_active: isActive,
						updated_by_profile_id: actorProfileId,
						updated_at: optimisticStamp(),
					},
				}),
			);
		},
		[actorProfileId],
	);

	const remove = useCallback(
		async (habitatId: string, acknowledgements: Readonly<Record<string, boolean>> = {}) => {
			await settleWrite(
				mutateCollection(habitats, {
					operation: 'delete',
					intent: 'larvalSurveillance.deleteHabitat',
					key: habitatId,
					// A delete carries no row and no changed fields, so an acknowledgement
					// is the only thing it can say beyond the command's name.
					acknowledgements,
				}),
			);
		},
		[],
	);

	return {
		create,
		save,
		setInaccessible,
		setActive,
		remove,
		canWrite: organizationId !== null && actorProfileId !== null,
	};
}

/**
 * Whether the custom fields differ.
 *
 * Compared by serialization because `metadata` is an opaque object the form
 * rebuilds on every render — a reference check would name
 * `updateHabitatDetails` on every save, including the ones that changed only the
 * address, and the domain would refuse the details command for having nothing in
 * it.
 */
function metadataChanged(before: unknown, after: unknown): boolean {
	return JSON.stringify(before ?? null) !== JSON.stringify(after ?? null);
}
