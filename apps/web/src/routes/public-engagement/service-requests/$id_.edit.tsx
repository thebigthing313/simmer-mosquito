import { Skeleton } from '@simmer-mosquito/ui-web/components/ui/skeleton';
import { createFileRoute, redirect, useNavigate } from '@tanstack/react-router';
import { useCallback } from 'react';
import { useBreadcrumbLabel } from '../../../components/app-shell';
import { RecordUnavailable } from '../../../components/record';
import { useServiceRequestMutations } from '../../../hooks/mutations/use-service-request-mutations';
import { type ProfileListing, useProfileRoster } from '../../../hooks/queries/use-profile-roster';
import {
	type ServiceRequestRecord,
	useServiceRequestRecord,
} from '../../../hooks/queries/use-service-request-record';
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
		return <EditFormSkeleton />;
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
	// Show the request number (or short id fallback) in the breadcrumb, not the raw uuid.
	useBreadcrumbLabel(request.id, serviceRequestTitle(request));

	const onSave = useCallback(
		async ({ values }: ServiceRequestSaveInput) => {
			// `current` comes back through the same round trip as the edited values,
			// so a field nobody touched compares equal to itself and the save names
			// only the commands it has changed fields for.
			await mutations.save({
				requestId: request.id,
				fields: serviceRequestFieldsFrom(values),
				current: serviceRequestFieldsFrom(defaultsFromServiceRequest(request)),
				contactId: values.contactId ?? request.contactId,
				currentContactId: request.contactId,
			});
			await navigate({
				to: '/public-engagement/service-requests/$id',
				params: { id: request.id },
			});
		},
		[mutations, navigate, request],
	);

	return (
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

function EditFormSkeleton() {
	return (
		<div className="grid h-full min-h-0 w-full grid-cols-[2fr_3fr] overflow-hidden">
			<div className="grid content-start gap-5 overflow-y-auto px-5 py-5">
				<Skeleton className="h-6 w-40" />
				<Skeleton className="h-9 w-full" />
				<Skeleton className="h-24 w-full" />
				<div className="grid grid-cols-2 gap-4">
					<Skeleton className="h-9 w-full" />
					<Skeleton className="h-9 w-full" />
				</div>
			</div>
			<Skeleton className="h-full w-full rounded-none border-border/40 border-l" />
		</div>
	);
}
