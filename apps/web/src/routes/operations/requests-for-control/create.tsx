import { createFileRoute, redirect, useNavigate } from '@tanstack/react-router';
import { useState } from 'react';
import { canAttributeWrite, newRecordId } from '../../../hooks/mutations/shared';
import { useRequestedControlActionMutations } from '../../../hooks/mutations/use-requested-control-action-mutations';
import { useRequestedControlAction } from '../../../hooks/queries/use-requested-control-action';
import { useOrganizationWorkspace } from '../../../hooks/use-organization-workspace';
import { isBelowWriteFloor } from '../../../lib/write-surfaces';
import {
	defaultRequestFormValues,
	RequestFormPage,
	type RequestSaveInput,
	readRequestFields,
} from './-request-form';

export const Route = createFileRoute('/operations/requests-for-control/create')({
	beforeLoad: async ({ context }) => {
		if (await isBelowWriteFloor(context, '/operations/requests-for-control/create')) {
			throw redirect({ replace: true, to: '/operations/requests-for-control' });
		}
	},
	component: CreateRequestForControlRoute,
});

function CreateRequestForControlRoute() {
	const { auth } = Route.useRouteContext();
	const navigate = useNavigate();
	const { organization } = useOrganizationWorkspace(auth.snapshot);
	const actorProfileId =
		auth.snapshot?.authenticated === true ? auth.snapshot.localIdentity.profileId : null;

	// Minted up front so the on-demand stream is already warm when the save fires
	// — a write to a cold collection waits out its txid confirmation, which reads
	// as a frozen save.
	const [requestId] = useState(() => newRecordId());
	useRequestedControlAction(requestId);

	const requestWrites = useRequestedControlActionMutations();

	const onSave = async ({ values, geometry }: RequestSaveInput) => {
		if (actorProfileId === null) {
			throw new Error('Your profile is still loading.');
		}
		if (geometry === null) {
			throw new Error('Map where the control work is needed.');
		}
		await requestWrites.create(
			requestId,
			{
				controlType: values.controlType,
				...readRequestFields(values),
				addressId: values.addressId,
				habitatId: values.habitatId,
			},
			geometry,
		);
		await navigate({ to: '/operations/requests-for-control' });
	};

	return (
		<RequestFormPage
			canSubmit={canAttributeWrite({ organization, actorProfileId })}
			defaultValues={defaultRequestFormValues()}
			errorTitle="Unable to Raise Request"
			header={{
				title: 'New Request for Control',
				description:
					'Map where control work is needed and say what kind. Missions draw their stops from this queue.',
				backTo: '/operations/requests-for-control',
				backLabel: 'Requests for Control',
			}}
			onSave={onSave}
			organizationId={organization.id}
			submitLabel="Raise Request"
		/>
	);
}
