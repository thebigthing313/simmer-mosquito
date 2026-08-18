/**
 * Taking a request from the public, correcting it, closing it, reopening it.
 *
 * ## `contact` and `location` are instructions, not columns
 *
 * `service_requests` holds a `contact_id` and an `address_id`, and neither is
 * what a command takes. Both take a *reference* — "this existing contact", or a
 * new one with these details — because taking a request often means taking a
 * caller nobody has heard from before, and the two are one transaction. The
 * columns hold the result of resolving one, so they do not get to name the
 * argument. Every reference this app sends is `existing`: the form writes a new
 * contact through `useContactMutations` first, so the row is on screen before
 * the request that names it.
 *
 * ## Closing and reopening write a comment, and the client mints its id
 *
 * The resolution *is* a comment — there is no `resolution` column, and no
 * `reopened_at` column either, so on a reopen the comment is the only record
 * that it happened at all. Both commands take the comment's id, and the endpoint
 * this replaces minted one server-side per request. A retry of a failed close
 * would therefore have written a second comment. Minted here, a retry writes the
 * same one.
 *
 * The reason itself is not optional to the domain, so an empty box falls back to
 * the plain fact — a close nobody explained is still a close, and refusing to
 * record it over a blank field would be the worse failure. The caller decides
 * the wording; both dialogs already have it.
 *
 * ## The acknowledgement flags
 *
 * `updateServiceRequestDetails` and the two references each carry one, and
 * `deleteServiceRequest` carries two. None is sent: no writer reads any of them
 * today, so they are vocabulary the domain states and nothing enforces. When one
 * starts being enforced it will arrive as a refusal, which is what
 * `useAcknowledgedWrite` is for.
 */

import type { GeoJsonPoint } from '@simmer-mosquito/mapping';
import { type ServiceRequest, settleWrite } from '@simmer-mosquito/sync';
import { useCallback } from 'react';
import { mutateCollection } from '../../lib/collections/mutate';
import { service_requests } from '../../lib/collections/service_requests';
import type { IntakeType } from '../queries/service-request-view';
import { useAuthSnapshot } from '../use-auth-snapshot';
import { lifecycleStamp, newRecordId, optimisticStamp } from './shared';

/** A Service Request as its form holds one, before the parties and the point. */
export interface ServiceRequestFields {
	readonly intakeType: IntakeType;
	/** `YYYY-MM-DD` — the day the public reported it, not the day it was keyed in. */
	readonly requestDate: string;
	readonly details: string;
	readonly receivedByProfileId: string | null;
}

type ServiceRequestUpdateIntent =
	| 'publicEngagement.updateServiceRequestDetails'
	| 'publicEngagement.updateServiceRequestContact';

/** What an edit means, the columns it moves, and the reference it carries. */
export interface ServiceRequestUpdatePlan {
	readonly intents: readonly ServiceRequestUpdateIntent[];
	readonly changes: Partial<ServiceRequest>;
	/**
	 * Absent unless the contact command is one of the names: a reference the
	 * command has no reader for is a key the server ignores, and sending one
	 * anyway makes the body claim an edit it is not making.
	 */
	readonly arguments?: Readonly<Record<string, unknown>>;
}

/**
 * Which of the two commands an edit is, from what actually changed.
 *
 * Pure and exported for its tests. The contact is compared rather than taken as
 * a change on its own: re-sending the contact a request already names is a
 * command with nothing to do, and the domain refuses it — which surfaces as a
 * whole save failing over the half the user did not touch.
 *
 * `null` when nothing moved — an untouched save is not a write.
 */
export function serviceRequestUpdatePlan(input: {
	readonly fields: ServiceRequestFields;
	readonly current: ServiceRequestFields;
	readonly contactId: string;
	readonly currentContactId: string;
}): ServiceRequestUpdatePlan | null {
	const { fields, current } = input;
	const intents: ServiceRequestUpdateIntent[] = [];
	const changes: Partial<ServiceRequest> = {};

	if (
		fields.intakeType !== current.intakeType ||
		fields.requestDate !== current.requestDate ||
		fields.details !== current.details ||
		fields.receivedByProfileId !== current.receivedByProfileId
	) {
		intents.push('publicEngagement.updateServiceRequestDetails');
		changes.intake_type = fields.intakeType;
		changes.request_date = fields.requestDate;
		changes.details = fields.details;
		changes.received_by_profile_id = fields.receivedByProfileId;
	}

	const contactMoved = input.contactId !== input.currentContactId;
	if (contactMoved) {
		intents.push('publicEngagement.updateServiceRequestContact');
		changes.contact_id = input.contactId;
	}

	if (intents.length === 0) {
		return null;
	}
	return {
		intents,
		changes,
		...(contactMoved
			? { arguments: { contact: { kind: 'existing', contactId: input.contactId } } }
			: {}),
	};
}

export interface ServiceRequestMutations {
	/** Take a request. The id is the caller's, so it can navigate to the row it wrote. */
	readonly record: (input: {
		readonly requestId: string;
		readonly fields: ServiceRequestFields;
		readonly contactId: string;
		readonly addressId: string;
		/** Where it was reported, which is the request's own point. */
		readonly geometry: GeoJsonPoint;
	}) => Promise<void>;
	/**
	 * Save an edited request.
	 *
	 * `contactId` is compared against `currentContactId` rather than taken as a
	 * change on its own: re-sending the contact a request already names is a
	 * command with nothing to do, and the domain refuses it.
	 */
	readonly save: (input: {
		readonly requestId: string;
		readonly fields: ServiceRequestFields;
		readonly current: ServiceRequestFields;
		readonly contactId: string;
		readonly currentContactId: string;
	}) => Promise<void>;
	/** Close it, with the summary that becomes the resolution comment. */
	readonly close: (requestId: string, resolutionSummary: string) => Promise<void>;
	/** Reopen it, with the reason that becomes the comment recording the reopen. */
	readonly reopen: (requestId: string, reopenReason: string) => Promise<void>;
	readonly remove: (requestId: string) => Promise<void>;
	/** False while the auth snapshot is still resolving; every write throws until then. */
	readonly canWrite: boolean;
}

export function useServiceRequestMutations(): ServiceRequestMutations {
	const auth = useAuthSnapshot();
	const identity = auth?.authenticated === true ? auth.localIdentity : null;
	const organizationId = identity?.organizationId ?? null;
	const actorProfileId = identity?.profileId ?? null;

	const record = useCallback(
		async (input: {
			readonly requestId: string;
			readonly fields: ServiceRequestFields;
			readonly contactId: string;
			readonly addressId: string;
			readonly geometry: GeoJsonPoint;
		}) => {
			if (organizationId === null) {
				throw new Error('Your profile is still loading.');
			}

			const { fields, geometry } = input;
			const now = optimisticStamp();
			await settleWrite(
				mutateCollection(service_requests, {
					operation: 'insert',
					intent: 'publicEngagement.createServiceRequest',
					row: {
						id: input.requestId,
						organization_id: organizationId,
						// The server assigns the sequential number the request is titled by;
						// until it syncs back the title falls back to a short id.
						display_name: null,
						intake_type: fields.intakeType,
						request_date: fields.requestDate,
						lat: geometry.coordinates[1],
						lng: geometry.coordinates[0],
						geom_type: geometry.type,
						address_id: input.addressId,
						contact_id: input.contactId,
						received_by_profile_id: fields.receivedByProfileId,
						details: fields.details,
						closed_at: null,
						closed_by_profile_id: null,
						metadata: null,
						created_by_profile_id: actorProfileId,
						updated_by_profile_id: actorProfileId,
						created_at: now,
						updated_at: now,
					} satisfies ServiceRequest,
					arguments: {
						contact: { kind: 'existing', contactId: input.contactId },
						location: {
							address: { kind: 'existing', addressId: input.addressId },
							geometry,
						},
					},
				}),
			);
		},
		[organizationId, actorProfileId],
	);

	const save = useCallback(
		async (input: {
			readonly requestId: string;
			readonly fields: ServiceRequestFields;
			readonly current: ServiceRequestFields;
			readonly contactId: string;
			readonly currentContactId: string;
		}) => {
			const plan = serviceRequestUpdatePlan(input);
			if (plan === null) {
				return;
			}

			await settleWrite(
				mutateCollection(service_requests, {
					operation: 'update',
					intent: plan.intents,
					key: input.requestId,
					changes: {
						...plan.changes,
						updated_by_profile_id: actorProfileId,
						updated_at: optimisticStamp(),
					},
					...(plan.arguments === undefined ? {} : { arguments: plan.arguments }),
				}),
			);
		},
		[actorProfileId],
	);

	const close = useCallback(
		async (requestId: string, resolutionSummary: string) => {
			await settleWrite(
				mutateCollection(service_requests, {
					operation: 'update',
					intent: 'publicEngagement.closeServiceRequest',
					key: requestId,
					changes: {
						closed_at: lifecycleStamp(),
						closed_by_profile_id: actorProfileId,
						updated_by_profile_id: actorProfileId,
						updated_at: optimisticStamp(),
					},
					// The comment the summary becomes. Minted here so a retry writes the
					// same comment rather than a second one.
					arguments: { resolutionCommentId: newRecordId(), resolutionSummary },
				}),
			);
		},
		[actorProfileId],
	);

	const reopen = useCallback(
		async (requestId: string, reopenReason: string) => {
			await settleWrite(
				mutateCollection(service_requests, {
					operation: 'update',
					intent: 'publicEngagement.reopenServiceRequest',
					key: requestId,
					changes: {
						closed_at: null,
						closed_by_profile_id: null,
						updated_by_profile_id: actorProfileId,
						updated_at: optimisticStamp(),
					},
					arguments: {
						reopenCommentId: newRecordId(),
						reopenReason,
						reopenedAt: lifecycleStamp(),
					},
				}),
			);
		},
		[actorProfileId],
	);

	const remove = useCallback(async (requestId: string) => {
		await settleWrite(
			mutateCollection(service_requests, {
				operation: 'delete',
				intent: 'publicEngagement.deleteServiceRequest',
				key: requestId,
			}),
		);
	}, []);

	return {
		record,
		save,
		close,
		reopen,
		remove,
		canWrite: organizationId !== null && actorProfileId !== null,
	};
}
