import { useQueryClient } from '@tanstack/react-query';
import { createFileRoute, redirect, useNavigate } from '@tanstack/react-router';
import { useCallback } from 'react';
import { mapPointSearchSchema, pointFromSearch } from '../../../components/map';
import { useAddressMutations } from '../../../hooks/mutations/use-address-mutations';
import { useOrganizationWorkspace } from '../../../hooks/use-organization-workspace';
import { isWriteBlocked } from '../../../lib/write-access';
import { seedAddressGeometryCache } from './-address-data';
import {
	AddressFormPage,
	type AddressFormValues,
	type AddressPointGeometry,
	defaultAddressFormValues,
} from './-address-form';

export const Route = createFileRoute('/gis/addresses/create')({
	// Ahead of `beforeLoad`: the options object is read in order, and a guard
	// declared first is typed against a route whose search schema is not known
	// yet — which erases lat/lng from `Route.useSearch()`.
	validateSearch: (search) => mapPointSearchSchema.parse(search),
	beforeLoad: async ({ context }) => {
		if (await isWriteBlocked(context)) {
			throw redirect({ replace: true, to: '/gis/addresses' });
		}
	},
	component: CreateAddressRoute,
});

function CreateAddressRoute() {
	const { auth } = Route.useRouteContext();
	const initialGeometry = pointFromSearch(Route.useSearch());
	const navigate = useNavigate();
	const queryClient = useQueryClient();
	const { organization } = useOrganizationWorkspace(auth.snapshot);

	const actorProfileId =
		auth.snapshot?.authenticated === true ? auth.snapshot.localIdentity.profileId : null;
	const canSubmit = organization !== null && actorProfileId !== null;
	const mutations = useAddressMutations();

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

			const addressId = await mutations.create(
				{
					displayName: values.displayName.trim(),
					addressLine1: nullableText(values.addressLine1),
					addressLine2: nullableText(values.addressLine2),
					locality: nullableText(values.locality),
					region: nullableText(values.region),
					postalCode: nullableText(values.postalCode),
					geocoderResponse,
				},
				values.country.trim().toUpperCase(),
				geometry,
			);
			seedAddressGeometryCache(queryClient, addressId, geometry);
			await navigate({ to: '/gis/addresses/$id', params: { id: addressId } });
		},
		[mutations, navigate, queryClient, organization],
	);

	return (
		<AddressFormPage
			canSubmit={canSubmit}
			defaultValues={defaultAddressFormValues()}
			header={{
				title: 'Create Address',
				description: 'Add a geocoded address to the address book.',
				backTo: '/gis/addresses',
				backLabel: 'Address Book',
			}}
			initialGeometry={initialGeometry}
			onSave={onSave}
			submitLabel="Create Address"
		/>
	);
}

function nullableText(value: string): string | null {
	const text = value.trim();
	return text.length === 0 ? null : text;
}
