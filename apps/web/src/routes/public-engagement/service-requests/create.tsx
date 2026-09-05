import type { GeoJsonPoint } from '@simmer-mosquito/mapping';
import { createFileRoute, redirect, useNavigate } from '@tanstack/react-router';
import { useCallback, useMemo, useState } from 'react';
import { mapPointSearchSchema, pointFromSearch } from '../../../components/map';
import { newRecordId } from '../../../hooks/mutations/shared';
import { useContactMutations } from '../../../hooks/mutations/use-contact-mutations';
import { useServiceRequestMutations } from '../../../hooks/mutations/use-service-request-mutations';
import { useContact } from '../../../hooks/queries/use-contact-record';
import { useProfileRoster } from '../../../hooks/queries/use-profile-roster';
import { useServiceRequestRecord } from '../../../hooks/queries/use-service-request-record';
import { useOrganizationTimeZone } from '../../../hooks/use-organization-time-zone';
import { useOrganizationWorkspace } from '../../../hooks/use-organization-workspace';
import { todayInTimeZone } from '../../../lib/local-date';
import { isBelowRole } from '../../../lib/write-access';
import { contactFieldsFromValues } from '../-contact-fields';
import {
	defaultServiceRequestFormValues,
	ServiceRequestFormPage,
	type ServiceRequestSaveInput,
	serviceRequestFieldsFrom,
} from './-service-request-form';

export const Route = createFileRoute('/public-engagement/service-requests/create')({
	// Ahead of `beforeLoad`: the options object is read in order, and a guard
	// declared first is typed against a route whose search schema is not known
	// yet — which erases lat/lng from `Route.useSearch()`.
	validateSearch: (search) => mapPointSearchSchema.parse(search),
	beforeLoad: async ({ context }) => {
		if (await isBelowRole(context, 'manager')) {
			throw redirect({ replace: true, to: '/public-engagement/service-requests' });
		}
	},
	component: CreateServiceRequestRoute,
});

function CreateServiceRequestRoute() {
	const { auth } = Route.useRouteContext();
	const initialGeometry = pointFromSearch(Route.useSearch());
	const navigate = useNavigate();
	const { organization } = useOrganizationWorkspace(auth.snapshot);
	const organizationId = organization?.id ?? '';
	const profiles = useProfileRoster();
	const contactWrites = useContactMutations();
	const requestWrites = useServiceRequestMutations();

	const actorProfileId =
		auth.snapshot?.authenticated === true ? auth.snapshot.localIdentity.profileId : null;

	// The day the public reported it is an operational date, so it is the
	// organization's day rather than the browser's — an intake taker keying in a
	// call at 11pm files it under the day the organization is still working.
	const timeZone = useOrganizationTimeZone();
	const today = useMemo(() => todayInTimeZone(timeZone), [timeZone]);

	// Both ids are minted up front and both rows are queried before either exists:
	// `contacts` and `service_requests` are on-demand, and a write into a
	// collection nothing is querying waits out a txid confirmation that never
	// arrives — which reads as a frozen save rather than a slow one.
	const [requestId] = useState(() => newRecordId());
	const [contactId] = useState(() => newRecordId());
	useServiceRequestRecord(requestId);
	useContact(contactId);

	const onSave = useCallback(
		async ({ values, geometry }: ServiceRequestSaveInput) => {
			if (geometry === null || geometry.type !== 'Point') {
				throw new Error('Place the request location on the map.');
			}

			// 1. The new contact, if this is one — written first, so the request that
			//    names it references a row that exists.
			let requestContactId = values.contactId;
			if (values.contactMode === 'new') {
				await contactWrites.create(contactId, contactFieldsFromValues(values.newContact));
				requestContactId = contactId;
			}
			if (requestContactId === null) {
				throw new Error('Select or create a contact for this request.');
			}

			// 2. The address is always an existing row: new ones are created by the
			//    picker's own inline form, which commits before handing back the id.
			const addressId = values.addressId;
			if (addressId === null) {
				throw new Error('Select or create an address for this request.');
			}

			await requestWrites.record({
				requestId,
				fields: serviceRequestFieldsFrom(values),
				contactId: requestContactId,
				addressId,
				geometry: geometry as GeoJsonPoint,
			});
			await navigate({
				to: '/public-engagement/service-requests/$id',
				params: { id: requestId },
			});
		},
		[contactId, contactWrites, navigate, requestId, requestWrites],
	);

	return (
		<ServiceRequestFormPage
			canSubmit={contactWrites.canWrite && requestWrites.canWrite}
			defaultValues={defaultServiceRequestFormValues(today, actorProfileId ?? '')}
			header={{
				title: 'New Service Request',
				description:
					'Log a request from the public — link or create a contact and address, and place its location.',
				backTo: '/public-engagement/service-requests',
				backLabel: 'Service Requests',
			}}
			initialGeometry={initialGeometry}
			onSave={onSave}
			organizationId={organizationId}
			profiles={profiles}
			submitLabel="Create Request"
		/>
	);
}
