import { createFileRoute, redirect, useNavigate } from '@tanstack/react-router';
import { useCallback, useState } from 'react';
import { newRecordId } from '../../../hooks/mutations/shared';
import { useNotificationRegistrationMutations } from '../../../hooks/mutations/use-notification-registration-mutations';
import { useNotificationTypeRoster } from '../../../hooks/queries/use-catalog-rosters';
import { useRegistration } from '../../../hooks/queries/use-registration-record';
import { useUnitLabels } from '../../../hooks/queries/use-unit-labels';
import { useAuthSnapshot } from '../../../hooks/use-auth-snapshot';
import { isBelowRole } from '../../../lib/write-access';
import {
	bufferFrom,
	defaultRegistrationFormValues,
	RegistrationFormPage,
	type RegistrationSaveInput,
} from './-registration-form';

export const Route = createFileRoute('/public-engagement/registrations/create')({
	beforeLoad: async ({ context }) => {
		if (await isBelowRole(context, 'manager')) {
			throw redirect({ replace: true, to: '/public-engagement/registrations' });
		}
	},
	component: CreateRegistrationRoute,
});

function CreateRegistrationRoute() {
	const navigate = useNavigate();
	const auth = useAuthSnapshot();
	const organizationId =
		auth?.authenticated === true ? (auth.localIdentity?.organizationId ?? null) : null;
	const mutations = useNotificationRegistrationMutations();
	const { all: units } = useUnitLabels();
	// Active only: the domain refuses a subscription to a retired type, and a
	// retired one on the list is a choice that fails at save.
	const notificationTypes = useNotificationTypeRoster()
		.filter((type) => type.isActive)
		.map((type) => ({ id: type.id, label: type.name }));

	// Minted up front, and queried before it exists: `notification_registrations`
	// is on-demand, and a write into a collection nothing is querying waits out a
	// txid confirmation that never arrives, which reads as a frozen save rather
	// than a slow one.
	const [registrationId] = useState(() => newRecordId());
	useRegistration(registrationId);

	const onSave = useCallback(
		async ({ values, geometry }: RegistrationSaveInput) => {
			if (values.contactId === null || geometry === null) {
				return;
			}
			await mutations.record({
				registrationId,
				contactId: values.contactId,
				location: { addressId: values.addressId, geometry },
				buffer: bufferFrom(values),
				flags: { hasBees: values.hasBees, isNoSpray: values.isNoSpray },
				// The link rows are part of the same write, so their ids are minted
				// here alongside the registration's.
				subscriptions: values.notificationTypeIds.map((notificationTypeId) => ({
					notificationRegistrationTypeId: newRecordId(),
					notificationTypeId,
				})),
			});
			await navigate({
				to: '/public-engagement/registrations/$id',
				params: { id: registrationId },
			});
		},
		[mutations, navigate, registrationId],
	);

	if (organizationId === null) {
		return null;
	}

	return (
		<RegistrationFormPage
			canSubmit={mutations.canWrite}
			defaultValues={defaultRegistrationFormValues()}
			header={{
				title: 'Create Registration',
				description:
					'Record a place to warn before spraying, and how far around it the warning reaches.',
				backTo: '/public-engagement/registrations',
				backLabel: 'Registrations',
			}}
			notificationTypes={notificationTypes}
			onSave={onSave}
			organizationId={organizationId}
			submitLabel="Create Registration"
			units={units}
		/>
	);
}
