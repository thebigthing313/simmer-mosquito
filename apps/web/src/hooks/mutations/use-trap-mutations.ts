/**
 * Placing a trap, correcting one, and taking one out of service.
 *
 * ## One save, up to three commands
 *
 * A trap's form is one screen and the domain splits what it collects three ways,
 * each a builder that ignores the others' fields:
 *
 * - the name, the code and the description are `updateTrapDetails`
 * - the method, the lure, the address and the point are `updateTrapConfiguration`
 * - the Active switch is `retireTrap` or `reactivateTrap`
 *
 * The split is not arbitrary. A trap's label is what a historical collection is
 * read back under, so renaming one is a different kind of edit from moving it —
 * which is why the details command carries an acknowledgement the configuration
 * command does not.
 *
 * The route this replaces sent all seven columns under one nameless PATCH and
 * let the server reconstruct the commands from which keys arrived, including
 * reading `is_active` for its direction. Naming them here means the guess is
 * gone — and it also means a save that names a command with nothing to change is
 * *refused*, because the domain will not run one. So the intents are computed
 * from a real comparison against the row as it stands, never declared up front.
 *
 * All three travel as one write. TanStack DB merges two updates to a key and
 * keeps only the last `metadata`, so a second call would arrive carrying the
 * first command's fields under the second command's name and be dropped behind a
 * 200.
 *
 * ## A create can also be two commands
 *
 * The Add Trap form offers the same Active switch, and the POST body it replaces
 * had no `is_active` in it — so a trap added inactive was written active, and the
 * switch the user had just turned off flicked back on when the write synced.
 * Naming `retireTrap` beside `createTrap` is what makes the switch mean
 * something; both commit in the one transaction the request runs. The eight
 * lookup catalogs do the same thing for the same reason (`catalog-writes.ts`).
 *
 * ## The point is a location source, not a column
 *
 * `geom` never syncs (ADR 0009), so the trap's point rides beside the row as
 * `{ kind: 'geometry', geometry }` rather than in it. The centroid columns
 * `lat`/`lng`/`geom_type` are written optimistically all the same, because the
 * pin on the map has to move before the server answers — the trigger overwrites
 * them with its own when the row syncs back.
 *
 * A trap's address is reference only and independent of its point, so an edit
 * that changed the address without redrawing the pin sends no location source at
 * all.
 *
 * ## The acknowledgements are not questions this app asks
 *
 * `acknowledgedHistoricalLabelChange` and the two trap-semantics flags were
 * hard-coded to `true` by the route being replaced, so a client had no way to
 * withhold one. Omitting them here preserves that exactly — `acknowledged()` on
 * the server reads an absent flag as answered. `acknowledgedDuplicateTrapCode`
 * is the opposite convention, defaulting to unanswered, and nothing on the
 * server reads it yet; when that check lands, this is the file that grows a
 * parameter for it.
 */

import type { SingleRowCommandType } from '@simmer-mosquito/domain';
import type { GeoJsonGeometry } from '@simmer-mosquito/mapping';
import { settleWrite, type Trap } from '@simmer-mosquito/sync';
import { useCallback } from 'react';
import { mutateCollection } from '../../lib/collections/mutate';
import { traps } from '../../lib/collections/traps';
import { useAuthSnapshot } from '../use-auth-snapshot';
import { newRecordId, optimisticStamp } from './shared';

/** Where a trap sits, as the form holds it before the row is built. */
export interface TrapCentroid {
	readonly lat: number;
	readonly lng: number;
	readonly geomType: string;
}

/** A trap as its form holds one, before the point. */
export interface TrapFields {
	/** `null` when the trap is known by its code alone. */
	readonly trapName: string | null;
	/** `null` when the trap is known by its name alone. */
	readonly trapCode: string | null;
	readonly description: string | null;
	readonly collectionMethodId: string;
	/** `null` on a trap that runs unbaited. */
	readonly collectionLureId: string | null;
	/** Reference only — the point is what the trap is located by. */
	readonly addressId: string | null;
	readonly isActive: boolean;
}

export interface TrapMutations {
	/** Returns the new trap's id, so the caller can navigate to it. */
	readonly create: (
		fields: TrapFields,
		geometry: GeoJsonGeometry,
		centroid: TrapCentroid,
	) => Promise<string>;
	/**
	 * Save an edited trap.
	 *
	 * `geometry` is null when the point was not redrawn, which is not the same as
	 * clearing it: naming the configuration command with the point it already has
	 * is a write with no edit behind it.
	 *
	 * Resolves without sending anything when nothing moved, so a form's Save on an
	 * untouched record is not a refused request.
	 */
	readonly save: (
		trapId: string,
		fields: TrapFields,
		current: TrapFields,
		geometry: { readonly geometry: GeoJsonGeometry; readonly centroid: TrapCentroid } | null,
	) => Promise<void>;
	/** In or out of service — two commands rather than a boolean read for its direction. */
	readonly setActive: (trapId: string, isActive: boolean) => Promise<void>;
	readonly remove: (trapId: string) => Promise<void>;
	/** False while the auth snapshot is still resolving; every write throws until then. */
	readonly canWrite: boolean;
}

export function useTrapMutations(): TrapMutations {
	const auth = useAuthSnapshot();
	const identity = auth?.authenticated === true ? auth.localIdentity : null;
	const organizationId = identity?.organizationId ?? null;
	const actorProfileId = identity?.profileId ?? null;

	const create = useCallback(
		async (fields: TrapFields, geometry: GeoJsonGeometry, centroid: TrapCentroid) => {
			if (organizationId === null) {
				throw new Error('Organization details are still loading.');
			}

			const now = optimisticStamp();
			const trapId = newRecordId();
			await settleWrite(
				mutateCollection(traps, {
					operation: 'insert',
					intent: fields.isActive
						? 'adultSurveillance.createTrap'
						: ['adultSurveillance.createTrap', 'adultSurveillance.retireTrap'],
					row: {
						id: trapId,
						organization_id: organizationId,
						lat: centroid.lat,
						lng: centroid.lng,
						geom_type: centroid.geomType,
						collection_method_id: fields.collectionMethodId,
						address_id: fields.addressId,
						collection_lure_id: fields.collectionLureId,
						trap_name: fields.trapName,
						trap_code: fields.trapCode,
						description: fields.description,
						is_active: fields.isActive,
						created_by_profile_id: actorProfileId,
						updated_by_profile_id: actorProfileId,
						created_at: now,
						updated_at: now,
					} satisfies Trap,
					locationSource: { kind: 'geometry', geometry },
				}),
			);
			return trapId;
		},
		[organizationId, actorProfileId],
	);

	const save = useCallback(
		async (
			trapId: string,
			fields: TrapFields,
			current: TrapFields,
			geometry: { readonly geometry: GeoJsonGeometry; readonly centroid: TrapCentroid } | null,
		) => {
			const intents: SingleRowCommandType[] = [];
			const changes: Partial<Trap> = {};

			if (
				fields.trapName !== current.trapName ||
				fields.trapCode !== current.trapCode ||
				fields.description !== current.description
			) {
				intents.push('adultSurveillance.updateTrapDetails');
				changes.trap_name = fields.trapName;
				changes.trap_code = fields.trapCode;
				changes.description = fields.description;
			}

			if (
				geometry !== null ||
				fields.collectionMethodId !== current.collectionMethodId ||
				fields.collectionLureId !== current.collectionLureId ||
				fields.addressId !== current.addressId
			) {
				intents.push('adultSurveillance.updateTrapConfiguration');
				changes.collection_method_id = fields.collectionMethodId;
				changes.collection_lure_id = fields.collectionLureId;
				changes.address_id = fields.addressId;
				if (geometry !== null) {
					changes.lat = geometry.centroid.lat;
					changes.lng = geometry.centroid.lng;
					changes.geom_type = geometry.centroid.geomType;
				}
			}

			if (fields.isActive !== current.isActive) {
				intents.push(
					fields.isActive ? 'adultSurveillance.reactivateTrap' : 'adultSurveillance.retireTrap',
				);
				changes.is_active = fields.isActive;
			}

			if (intents.length === 0) {
				return;
			}

			await settleWrite(
				mutateCollection(traps, {
					operation: 'update',
					intent: intents,
					key: trapId,
					changes: {
						...changes,
						updated_by_profile_id: actorProfileId,
						updated_at: optimisticStamp(),
					},
					// Absent unless the point was redrawn: a shape sent under a command
					// with no reader for it is a key the server ignores, and sending one
					// anyway makes the body claim an edit it is not making.
					...(geometry === null
						? {}
						: { locationSource: { kind: 'geometry', geometry: geometry.geometry } }),
				}),
			);
		},
		[actorProfileId],
	);

	const setActive = useCallback(
		async (trapId: string, isActive: boolean) => {
			await settleWrite(
				mutateCollection(traps, {
					operation: 'update',
					intent: isActive ? 'adultSurveillance.reactivateTrap' : 'adultSurveillance.retireTrap',
					key: trapId,
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

	const remove = useCallback(async (trapId: string) => {
		await settleWrite(
			mutateCollection(traps, {
				operation: 'delete',
				intent: 'adultSurveillance.deleteTrap',
				key: trapId,
			}),
		);
	}, []);

	return {
		create,
		save,
		setActive,
		remove,
		canWrite: organizationId !== null && actorProfileId !== null,
	};
}
