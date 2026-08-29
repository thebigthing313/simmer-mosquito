/**
 * Recording where somebody asked to be warned before spraying.
 *
 * A registration is a contact, a place, and a radius around it. Generation reads
 * those three to decide who a mission reaches, which is why this is a record
 * surface rather than a field on a contact: the radius is operational data, and
 * `mission_notifications` is created from it.
 *
 * ## `contact` and `location` are instructions, not columns
 *
 * The row holds `contact_id` and `address_id`; the commands take references. A
 * registration may name an existing contact or create one, and may sit at an
 * existing address, a new one, or no address at all. The columns hold the result
 * of resolving a reference, so they do not get to name the argument. Same shape
 * as `useServiceRequestMutations`, and for the same reason.
 *
 * Every reference this app sends is `existing` or `none`: the form writes a new
 * contact or address through its own hook first, so the row is on screen before
 * the registration that names it.
 *
 * ## Creating one is a multi-row command
 *
 * The types a registration wants telling about are link rows in
 * `notification_registration_types`, created in the same write, so a create is
 * `commandTransaction` and both the registration and its subscriptions are
 * applied optimistically. Subscribing or unsubscribing afterwards is an ordinary
 * single-row write against the link table.
 *
 * ## The acknowledgement flags are not sent
 *
 * The four edit commands and the unsubscribe each take one, and
 * `docs/public-engagement-domain.md` says an edit needs it once mission
 * notifications reference the registration. No writer reads any of them today
 * and the domain only records them, so they are vocabulary nothing enforces,
 * exactly as in `useServiceRequestMutations`. When one starts being enforced it
 * will arrive as a refusal, which is what `useAcknowledgedWrite` is for. Sending
 * one now would be a confirmation dialog for a rule that does not exist.
 *
 * Note this is the opposite of the merge commands, whose flag the domain does
 * check (`!== true`), so `useRecordMerge` must send it and sends `false` until
 * the user agrees.
 */

import type { GeoJsonGeometry } from '@simmer-mosquito/mapping';
import { ownedCentroidFromGeoJson } from '@simmer-mosquito/mapping';
import {
	type NotificationRegistration,
	type NotificationRegistrationType,
	settleWrite,
} from '@simmer-mosquito/sync';
import { useCallback } from 'react';
import { mutateCollection } from '../../lib/collections/mutate';
import { notification_registration_types } from '../../lib/collections/notification_registration_types';
import { notification_registrations } from '../../lib/collections/notification_registrations';
import { commandTransaction } from '../../lib/collections/transact';
import { useAuthSnapshot } from '../use-auth-snapshot';
import { newRecordId, optimisticStamp } from './shared';

/** Where a registration sits. `null` means no address, which is allowed. */
export interface RegistrationLocation {
	readonly addressId: string | null;
	/** Authoritative, and not point-only: a no-spray strip is a line or a field. */
	readonly geometry: GeoJsonGeometry;
}

/**
 * How far around the geometry the warning reaches.
 *
 * Both halves or neither. A distance with no unit is not a buffer, and clearing
 * one clears both, which is why this is one value rather than two fields.
 */
export interface RegistrationBuffer {
	readonly distance: number;
	readonly unitId: string;
}

/** The two operational flags, which are not notification types. */
export interface RegistrationFlags {
	readonly hasBees: boolean;
	readonly isNoSpray: boolean;
}

/** A type this registration wants telling about, and the link row's own id. */
export interface RegistrationSubscription {
	readonly notificationRegistrationTypeId: string;
	readonly notificationTypeId: string;
}

type RegistrationUpdateIntent =
	| 'publicEngagement.updateNotificationRegistrationContact'
	| 'publicEngagement.updateNotificationRegistrationLocation'
	| 'publicEngagement.updateNotificationRegistrationBuffer'
	| 'publicEngagement.updateNotificationRegistrationFlags';

/** A registration as its form holds one, for comparing an edit against. */
export interface RegistrationFields {
	readonly contactId: string;
	readonly addressId: string | null;
	readonly buffer: RegistrationBuffer | null;
	readonly flags: RegistrationFlags;
}

/** What an edit means, the columns it moves, and the instructions it carries. */
export interface RegistrationUpdatePlan {
	readonly intents: readonly RegistrationUpdateIntent[];
	readonly changes: Partial<NotificationRegistration>;
	readonly arguments: Readonly<Record<string, unknown>>;
}

/**
 * Which of the four commands an edit is, from what actually changed.
 *
 * Pure and exported for its tests. Naming an intent nothing changed is refused by
 * the domain, which fails the whole save over a group the user never touched;
 * naming one too few drops that group behind a 200. Neither is visible from the
 * call site.
 *
 * The geometry is the awkward one. It does not sync as a column — only the
 * trigger-maintained centroid does — so nothing about the row can tell whether
 * the shape moved. The caller passes `geometry: null` for "not redrawn", the same
 * convention `regionUpdatePlan` uses, and a redrawn shape is a location edit even
 * when the address did not move.
 *
 * `null` when nothing moved: an untouched save is not a write.
 */
export function registrationUpdatePlan(input: {
	readonly fields: RegistrationFields;
	readonly current: RegistrationFields;
	/** The redrawn shape, or null when the user did not touch it. */
	readonly geometry: GeoJsonGeometry | null;
}): RegistrationUpdatePlan | null {
	const { fields, current } = input;
	const intents: RegistrationUpdateIntent[] = [];
	const changes: Partial<NotificationRegistration> = {};
	const args: Record<string, unknown> = {};

	if (fields.contactId !== current.contactId) {
		intents.push('publicEngagement.updateNotificationRegistrationContact');
		changes.contact_id = fields.contactId;
		args.contact = { kind: 'existing', contactId: fields.contactId };
	}

	if (input.geometry !== null || fields.addressId !== current.addressId) {
		intents.push('publicEngagement.updateNotificationRegistrationLocation');
		changes.address_id = fields.addressId;
		args.location = {
			address:
				fields.addressId === null
					? { kind: 'none' }
					: { kind: 'existing', addressId: fields.addressId },
			// The command requires a shape. An address-only edit re-sends the one the
			// registration already has, which the caller passes as the current
			// geometry rather than null.
			geometry: input.geometry,
		};
		if (input.geometry !== null) {
			const centroid = ownedCentroidFromGeoJson(input.geometry);
			if (centroid !== null) {
				changes.lat = centroid.lat;
				changes.lng = centroid.lng;
				changes.geom_type = centroid.geomType;
			}
		}
	}

	if (
		fields.buffer?.distance !== current.buffer?.distance ||
		fields.buffer?.unitId !== current.buffer?.unitId
	) {
		intents.push('publicEngagement.updateNotificationRegistrationBuffer');
		changes.buffer_distance = fields.buffer?.distance ?? null;
		changes.buffer_unit_id = fields.buffer?.unitId ?? null;
	}

	if (
		fields.flags.hasBees !== current.flags.hasBees ||
		fields.flags.isNoSpray !== current.flags.isNoSpray
	) {
		intents.push('publicEngagement.updateNotificationRegistrationFlags');
		changes.has_bees = fields.flags.hasBees;
		changes.is_no_spray = fields.flags.isNoSpray;
	}

	return intents.length === 0 ? null : { intents, changes, arguments: args };
}

export interface NotificationRegistrationMutations {
	/** Record one. The id is the caller's, so it can navigate to the row it wrote. */
	readonly record: (input: {
		readonly registrationId: string;
		readonly contactId: string;
		readonly location: RegistrationLocation;
		readonly buffer: RegistrationBuffer | null;
		readonly flags: RegistrationFlags;
		readonly subscriptions: readonly RegistrationSubscription[];
	}) => Promise<void>;
	readonly save: (input: {
		readonly registrationId: string;
		readonly fields: RegistrationFields;
		readonly current: RegistrationFields;
		readonly geometry: GeoJsonGeometry | null;
	}) => Promise<void>;
	/** Opting out, which is not the same as never having registered. */
	readonly deactivate: (registrationId: string) => Promise<void>;
	readonly reactivate: (registrationId: string) => Promise<void>;
	readonly remove: (registrationId: string) => Promise<void>;
	readonly subscribe: (input: {
		readonly registrationId: string;
		readonly notificationTypeId: string;
	}) => Promise<void>;
	readonly unsubscribe: (subscriptionId: string) => Promise<void>;
	/** False while the auth snapshot is still resolving; every write throws until then. */
	readonly canWrite: boolean;
}

export function useNotificationRegistrationMutations(): NotificationRegistrationMutations {
	const auth = useAuthSnapshot();
	const identity = auth?.authenticated === true ? auth.localIdentity : null;
	const organizationId = identity?.organizationId ?? null;
	const actorProfileId = identity?.profileId ?? null;

	const record = useCallback(
		async (input: {
			readonly registrationId: string;
			readonly contactId: string;
			readonly location: RegistrationLocation;
			readonly buffer: RegistrationBuffer | null;
			readonly flags: RegistrationFlags;
			readonly subscriptions: readonly RegistrationSubscription[];
		}) => {
			if (organizationId === null) {
				throw new Error('Your profile is still loading.');
			}

			// The column's own vocabulary rather than GeoJSON's — `st_point`, not
			// `Point` — so the optimistic row reads the way the trigger will write it.
			const centroid = ownedCentroidFromGeoJson(input.location.geometry);
			if (centroid === null) {
				throw new Error('Unable to determine where this registration is.');
			}
			const now = optimisticStamp();

			await settleWrite(
				commandTransaction({
					intent: 'publicEngagement.createNotificationRegistration',
					request: {
						table: 'notification_registrations',
						method: 'POST',
						body: {
							id: input.registrationId,
							contact: { kind: 'existing', contactId: input.contactId },
							location: {
								address:
									input.location.addressId === null
										? { kind: 'none' }
										: { kind: 'existing', addressId: input.location.addressId },
								geometry: input.location.geometry,
							},
							buffer_distance: input.buffer?.distance ?? null,
							buffer_unit_id: input.buffer?.unitId ?? null,
							has_bees: input.flags.hasBees,
							is_no_spray: input.flags.isNoSpray,
							subscriptions: input.subscriptions.map((subscription) => ({
								notificationRegistrationTypeId: subscription.notificationRegistrationTypeId,
								notificationTypeId: subscription.notificationTypeId,
							})),
						},
					},
					apply: () => {
						notification_registrations.insert({
							id: input.registrationId,
							organization_id: organizationId,
							contact_id: input.contactId,
							lat: centroid.lat,
							lng: centroid.lng,
							geom_type: centroid.geomType,
							address_id: input.location.addressId,
							buffer_distance: input.buffer?.distance ?? null,
							buffer_unit_id: input.buffer?.unitId ?? null,
							has_bees: input.flags.hasBees,
							is_no_spray: input.flags.isNoSpray,
							is_active: true,
							created_by_profile_id: actorProfileId,
							updated_by_profile_id: actorProfileId,
							created_at: now,
							updated_at: now,
						} satisfies NotificationRegistration);

						for (const subscription of input.subscriptions) {
							notification_registration_types.insert({
								id: subscription.notificationRegistrationTypeId,
								organization_id: organizationId,
								notification_registration_id: input.registrationId,
								notification_type_id: subscription.notificationTypeId,
								created_by_profile_id: actorProfileId,
								updated_by_profile_id: actorProfileId,
								created_at: now,
								updated_at: now,
							} satisfies NotificationRegistrationType);
						}
					},
				}),
			);
		},
		[organizationId, actorProfileId],
	);

	const save = useCallback(
		async (input: {
			readonly registrationId: string;
			readonly fields: RegistrationFields;
			readonly current: RegistrationFields;
			readonly geometry: GeoJsonGeometry | null;
		}) => {
			const plan = registrationUpdatePlan(input);
			if (plan === null) {
				return;
			}

			await settleWrite(
				mutateCollection(notification_registrations, {
					operation: 'update',
					intent: plan.intents,
					key: input.registrationId,
					changes: {
						...plan.changes,
						updated_by_profile_id: actorProfileId,
						updated_at: optimisticStamp(),
					},
					arguments: plan.arguments,
				}),
			);
		},
		[actorProfileId],
	);

	const setActive = useCallback(
		async (registrationId: string, isActive: boolean) => {
			await settleWrite(
				mutateCollection(notification_registrations, {
					operation: 'update',
					intent: isActive
						? 'publicEngagement.reactivateNotificationRegistration'
						: 'publicEngagement.deactivateNotificationRegistration',
					key: registrationId,
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

	const deactivate = useCallback(
		(registrationId: string) => setActive(registrationId, false),
		[setActive],
	);
	const reactivate = useCallback(
		(registrationId: string) => setActive(registrationId, true),
		[setActive],
	);

	const remove = useCallback(async (registrationId: string) => {
		await settleWrite(
			mutateCollection(notification_registrations, {
				operation: 'delete',
				intent: 'publicEngagement.deleteNotificationRegistration',
				key: registrationId,
			}),
		);
	}, []);

	const subscribe = useCallback(
		async (input: { readonly registrationId: string; readonly notificationTypeId: string }) => {
			if (organizationId === null) {
				throw new Error('Your profile is still loading.');
			}
			const now = optimisticStamp();
			await settleWrite(
				mutateCollection(notification_registration_types, {
					operation: 'insert',
					intent: 'publicEngagement.subscribeNotificationRegistrationType',
					row: {
						id: newRecordId(),
						organization_id: organizationId,
						notification_registration_id: input.registrationId,
						notification_type_id: input.notificationTypeId,
						created_by_profile_id: actorProfileId,
						updated_by_profile_id: actorProfileId,
						created_at: now,
						updated_at: now,
					} satisfies NotificationRegistrationType,
				}),
			);
		},
		[organizationId, actorProfileId],
	);

	const unsubscribe = useCallback(async (subscriptionId: string) => {
		await settleWrite(
			mutateCollection(notification_registration_types, {
				operation: 'delete',
				intent: 'publicEngagement.unsubscribeNotificationRegistrationType',
				key: subscriptionId,
			}),
		);
	}, []);

	return {
		record,
		save,
		deactivate,
		reactivate,
		remove,
		subscribe,
		unsubscribe,
		canWrite: organizationId !== null && actorProfileId !== null,
	};
}
