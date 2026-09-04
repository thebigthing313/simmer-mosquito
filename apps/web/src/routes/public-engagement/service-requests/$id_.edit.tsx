import { createFileRoute, redirect, useNavigate } from '@tanstack/react-router';
import { useCallback } from 'react';
import { useAcknowledgedWrite } from '../../../components/acknowledged-write';
import { useBreadcrumbLabel } from '../../../components/app-shell';
import { EditFormSkeleton, RecordUnavailable } from '../../../components/record';
import { useServiceRequestMutations } from '../../../hooks/mutations/use-service-request-mutations';
import { type ProfileListing, useProfileRoster } from '../../../hooks/queries/use-profile-roster';
import {
	type ServiceRequestRecord,
	useServiceRequestRecord,
} from '../../../hooks/queries/use-service-request-record';
import { SERVICE_REQUEST_SAVE_REFUSALS } from '../../../lib/acknowledgement-copy';
import { isBelowRole } from '../../../lib/write-access';
import { serviceRequestTitle } from '../-public-engagement-display';
import {
	defaultServiceRequestFormValues,
	ServiceRequestFormPage,
	type ServiceRequestFormValues,
	type ServiceRequestSaveInput,
	serviceRequestFieldsFrom,
} from './-service-request-form';

export const Route = createFileRoute('/public-engagement/service-requests/$id_/edit')({
	beforeLoad: async ({ context, params }) => {
		if (await isBelowRole(context, 'manager')) {
			throw redirect({
				params: { id: params.id },
				replace: true,
				to: '/public-engagement/service-requests/$id',
			});
		}
	},
	component: EditServiceRequestRoute,
});

function EditServiceRequestRoute() {
	const { id } = Route.useParams();
	const profiles = useProfileRoster();
	const { request, isReady, isError } = useServiceRequestRecord(id);

	if (isError) {
		return <RecordUnavailable layout="centered" noun="service request" reason="error" />;
	}
	if (!isReady) {
		return <EditFormSkeleton rows={['h-9', 'h-24', ['h-9', 'h-9']]} />;
	}
	if (request === undefined) {
		return <RecordUnavailable layout="centered" noun="service request" reason="not-found" />;
	}

	return <EditServiceRequestLoader profiles={profiles} request={request} />;
}

function EditServiceRequestLoader({
	request,
	profiles,
}: {
	readonly request: ServiceRequestRecord;
	readonly profiles: readonly ProfileListing[];
}) {
	const navigate = useNavigate();
	const mutations = useServiceRequestMutations();
	const { run, dialog } = useAcknowledgedWrite({
		askable: SERVICE_REQUEST_SAVE_REFUSALS,
		ask: true,
	});
	// Show the request number (or short id fallback) in the breadcrumb, not the raw uuid.
	useBreadcrumbLabel(request.id, serviceRequestTitle(request));

	const onSave = useCallback(
		async ({ values }: ServiceRequestSaveInput) => {
			// The question goes out unanswered and comes back as a refusal only when
			// the contact moves, which is the only half of a save it can be put about.
			//
			// The navigation is *inside* the callback on purpose: `run` resolves on a
			// refusal as well as on a success, because a refusal is a question rather
			// than a failure. Leaving here on the way past would abandon the page
			// before the question could be asked, and read as a save that worked.
			await run(async (acknowledgements) => {
				// `current` comes back through the same round trip as the edited values,
				// so a field nobody touched compares equal to itself and the save names
				// only the commands it has changed fields for.
				await mutations.save({
					requestId: request.id,
					fields: serviceRequestFieldsFrom(values),
					current: serviceRequestFieldsFrom(defaultsFromServiceRequest(request)),
					contactId: values.contactId ?? request.contactId,
					currentContactId: request.contactId,
					acknowledgedHistoricalContactChange:
						acknowledgements.acknowledgedHistoricalContactChange === true,
				});
				await navigate({
					to: '/public-engagement/service-requests/$id',
					params: { id: request.id },
				});
			});
		},
		[mutations, navigate, request, run],
	);

	return (
		<>
			<ServiceRequestFormPage
				canSubmit={mutations.canWrite}
				defaultValues={defaultsFromServiceRequest(request)}
				disableNewContact
				header={{
					title: 'Edit Service Request',
					description:
						'Update the request details or its contact. Location and address stay as recorded.',
					backTo: '/public-engagement/service-requests/$id',
					backParams: { id: request.id },
					backLabel: 'Back to Request',
				}}
				hideLocation
				onSave={onSave}
				organizationId={request.organizationId}
				profiles={profiles}
				requireLocation={false}
				submitLabel="Save Changes"
			/>
			{dialog}
		</>
	);
}

function defaultsFromServiceRequest(request: ServiceRequestRecord): ServiceRequestFormValues {
	return {
		...defaultServiceRequestFormValues(request.requestDate, request.receivedByProfileId ?? ''),
		intakeType: request.intakeType,
		details: request.details,
		contactMode: 'existing',
		contactId: request.contactId,
		addressId: request.addressId,
	};
}
