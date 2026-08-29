import { Skeleton } from '@simmer-mosquito/ui-web/components/ui/skeleton';
import { createFileRoute, redirect, useNavigate } from '@tanstack/react-router';
import { useCallback } from 'react';
import { OutletSimpleLayout } from '../../../components/app-shell';
import { RecordUnavailable } from '../../../components/record';
import { useNotificationRegistrationMutations } from '../../../hooks/mutations/use-notification-registration-mutations';
import { useNotificationTypeRoster } from '../../../hooks/queries/use-catalog-rosters';
import {
	type RegistrationRecord,
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
	const { subscriptions } = useRegistrationSubscriptions(registration.id);
	// `geom` never syncs (ADR 0009), so the drawn shape is read back over the
	// geometry endpoint rather than off the row. Keyed on `updatedAt` so a save
	// re-reads rather than re-showing the shape the form just replaced.
	const savedGeometry = useOwnedGeometry(
		NOTIFICATION_REGISTRATION_GEOMETRY_SOURCE,
		registration.id,
		registration.updatedAt.toISOString(),
	);

	const current: RegistrationFormValues = {
		contactId: registration.contactId,
		addressId: registration.addressId,
		bufferDistance: registration.bufferDistance === null ? '' : String(registration.bufferDistance),
		bufferUnitId: registration.bufferUnitId ?? '',
		hasBees: registration.hasBees,
		isNoSpray: registration.isNoSpray,
		notificationTypeIds: subscriptions.map((subscription) => subscription.notificationTypeId),
	};

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
				current: {
					contactId: registration.contactId,
					addressId: registration.addressId,
					buffer:
						registration.bufferDistance === null || registration.bufferUnitId === null
							? null
							: { distance: registration.bufferDistance, unitId: registration.bufferUnitId },
					flags: { hasBees: registration.hasBees, isNoSpray: registration.isNoSpray },
				},
				geometry: drawn,
			});

			// Subscriptions are their own commands rather than part of the save, so
			// each added or removed type is one write against the link table.
			const before = new Set(subscriptions.map((row) => row.notificationTypeId));
			const after = new Set(values.notificationTypeIds);
			for (const notificationTypeId of after) {
				if (!before.has(notificationTypeId)) {
					await mutations.subscribe({ registrationId: registration.id, notificationTypeId });
				}
			}
			for (const subscription of subscriptions) {
				if (!after.has(subscription.notificationTypeId)) {
					await mutations.unsubscribe(subscription.id);
				}
			}

			await navigate({
				to: '/public-engagement/registrations/$id',
				params: { id: registration.id },
			});
		},
		[mutations, navigate, registration, subscriptions],
	);

	if (organizationId === null) {
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
