import type {
	RegistrationFields,
	useNotificationRegistrationMutations,
} from '../../hooks/mutations/use-notification-registration-mutations';
import type {
	RegistrationRecord,
	RegistrationSubscriptionRecord,
} from '../../hooks/queries/use-registration-record';
import type { RegistrationFormValues } from './registration-form';

/** A saved registration as the form holds it: strings where the row has numbers. */
export function formValuesOf(
	registration: RegistrationRecord,
	subscriptions: readonly RegistrationSubscriptionRecord[],
): RegistrationFormValues {
	return {
		contactId: registration.contactId,
		addressId: registration.addressId,
		bufferDistance: registration.bufferDistance === null ? '' : String(registration.bufferDistance),
		bufferUnitId: registration.bufferUnitId ?? '',
		hasBees: registration.hasBees,
		isNoSpray: registration.isNoSpray,
		notificationTypeIds: subscriptions.map((subscription) => subscription.notificationTypeId),
	};
}

/**
 * The row as the write seam compares it, for working out which commands a save is.
 *
 * The buffer collapses to null unless both halves are set, because that is what
 * both-or-neither means: a distance whose unit went missing is not a buffer that
 * changed, it is no buffer.
 */
export function savedFieldsOf(registration: RegistrationRecord): RegistrationFields {
	return {
		contactId: registration.contactId,
		addressId: registration.addressId,
		buffer:
			registration.bufferDistance === null || registration.bufferUnitId === null
				? null
				: { distance: registration.bufferDistance, unitId: registration.bufferUnitId },
		flags: { hasBees: registration.hasBees, isNoSpray: registration.isNoSpray },
	};
}

/**
 * Bring the registration's subscriptions in line with what the form chose.
 *
 * Their own commands rather than part of the save, so each type added or removed
 * is one write against the link table.
 *
 * `current` must be the live list, and the form must not have mounted before it
 * arrived. A form seeded with an empty list would reach here with `chosen` empty
 * too, and this loop would unsubscribe every type on a save that only touched
 * the buffer. The caller gates its mount on `isReady` for that reason.
 */
export async function reconcileSubscriptions(input: {
	readonly chosen: readonly string[];
	readonly current: readonly RegistrationSubscriptionRecord[];
	readonly mutations: ReturnType<typeof useNotificationRegistrationMutations>;
	readonly registrationId: string;
	/** What the user answered about the notices already sent under a dropped type. */
	readonly acknowledgedFutureOnlyChange: boolean;
}): Promise<void> {
	const before = new Set(input.current.map((row) => row.notificationTypeId));
	const after = new Set(input.chosen);

	for (const notificationTypeId of after) {
		if (!before.has(notificationTypeId)) {
			await input.mutations.subscribe({
				registrationId: input.registrationId,
				notificationTypeId,
			});
		}
	}
	for (const subscription of input.current) {
		if (!after.has(subscription.notificationTypeId)) {
			await input.mutations.unsubscribe(subscription.id, input.acknowledgedFutureOnlyChange);
		}
	}
}
