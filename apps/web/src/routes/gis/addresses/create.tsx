import type { GeoJsonGeometry } from '@simmer-mosquito/mapping';
import type { AddressRow } from '@simmer-mosquito/sync';
import { useQueryClient } from '@tanstack/react-query';
import { createFileRoute, redirect, useNavigate } from '@tanstack/react-router';
import { useCallback } from 'react';
import { useOrganizationWorkspace } from '../../../hooks/use-organization-workspace';
import { isWriteBlocked } from '../../../lib/write-access';
import { settleWrite } from '../../../sync/settle-write';
import { webCollections } from '../../../sync/webCollections';
import { seedAddressGeometryCache } from './-address-data';
import {
	AddressFormPage,
	type AddressFormValues,
	type AddressPointGeometry,
	defaultAddressFormValues,
} from './-address-form';

export const Route = createFileRoute('/gis/addresses/create')({
	beforeLoad: async ({ context }) => {
		if (await isWriteBlocked(context)) {
			throw redirect({ replace: true, to: '/gis/addresses' });
		}
	},
	component: CreateAddressRoute,
});

function CreateAddressRoute() {
	const { auth } = Route.useRouteContext();
	const navigate = useNavigate();
	const queryClient = useQueryClient();
	const { organization } = useOrganizationWorkspace(auth.snapshot);

	const actorProfileId =
		auth.snapshot?.authenticated === true ? auth.snapshot.localIdentity.profileId : null;
	const canSubmit = organization !== null && actorProfileId !== null;

	const onSave = useCallback(
		async ({
			values,
			geometry,
			geocoderResponse,
		}: {
			readonly values: AddressFormValues;
			readonly geometry: AddressPointGeometry | null;
			readonly geocoderResponse: unknown | null;
		}) => {
			if (organization === null) {
				throw new Error('Organization details are still loading.');
			}
			if (geometry === null) {
				throw new Error('Place the address point before saving.');
			}

			const now = new Date().toISOString();
			const row: AddressRow = {
				id: crypto.randomUUID(),
				organizationId: organization.id,
				lat: geometry.coordinates[1],
				lng: geometry.coordinates[0],
				geojson: geometry,
				geomType: geometry.type,
				displayName: values.displayName.trim(),
				country: values.country.trim().toUpperCase(),
				addressLine1: nullableText(values.addressLine1),
				addressLine2: nullableText(values.addressLine2),
				locality: nullableText(values.locality),
				region: nullableText(values.region),
				postalCode: nullableText(values.postalCode),
				geocoderResponse,
				createdByProfileId: actorProfileId,
				updatedByProfileId: actorProfileId,
				createdAt: now,
				updatedAt: now,
			};

			const transaction = webCollections.addresses.insert(row);
			await settleWrite(transaction);
			seedAddressGeometryCache(queryClient, row.id, geometry as unknown as GeoJsonGeometry);
			await navigate({ to: '/gis/addresses/$id', params: { id: row.id } });
		},
		[organization, actorProfileId, navigate, queryClient],
	);

	return (
		<AddressFormPage
			canSubmit={canSubmit}
			defaultValues={defaultAddressFormValues()}
			header={{
				title: 'Create Address',
				description: 'Add a geocoded address to the agency address book.',
				backTo: '/gis/addresses',
				backLabel: 'Address Book',
			}}
			initialGeometry={null}
			onSave={onSave}
			submitLabel="Create Address"
		/>
	);
}

function nullableText(value: string): string | null {
	const text = value.trim();
	return text.length === 0 ? null : text;
}
