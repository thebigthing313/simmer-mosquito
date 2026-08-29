import { Skeleton } from '@simmer-mosquito/ui-web/components/ui/skeleton';
import { createFileRoute, redirect, useNavigate } from '@tanstack/react-router';
import { useCallback } from 'react';
import { OutletSimpleLayout } from '../../../components/app-shell';
import { RecordUnavailable } from '../../../components/record';
import {
	type RegistrationFields,
	useNotificationRegistrationMutations,
} from '../../../hooks/mutations/use-notification-registration-mutations';
import { useNotificationTypeRoster } from '../../../hooks/queries/use-catalog-rosters';
import {
	type RegistrationRecord,
	type RegistrationSubscriptionRecord,
	useRegistration,
	useRegistrationSubscriptions,
} from '../../../hooks/queries/use-registration-record';
import { useUnitLabels } from '../../../hooks/queries/use-unit-labels';
import { useAuthSnapshot } from '../../../hooks/use-auth-snapshot';
import {
	NOTIFICATION_REGISTRATION_GEOMETRY_SOURCE,
	useOwnedGeometry,
} from '../../../hooks/use-owned-geometry';
import { isBelowRole } from '../../../lib/write-access';
import {
	bufferFrom,
	RegistrationFormPage,
	type RegistrationFormValues,
	type RegistrationSaveInput,
} from './-registration-form';

export const Route = createFileRoute('/public-engagement/registrations/$id_/edit')({
	beforeLoad: async ({ context, params }) => {
		if (await isBelowRole(context, 'manager')) {
			throw redirect({
				params: { id: params.id },
				replace: true,
				to: '/public-engagement/registrations/$id',
			});
		}
	},
	component: EditRegistrationRoute,
});

function EditRegistrationRoute() {
	const { id } = Route.useParams();
	const { registration, isReady, isError } = useRegistration(id);

	if (isError) {
		return <RecordUnavailable layout="centered" noun="registration" reason="error" />;
	}
	if (!isReady) {
		return <EditFormSkeleton />;
	}
	if (registration === undefined) {
		return <RecordUnavailable layout="centered" noun="registration" reason="not-found" />;
	}

	return <EditRegistrationLoader registration={registration} />;
}

function EditRegistrationLoader({ registration }: { readonly registration: RegistrationRecord }) {
	const navigate = useNavigate();
	const auth = useAuthSnapshot();
	const organizationId =
		auth?.authenticated === true ? (auth.localIdentity?.organizationId ?? null) : null;
	const mutations = useNotificationRegistrationMutations();
	const { all: units } = useUnitLabels();
	const notificationTypes = useNotificationTypeRoster()
		.filter((type) => type.isActive)
		.map((type) => ({ id: type.id, label: type.name }));
	const { subscriptions, isReady: subscriptionsReady } = useRegistrationSubscriptions(
		registration.id,
	);
	// `geom` never syncs (ADR 0009), so the drawn shape is read back over the
	// geometry endpoint rather than off the row. Keyed on `updatedAt` so a save
	// re-reads rather than re-showing the shape the form just replaced.
	const savedGeometry = useOwnedGeometry(
		NOTIFICATION_REGISTRATION_GEOMETRY_SOURCE,
		registration.id,
		registration.updatedAt.toISOString(),
	);

	const current = formValuesOf(registration, subscriptions);

	const onSave = useCallback(
		async ({ values, geometry: drawn }: RegistrationSaveInput) => {
			await mutations.save({
				registrationId: registration.id,
				fields: {
					contactId: values.contactId ?? registration.contactId,
					addressId: values.addressId,
					buffer: bufferFrom(values),
					flags: { hasBees: values.hasBees, isNoSpray: values.isNoSpray },
				},
				current: savedFieldsOf(registration),
				geometry: drawn,
			});

			await reconcileSubscriptions({
				chosen: values.notificationTypeIds,
				current: subscriptions,
				mutations,
				registrationId: registration.id,
			});

			await navigate({
				to: '/public-engagement/registrations/$id',
				params: { id: registration.id },
			});
		},
		[mutations, navigate, registration, subscriptions],
	);

	if (savedGeometry.isError) {
		return (
			<RecordUnavailable
				description="This registration's geometry could not be loaded."
				layout="centered"
				noun="registration"
				reason="error"
			/>
		);
	}

	/*
	 * Both of these gate the mount rather than re-seeding the form, because
	 * `useAppForm` takes `defaultValues` once and `useRegistrationLocation` seeds
	 * its geometry with `useState`. A form mounted before either arrives shows an
	 * empty map and no subscriptions, and neither ever fills in.
	 *
	 * The subscriptions are the dangerous half. `onSave` reconciles the form's
	 * chosen types against the live list, so a form that mounted holding `[]`
	 * would unsubscribe every notification type on a save that only touched the
	 * buffer, and say nothing about it.
	 */
	if (organizationId === null || savedGeometry.isPending || !subscriptionsReady) {
		return <EditFormSkeleton />;
	}

	return (
		<RegistrationFormPage
			canSubmit={mutations.canWrite}
			defaultValues={current}
			header={{
				title: 'Edit Registration',
				description: 'Update who this warns, where it covers, and how far around it reaches.',
				backTo: '/public-engagement/registrations/$id',
				backParams: { id: registration.id },
				backLabel: 'Back to Registration',
			}}
			initialGeometry={savedGeometry.geometry}
			notificationTypes={notificationTypes}
			onSave={onSave}
			organizationId={organizationId}
			submitLabel="Save Changes"
			units={units}
		/>
	);
}

/** The row as the form holds it: strings where the columns are numbers and ids. */
function formValuesOf(
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
function savedFieldsOf(registration: RegistrationRecord): RegistrationFields {
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
async function reconcileSubscriptions(input: {
	readonly chosen: readonly string[];
	readonly current: readonly RegistrationSubscriptionRecord[];
	readonly mutations: ReturnType<typeof useNotificationRegistrationMutations>;
	readonly registrationId: string;
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
			await input.mutations.unsubscribe(subscription.id);
		}
	}
}

function EditFormSkeleton() {
	return (
		<OutletSimpleLayout>
			<div className="grid max-w-[640px] gap-5">
				<Skeleton className="h-6 w-40" />
				<Skeleton className="h-9 w-full" />
				<div className="grid grid-cols-2 gap-4">
					<Skeleton className="h-9 w-full" />
					<Skeleton className="h-9 w-full" />
				</div>
				<Skeleton className="h-24 w-full" />
			</div>
		</OutletSimpleLayout>
	);
}
