import { type GeoJsonGeometry, ownedCentroidFromGeoJson } from '@simmer-mosquito/mapping';
import type { ContactRow, ServiceRequestRow } from '@simmer-mosquito/sync';
import { eq, useLiveQuery } from '@tanstack/react-db';
import { createFileRoute, redirect, useNavigate } from '@tanstack/react-router';
import { useCallback, useMemo } from 'react';
import { mapPointSearchSchema, pointFromSearch } from '../../../components/map';
import { useProfileRoster } from '../../../hooks/queries/use-profile-roster';
import { useOrganizationWorkspace } from '../../../hooks/use-organization-workspace';
import { isBelowRole } from '../../../lib/write-access';
import { webCollections } from '../../../sync/webCollections';
import { contactFieldsFromValues } from '../-contact-fields';
import { settleWrite } from '../-public-engagement-writes';
import {
	defaultServiceRequestFormValues,
	ServiceRequestFormPage,
	type ServiceRequestSaveInput,
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

const warmGcTimeMs = 30_000;

function CreateServiceRequestRoute() {
	const { auth } = Route.useRouteContext();
	const initialGeometry = pointFromSearch(Route.useSearch());
	const navigate = useNavigate();
	const { organization } = useOrganizationWorkspace(auth.snapshot);
	const organizationId = organization?.id ?? '';
	const profiles = useProfileRoster();

	const actorProfileId =
		auth.snapshot?.authenticated === true ? auth.snapshot.localIdentity.profileId : null;
	const canSubmit = organization !== null && actorProfileId !== null;

	const today = useMemo(() => localToday(), []);

	// contacts and service_requests sync on demand; keep both streams warm so the
	// chained inserts' txid confirmations resolve instead of timing out cold.
	//
	// Neither row is ever read, so there is no order worth imposing — but a limit
	// without one is a compile error in TanStack DB, and an unordered `limit` is
	// what crashed this page to "Unable to load workspace data". `id` is the
	// ordering that costs nothing: it is the primary key, so it is already
	// indexed, and an ordered limit on an unindexed column would load the whole
	// collection to serve one row.
	useLiveQuery(
		{
			gcTime: warmGcTimeMs,
			query: (query) =>
				query
					.from({ contact: webCollections.contacts })
					.where(({ contact }) => eq(contact.organizationId, organizationId))
					.orderBy(({ contact }) => contact.id)
					.limit(1),
		},
		[organizationId],
	);
	useLiveQuery(
		{
			gcTime: warmGcTimeMs,
			query: (query) =>
				query
					.from({ request: webCollections.serviceRequests })
					.where(({ request }) => eq(request.organizationId, organizationId))
					.orderBy(({ request }) => request.id)
					.limit(1),
		},
		[organizationId],
	);

	const onSave = useCallback(
		async ({ values, geometry }: ServiceRequestSaveInput) => {
			if (organization === null) {
				throw new Error('Organization details are still loading.');
			}
			if (actorProfileId === null) {
				throw new Error('Your profile is still loading.');
			}
			if (geometry === null) {
				throw new Error('Place the request location on the map.');
			}
			const centroid = ownedCentroidFromGeoJson(geometry as unknown as GeoJsonGeometry);
			if (centroid === null) {
				throw new Error('Unable to determine the request location.');
			}

			const now = new Date().toISOString();
			const audit = {
				createdByProfileId: actorProfileId,
				updatedByProfileId: actorProfileId,
				createdAt: now,
				updatedAt: now,
			} as const;

			// 1. New contact (if any) — insert first so the request references a real id.
			let contactId = values.contactId;
			if (values.contactMode === 'new') {
				const contactRow: ContactRow = {
					id: crypto.randomUUID(),
					organizationId: organization.id,
					...contactFieldsFromValues(values.newContact),
					metadata: null,
					...audit,
				};
				await settleWrite(webCollections.contacts.insert(contactRow));
				contactId = contactRow.id;
			}
			if (contactId === null) {
				throw new Error('Select or create a contact for this request.');
			}

			// 2. The address is always an existing row: new ones are created by the
			//    picker's own inline form, which commits before handing back the id.
			const addressId = values.addressId;
			if (addressId === null) {
				throw new Error('Select or create an address for this request.');
			}

			// 3. The service request itself, carrying its own point via `metadata.geometry`.
			const requestRow: ServiceRequestRow = {
				id: crypto.randomUUID(),
				organizationId: organization.id,
				lat: centroid.lat,
				lng: centroid.lng,
				geomType: centroid.geomType,
				displayName: null,
				intakeType: values.intakeType,
				requestDate: values.requestDate,
				addressId,
				contactId,
				receivedByProfileId: values.receivedByProfileId,
				details: values.details.trim(),
				closedAt: null,
				closedByProfileId: null,
				metadata: null,
				...audit,
			};
			await settleWrite(
				webCollections.serviceRequests.insert(requestRow, { metadata: { geometry } }),
			);
			await navigate({
				to: '/public-engagement/service-requests/$id',
				params: { id: requestRow.id },
			});
		},
		[organization, actorProfileId, navigate],
	);

	return (
		<ServiceRequestFormPage
			canSubmit={canSubmit}
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

function localToday(): string {
	const now = new Date();
	const year = now.getFullYear();
	const month = `${now.getMonth() + 1}`.padStart(2, '0');
	const day = `${now.getDate()}`.padStart(2, '0');
	return `${year}-${month}-${day}`;
}
