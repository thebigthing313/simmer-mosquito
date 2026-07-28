import { type GeoJsonGeometry, ownedCentroidFromGeoJson } from '@simmer-mosquito/mapping';
import type { AddressRow, ContactRow, ProfileRow, ServiceRequestRow } from '@simmer-mosquito/sync';
import { eq, useLiveQuery } from '@tanstack/react-db';
import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { useCallback, useMemo } from 'react';
import { useCollectionRows } from '../../../hooks/use-collection-rows';
import { useOrganizationWorkspace } from '../../../hooks/use-organization-workspace';
import { webCollections } from '../../../sync/webCollections';
import { settleWrite } from '../-public-engagement-writes';
import {
	defaultServiceRequestFormValues,
	ServiceRequestFormPage,
	type ServiceRequestSaveInput,
} from './-service-request-form';

export const Route = createFileRoute('/public-engagement/service-requests/create')({
	component: CreateServiceRequestRoute,
});

const warmGcTimeMs = 30_000;

function CreateServiceRequestRoute() {
	const { auth } = Route.useRouteContext();
	const navigate = useNavigate();
	const { organization } = useOrganizationWorkspace(auth.snapshot);
	const organizationId = organization?.id ?? '';
	const { rows: profiles } = useCollectionRows<ProfileRow>(webCollections.profiles);

	const actorProfileId =
		auth.snapshot?.authenticated === true ? auth.snapshot.localIdentity.profileId : null;
	const canSubmit = organization !== null && actorProfileId !== null;

	const today = useMemo(() => localToday(), []);

	// contacts and service_requests sync on demand; keep both streams warm so the
	// chained inserts' txid confirmations resolve instead of timing out cold.
	useLiveQuery(
		{
			gcTime: warmGcTimeMs,
			query: (query) =>
				query
					.from({ contact: webCollections.contacts })
					.where(({ contact }) => eq(contact.organizationId, organizationId))
					.orderBy(({ contact }) => contact.id, 'asc')
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
					.orderBy(({ request }) => request.id, 'asc')
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
					contactName: nullableText(values.newContactName),
					company: nullableText(values.newContactCompany),
					department: null,
					title: null,
					preferredPhone: nullableText(values.newContactPhone),
					alternatePhone: null,
					email: nullableText(values.newContactEmail),
					wantsEmail: false,
					wantsSms: false,
					wantsPhone: false,
					metadata: null,
					...audit,
				};
				await settleWrite(webCollections.contacts.insert(contactRow));
				contactId = contactRow.id;
			}
			if (contactId === null) {
				throw new Error('Select or create a contact for this request.');
			}

			// 2. New address (if any) — the request's point seeds the address geometry.
			let addressId = values.addressId;
			if (values.addressMode === 'new') {
				const point = { type: 'Point' as const, coordinates: [centroid.lng, centroid.lat] };
				const addressRow: AddressRow = {
					id: crypto.randomUUID(),
					organizationId: organization.id,
					lat: centroid.lat,
					lng: centroid.lng,
					geojson: point as unknown as AddressRow['geojson'],
					geomType: 'Point',
					displayName: values.newAddressName.trim(),
					country: 'US',
					addressLine1: nullableText(values.newAddressLine1),
					addressLine2: null,
					locality: nullableText(values.newAddressLocality),
					region: nullableText(values.newAddressRegion),
					postalCode: nullableText(values.newAddressPostal),
					geocoderResponse: null,
					...audit,
				};
				// addresses' insert handler returns no txid, so this resolves on POST.
				await settleWrite(webCollections.addresses.insert(addressRow));
				addressId = addressRow.id;
			}
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
			onSave={onSave}
			organizationId={organizationId}
			profiles={profiles}
			submitLabel="Create Request"
		/>
	);
}

function nullableText(value: string): string | null {
	const text = value.trim();
	return text.length === 0 ? null : text;
}

function localToday(): string {
	const now = new Date();
	const year = now.getFullYear();
	const month = `${now.getMonth() + 1}`.padStart(2, '0');
	const day = `${now.getDate()}`.padStart(2, '0');
	return `${year}-${month}-${day}`;
}
