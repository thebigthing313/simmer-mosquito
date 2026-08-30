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
 * ## The acknowledgements are the caller's answers
 *
 * Three of these writes carry one. {@link create} and {@link save} take what the
 * form answered and send it, so a withheld flag arrives as `false` and the
 * server refuses with the count behind it. {@link remove} does the same for the
 * collections a trap delete takes with it.
 *
 * Which flag belongs to which command is why `save` does not send both every
 * time. `acknowledgedHistoricalLabelChange` is `updateTrapDetails`, and only a
 * changed name or code can be refused over it, so a description-only edit
 * answers a question nobody asked. `acknowledgedDuplicateTrapCode` is read by
 * `createTrap` and `reactivateTrap` and by neither update command, because
 * retiring a trap frees its code for another to take, so on a save it rides only
 * on the one bringing a retired trap back.
 *
 * That flag is also the one the server reads as `=== true` rather than through
 * `acknowledged()`, so it has been live since before this file sent it.
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
	/**
	 * Returns the new trap's id, so the caller can navigate to it.
	 *
	 * `acknowledgements` is what the form answered. Only
	 * `acknowledgedDuplicateTrapCode` is read here, and it reaches the wire
	 * whether the trap is created active or retired, because the code collision
	 * is `createTrap`'s question either way.
	 */
	readonly create: (
		fields: TrapFields,
		geometry: GeoJsonGeometry,
		centroid: TrapCentroid,
		acknowledgements?: Readonly<Record<string, boolean>>,
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
	 *
	 * `acknowledgements` is what the form answered. Each flag is sent only with
	 * the command that reads it, so an edit that changed neither the label nor the
	 * Active switch carries none of them.
	 */
	readonly save: (
		trapId: string,
		fields: TrapFields,
		current: TrapFields,
		geometry: { readonly geometry: GeoJsonGeometry; readonly centroid: TrapCentroid } | null,
		acknowledgements?: Readonly<Record<string, boolean>>,
	) => Promise<void>;
	/** In or out of service — two commands rather than a boolean read for its direction. */
	readonly setActive: (trapId: string, isActive: boolean) => Promise<void>;
	/**
	 * Delete a trap.
	 *
	 * `acknowledgements` is what the user answered. A withheld flag goes on the
	 * wire as `false`, which is the only reading that makes the registry refuse.
	 */
	readonly remove: (
		trapId: string,
		acknowledgements?: Readonly<Record<string, boolean>>,
	) => Promise<void>;
	/** False while the auth snapshot is still resolving; every write throws until then. */
	readonly canWrite: boolean;
}

export function useTrapMutations(): TrapMutations {
	const auth = useAuthSnapshot();
	const identity = auth?.authenticated === true ? auth.localIdentity : null;
	const organizationId = identity?.organizationId ?? null;
	const actorProfileId = identity?.profileId ?? null;

	const create = useCallback(
		async (
			fields: TrapFields,
			geometry: GeoJsonGeometry,
			centroid: TrapCentroid,
			acknowledgements: Readonly<Record<string, boolean>> = {},
		) => {
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
					// Passed through whole. The form's askable map covers both trap
					// questions, and a flag no handler reads is a key on the body and
					// nothing more, while filtering here would be this file deciding
					// what the endpoint reads.
					acknowledgements,
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
			acknowledgements: Readonly<Record<string, boolean>> = {},
		) => {
			const intents: SingleRowCommandType[] = [];
			const changes: Partial<Trap> = {};
			const answers: Record<string, boolean> = {};

			const changesLabel =
				fields.trapName !== current.trapName || fields.trapCode !== current.trapCode;
			if (changesLabel || fields.description !== current.description) {
				intents.push('adultSurveillance.updateTrapDetails');
				changes.trap_name = fields.trapName;
				changes.trap_code = fields.trapCode;
				changes.description = fields.description;
				// Only a changed name or code can be refused over the trap's history,
				// so a description-only edit does not answer a question nobody asked.
				// The server draws the same line.
				if (changesLabel) {
					answers.acknowledgedHistoricalLabelChange =
						acknowledgements.acknowledgedHistoricalLabelChange === true;
				}
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
				// Retiring a trap frees its code, so bringing one back is where the
				// collision can be found. Retiring it can never hit one.
				if (fields.isActive) {
					answers.acknowledgedDuplicateTrapCode =
						acknowledgements.acknowledgedDuplicateTrapCode === true;
				}
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
					acknowledgements: answers,
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

	const remove = useCallback(
		async (trapId: string, acknowledgements: Readonly<Record<string, boolean>> = {}) => {
			await settleWrite(
				mutateCollection(traps, {
					operation: 'delete',
					intent: 'adultSurveillance.deleteTrap',
					key: trapId,
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
		setActive,
		remove,
		canWrite: organizationId !== null && actorProfileId !== null,
	};
}
