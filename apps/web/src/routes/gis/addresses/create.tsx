import { useQueryClient } from '@tanstack/react-query';
import { createFileRoute, redirect, useNavigate } from '@tanstack/react-router';
import { createLabel } from '../../../components/app-shell/navigation';
import {
	AddressFormPage,
	type AddressFormSave,
	defaultAddressFormValues,
} from '../../../components/gis/addresses/address-form';
import { mapPointSearchSchema, pointFromSearch } from '../../../components/map';
import { seedAddressGeometryCache } from '../../../hooks/gis/use-address-geometry';
import { canAttributeWrite } from '../../../hooks/mutations/shared';
import { useAddressMutations } from '../../../hooks/mutations/use-address-mutations';
import { useOrganizationWorkspace } from '../../../hooks/use-organization-workspace';
import { isBelowWriteFloor } from '../../../lib/write-surfaces';

export const Route = createFileRoute('/gis/addresses/create')({
	// Ahead of `beforeLoad`: the options object is read in order, and a guard
	// declared first is typed against a route whose search schema is not known
	// yet — which erases lat/lng from `Route.useSearch()`.
	validateSearch: (search) => mapPointSearchSchema.parse(search),
	beforeLoad: async ({ context }) => {
		if (await isBelowWriteFloor(context, '/gis/addresses/create')) {
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
	const canSubmit = canAttributeWrite({ organization, actorProfileId });
	const mutations = useAddressMutations();

	const onSave = async ({ values, geometry, geocoderResponse }: AddressFormSave) => {
		if (geometry === null) {
			throw new Error('Place the address point before saving.');
		}

		// The id comes back from the write rather than being minted here, and
		// neither reason `newRecordId` gives for minting up front applies. Nothing
		// on this page writes a child row against the new address, and although
		// `addresses` is on-demand, nothing here subscribes to it, so the insert
		// returns no txid to wait on and the write settles on the server's answer.
		// The geometry cache below is seeded after that answer, not before it.
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
	};

	return (
		<AddressFormPage
			canSubmit={canSubmit}
			defaultValues={defaultAddressFormValues()}
			header={{
				title: createLabel('address'),
				description: 'Add a geocoded address to the address book.',
				backTo: '/gis/addresses',
				// The surface's own name, not the register's `Addresses`: CONTEXT.md
				// glosses an Address as an "address book entry", and the explorer this
				// goes back to is headed Address Book for that reason (#985).
				backLabel: 'Address Book',
			}}
			initialGeometry={initialGeometry}
			onSave={onSave}
		/>
	);
}

function nullableText(value: string): string | null {
	const text = value.trim();
	return text.length === 0 ? null : text;
}
