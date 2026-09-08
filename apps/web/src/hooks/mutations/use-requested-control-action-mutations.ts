/**
 * A request for control: raised, edited, closed out, or picked back up.
 *
 * ## Resolving and reopening are names now, not a boolean pair
 *
 * The old endpoint chose between them with
 * `isResolved !== false && resolvedAt !== null`, guarded by
 * `'resolvedAt' in payload || typeof isResolved === 'boolean'` — two keys, one of
 * them optional, folded into one direction. A client clearing the resolution date
 * reopened the request; a client sending `isResolved: true` with no date resolved
 * it at the server's clock. {@link RequestMutations.resolve} and
 * {@link RequestMutations.reopen} each read only what they take.
 *
 * ## The three context columns do not say what the context is
 *
 * `habitat_id`, `inspection_id` and `collection_id` are all on this table, and a
 * larval context with no ids stores the same three nulls as no context at all.
 * The tag is the domain's rather than a column's, so a write states `context` as
 * the instruction it is and the server derives the columns from it. A column diff
 * cannot express the exclusivity — moving `habitat_id` and clearing
 * `collection_id` are two independent facts on the wire.
 *
 * ## An edit names one command or two
 *
 * The details and the location-and-context are separate commands with separate
 * guards, so an edit that only reworded a summary never reaches the location
 * builder. Sending both names over one body is what keeps that one write: TanStack
 * DB merges two updates to a key and keeps only the last `metadata`, so as two
 * calls the first command's fields would arrive under the second's name.
 *
 * ## The requester is not an audit stamp
 *
 * `requested_by_profile_id` and `resolved_by_profile_id` are the domain answer to
 * who asked and who closed it out, which the resolution worklist and the record
 * header both read. The server takes both off the body rather than deriving them,
 * so a write sent before the auth snapshot resolves a profile stores a null
 * nothing fills in later. Raising, editing and closing out refuse until it is in
 * hand.
 */

import type { GeoJsonGeometry } from '@simmer-mosquito/mapping';
import { ownedCentroidFromGeoJson } from '@simmer-mosquito/mapping';
import { type RequestedControlAction as RequestRow, settleWrite } from '@simmer-mosquito/sync';
import { useCallback } from 'react';
import { mutateCollection } from '../../lib/collections/mutate';
import { requested_control_actions } from '../../lib/collections/requested_control_actions';
import { useAuthSnapshot } from '../use-auth-snapshot';
import { contextFor } from './performed-action-writes';
import { lifecycleStamp, optimisticStamp } from './shared';

/** What a request is raised or edited with, as the form holds it. */
export interface RequestFields {
	readonly controlType: RequestRow['control_type'];
	readonly summary: string | null;
	readonly recommendedMethodId: string | null;
	readonly addressId: string | null;
	/** The larval site the request is about, if it is about one. */
	readonly habitatId: string | null;
}

export interface RequestMutations {
	readonly create: (
		requestId: string,
		fields: RequestFields,
		geometry: GeoJsonGeometry,
	) => Promise<void>;
	/**
	 * Save an edited request.
	 *
	 * `geometry` is null when the shape was not redrawn, which is not the same as
	 * clearing it: the server re-resolves `geom` from whatever source it is
	 * handed, so re-sending an unchanged shape is a write with no edit behind it
	 * and a centroid that flickers for nothing.
	 */
	readonly update: (
		requestId: string,
		fields: RequestFields,
		current: RequestFields,
		geometry: GeoJsonGeometry | null,
	) => Promise<void>;
	/** Handled, duplicate, or not feasible all close the same row — which it was belongs in the comments. */
	readonly resolve: (requestId: string) => Promise<void>;
	readonly reopen: (requestId: string) => Promise<void>;
	/**
	 * Delete a request for control.
	 *
	 * `acknowledgements` is what the user answered. Withheld flags go on the wire
	 * as `false`, which is the only reading that makes the registry refuse.
	 */
	readonly remove: (
		requestId: string,
		acknowledgements?: Readonly<Record<string, boolean>>,
	) => Promise<void>;
	/** False while the auth snapshot is still resolving; every write throws until then. */
	readonly canWrite: boolean;
}

export function useRequestedControlActionMutations(): RequestMutations {
	const auth = useAuthSnapshot();
	const identity = auth?.authenticated === true ? auth.localIdentity : null;
	const organizationId = identity?.organizationId ?? null;
	const actorProfileId = identity?.profileId ?? null;

	const create = useCallback(
		async (requestId: string, fields: RequestFields, geometry: GeoJsonGeometry) => {
			if (organizationId === null || actorProfileId === null) {
				throw new Error('Your profile is still loading.');
			}

			// The server recomputes `geom` from the location source, so this seeds the
			// optimistic row only — without it the new pin would not appear until the
			// shape round-trips.
			const centroid = ownedCentroidFromGeoJson(geometry);
			if (centroid === null) {
				throw new Error('Unable to determine the requested location.');
			}

			const now = optimisticStamp();
			await settleWrite(
				mutateCollection(requested_control_actions(), {
					operation: 'insert',
					intent: 'controlOperations.requestControlAction',
					row: {
						id: requestId,
						organization_id: organizationId,
						control_type: fields.controlType,
						recommended_method_id: fields.recommendedMethodId,
						summary: fields.summary,
						habitat_id: fields.habitatId,
						inspection_id: null,
						collection_id: null,
						lat: centroid.lat,
						lng: centroid.lng,
						geom_type: centroid.geomType,
						address_id: fields.addressId,
						requested_by_profile_id: actorProfileId,
						requested_at: lifecycleStamp(),
						resolved_at: null,
						resolved_by_profile_id: null,
						created_by_profile_id: actorProfileId,
						updated_by_profile_id: actorProfileId,
						created_at: now,
						updated_at: now,
					} satisfies RequestRow,
					locationSource: { kind: 'geometry', geometry },
					context: contextFor(fields.habitatId, null),
				}),
			);
		},
		[organizationId, actorProfileId],
	);

	const update = useCallback(
		async (
			requestId: string,
			fields: RequestFields,
			current: RequestFields,
			geometry: GeoJsonGeometry | null,
		) => {
			if (actorProfileId === null) {
				throw new Error('Your profile is still loading.');
			}

			const centroid = geometry === null ? null : ownedCentroidFromGeoJson(geometry);
			if (geometry !== null && centroid === null) {
				throw new Error('Unable to determine the requested location.');
			}

			const intents: (
				| 'controlOperations.updateRequestedControlActionDetails'
				| 'controlOperations.updateRequestedControlActionLocationAndContext'
			)[] = [];
			const changes: Partial<RequestRow> = {};

			if (
				fields.controlType !== current.controlType ||
				fields.summary !== current.summary ||
				fields.recommendedMethodId !== current.recommendedMethodId
			) {
				intents.push('controlOperations.updateRequestedControlActionDetails');
				changes.control_type = fields.controlType;
				changes.summary = fields.summary;
				changes.recommended_method_id = fields.recommendedMethodId;
			}

			const contextMoved = fields.habitatId !== current.habitatId;
			const addressMoved = fields.addressId !== current.addressId;
			if (geometry !== null || addressMoved || contextMoved) {
				intents.push('controlOperations.updateRequestedControlActionLocationAndContext');
				changes.address_id = fields.addressId;
				if (contextMoved) {
					changes.habitat_id = fields.habitatId;
				}
				if (centroid !== null) {
					changes.lat = centroid.lat;
					changes.lng = centroid.lng;
					changes.geom_type = centroid.geomType;
				}
			}

			if (intents.length === 0) {
				return;
			}

			await settleWrite(
				mutateCollection(requested_control_actions(), {
					operation: 'update',
					intent: intents,
					key: requestId,
					changes: {
						...changes,
						updated_by_profile_id: actorProfileId,
						updated_at: optimisticStamp(),
					},
					// Both absent unless the location command is one of the names: an
					// instruction the command has no reader for is a key the server
					// ignores, and sending one anyway makes the body claim an edit it is
					// not making.
					...(geometry === null ? {} : { locationSource: { kind: 'geometry', geometry } }),
					...(contextMoved ? { context: contextFor(fields.habitatId, null) } : {}),
				}),
			);
		},
		[actorProfileId],
	);

	const resolve = useCallback(
		async (requestId: string) => {
			if (actorProfileId === null) {
				throw new Error('Your profile is still loading.');
			}

			await settleWrite(
				mutateCollection(requested_control_actions(), {
					operation: 'update',
					intent: 'controlOperations.resolveRequestedControlAction',
					key: requestId,
					changes: {
						resolved_at: lifecycleStamp(),
						resolved_by_profile_id: actorProfileId,
						updated_by_profile_id: actorProfileId,
						updated_at: optimisticStamp(),
					},
				}),
			);
		},
		[actorProfileId],
	);

	const reopen = useCallback(
		async (requestId: string) => {
			await settleWrite(
				mutateCollection(requested_control_actions(), {
					operation: 'update',
					intent: 'controlOperations.reopenRequestedControlAction',
					key: requestId,
					changes: {
						resolved_at: null,
						resolved_by_profile_id: null,
						updated_by_profile_id: actorProfileId,
						updated_at: optimisticStamp(),
					},
				}),
			);
		},
		[actorProfileId],
	);

	const remove = useCallback(
		async (requestId: string, acknowledgements: Readonly<Record<string, boolean>> = {}) => {
			await settleWrite(
				mutateCollection(requested_control_actions(), {
					operation: 'delete',
					intent: 'controlOperations.deleteRequestedControlAction',
					key: requestId,
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
		update,
		resolve,
		reopen,
		remove,
		canWrite: organizationId !== null && actorProfileId !== null,
	};
}
