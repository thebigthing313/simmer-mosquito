import type { ServiceRequestRow } from '@simmer-mosquito/sync';
import { Skeleton } from '@simmer-mosquito/ui-web/components/ui/skeleton';
import { eq, useLiveQuery } from '@tanstack/react-db';
import { createFileRoute, redirect, useNavigate } from '@tanstack/react-router';
import { useCallback } from 'react';
import { useBreadcrumbLabel } from '../../../components/app-shell';
import { RecordUnavailable } from '../../../components/record';
import { type ProfileListing, useProfileRoster } from '../../../hooks/queries/use-profile-roster';
import { isBelowRole } from '../../../lib/write-access';
import { webCollections } from '../../../sync/webCollections';
import { serviceRequestTitle } from '../-public-engagement-display';
import { settleWrite } from '../-public-engagement-writes';
import {
	defaultServiceRequestFormValues,
	ServiceRequestFormPage,
	type ServiceRequestFormValues,
	type ServiceRequestSaveInput,
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

const requestGcTimeMs = 30_000;

type MutableServiceRequestRow = {
	-readonly [Key in keyof ServiceRequestRow]: ServiceRequestRow[Key];
};

function EditServiceRequestRoute() {
	const { id } = Route.useParams();
	const { auth } = Route.useRouteContext();
	const profiles = useProfileRoster();

	const result = useLiveQuery(
		{
			gcTime: requestGcTimeMs,
			query: (query) =>
				query
					.from({ request: webCollections.serviceRequests })
					.where(({ request }) => eq(request.id, id))
					.findOne(),
		},
		[id],
	);
	const request = result.data as ServiceRequestRow | undefined;

	if (result.isError) {
		return <RecordUnavailable layout="centered" noun="service request" reason="error" />;
	}
	if (!result.isReady) {
		return <EditFormSkeleton />;
	}
	if (request === undefined) {
		return <RecordUnavailable layout="centered" noun="service request" reason="not-found" />;
	}

	const actorProfileId =
		auth.snapshot?.authenticated === true ? auth.snapshot.localIdentity.profileId : null;

	return (
		<EditServiceRequestLoader
			actorProfileId={actorProfileId}
			canSubmit={actorProfileId !== null}
			profiles={profiles}
			request={request}
		/>
	);
}

function EditServiceRequestLoader({
	request,
	profiles,
	actorProfileId,
	canSubmit,
}: {
	readonly request: ServiceRequestRow;
	readonly profiles: readonly ProfileListing[];
	readonly actorProfileId: string | null;
	readonly canSubmit: boolean;
}) {
	const navigate = useNavigate();
	// Show the request number (or short id fallback) in the breadcrumb, not the raw uuid.
	useBreadcrumbLabel(request.id, serviceRequestTitle(request));

	const onSave = useCallback(
		async ({ values }: ServiceRequestSaveInput) => {
			const now = new Date().toISOString();
			const applyEdits = (draft: ServiceRequestRow) => {
				const writable = draft as MutableServiceRequestRow;
				writable.intakeType = values.intakeType;
				writable.requestDate = values.requestDate;
				writable.details = values.details.trim();
				writable.receivedByProfileId = values.receivedByProfileId;
				if (values.contactId !== null) {
					writable.contactId = values.contactId;
				}
				if (actorProfileId !== null) {
					writable.updatedByProfileId = actorProfileId;
				}
				writable.updatedAt = now;
			};

			await settleWrite(webCollections.serviceRequests.update(request.id, applyEdits));
			await navigate({
				to: '/public-engagement/service-requests/$id',
				params: { id: request.id },
			});
		},
		[request.id, actorProfileId, navigate],
	);

	return (
		<ServiceRequestFormPage
			canSubmit={canSubmit}
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

function defaultsFromServiceRequest(request: ServiceRequestRow): ServiceRequestFormValues {
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
