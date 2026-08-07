import type { GeoJsonGeometry } from '@simmer-mosquito/mapping';
import { createFileRoute, redirect, useNavigate } from '@tanstack/react-router';
import { useCallback, useMemo, useState } from 'react';
import { useOrganizationWorkspace } from '../../../hooks/use-organization-workspace';
import { isWriteBlocked } from '../../../lib/write-access';
import { createRequestedControlAction, useRequestedControlAction } from '../-operations-data';
import {
	defaultRequestFormValues,
	RequestFormPage,
	type RequestSaveInput,
	readRequestFields,
} from './-request-form';

export const Route = createFileRoute('/operations/requests-for-control/create')({
	beforeLoad: async ({ context }) => {
		if (await isWriteBlocked(context)) {
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
	const [requestId] = useState(() => crypto.randomUUID());
	useRequestedControlAction(requestId);

	const organizationId = organization?.id ?? null;

	const onSave = useCallback(
		async ({ values, geometry }: RequestSaveInput) => {
			if (organizationId === null || actorProfileId === null) {
				throw new Error('Your organization and profile are still loading.');
			}
			if (geometry === null) {
				throw new Error('Map where the control work is needed.');
			}
			await createRequestedControlAction({
				requestId,
				organizationId,
				actorProfileId,
				controlType: values.controlType,
				geometry: geometry as unknown as GeoJsonGeometry,
				...readRequestFields(values),
				addressId: values.addressId,
				habitatId: values.habitatId,
			});
			await navigate({ to: '/operations/requests-for-control' });
		},
		[organizationId, actorProfileId, requestId, navigate],
	);

	return (
		<RequestFormPage
			canSubmit={organizationId !== null && actorProfileId !== null}
			defaultValues={useMemo(() => defaultRequestFormValues(), [])}
			errorTitle="Unable to Raise Request"
			header={{
				title: 'New Request for Control',
				description:
					'Map where control work is needed and say what kind. Missions draw their stops from this queue.',
				backTo: '/operations/requests-for-control',
				backLabel: 'Requests for Control',
			}}
			onSave={onSave}
			organizationId={organizationId ?? ''}
			submitLabel="Raise Request"
		/>
	);
}
