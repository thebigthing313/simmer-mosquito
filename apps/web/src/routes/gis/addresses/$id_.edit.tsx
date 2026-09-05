import { useQueryClient } from '@tanstack/react-query';
import { createFileRoute, redirect, useNavigate } from '@tanstack/react-router';
import { useCallback } from 'react';
import { EditFormSkeleton, RecordUnavailable } from '../../../components/record';
import {
	type AddressFields,
	useAddressMutations,
} from '../../../hooks/mutations/use-address-mutations';
import { type AddressRecord, useAddressRecord } from '../../../hooks/queries/use-address-record';
import { useOrganizationWorkspace } from '../../../hooks/use-organization-workspace';
import { isBelowRole } from '../../../lib/write-access';
import { seedAddressGeometryCache, useAddressGeometry } from './-address-data';
import {
	AddressFormPage,
	type AddressFormValues,
	type AddressPointGeometry,
} from './-address-form';

export const Route = createFileRoute('/gis/addresses/$id_/edit')({
	beforeLoad: async ({ context, params }) => {
		if (await isBelowRole(context, 'manager')) {
			throw redirect({ params: { id: params.id }, replace: true, to: '/gis/addresses/$id' });
		}
	},
	component: EditAddressRoute,
});

const _addressGcTimeMs = 30_000;

function EditAddressRoute() {
	const { id } = Route.useParams();
	const { auth } = Route.useRouteContext();
	const { organization } = useOrganizationWorkspace(auth.snapshot);

	// addresses is on-demand; status-gated useLiveQuery (not the suspense variant)
	// to avoid the post-unmount hang on on-demand collections.
	const addressResult = useAddressRecord(id);
	const address = addressResult.address;
	const geometryQuery = useAddressGeometry(id);

	if (addressResult.isError) {
		return <RecordUnavailable layout="centered" noun="address" reason="error" />;
	}
	if (!addressResult.isReady || geometryQuery.isLoading) {
		return <EditFormSkeleton rows={[['h-9', 'h-9', 'h-9', 'h-9'], 'h-24']} />;
	}
	if (address === undefined) {
		return <RecordUnavailable layout="centered" noun="address" reason="not-found" />;
	}

	const actorProfileId =
		auth.snapshot?.authenticated === true ? auth.snapshot.localIdentity.profileId : null;
	const initialGeometry = (geometryQuery.data?.geojson ?? null) as AddressPointGeometry | null;

	return (
		<EditAddressLoader
			address={address}
			canSubmit={organization !== null && actorProfileId !== null}
			initialGeometry={initialGeometry}
		/>
	);
}

function EditAddressLoader({
	address,
	initialGeometry,
	canSubmit,
}: {
	readonly address: AddressRecord;
	readonly initialGeometry: AddressPointGeometry | null;
	readonly canSubmit: boolean;
}) {
	const navigate = useNavigate();
	const queryClient = useQueryClient();
	const mutations = useAddressMutations();

	const onSave = useCallback(
		async ({
			values,
			geometry,
			geometryChanged,
			geocoderResponse,
		}: {
			readonly values: AddressFormValues;
			readonly geometry: AddressPointGeometry | null;
			readonly geometryChanged: boolean;
			readonly geocoderResponse: unknown | null;
		}) => {
			const refinedPoint = geometryChanged && geometry !== null;
			// The point goes only when it actually moved: naming the location command
			// with the point the row already has is a write with no edit behind it.
			await mutations.save(
				address.id,
				{
					displayName: values.displayName.trim(),
					addressLine1: nullableText(values.addressLine1),
					addressLine2: nullableText(values.addressLine2),
					locality: nullableText(values.locality),
					region: nullableText(values.region),
					postalCode: nullableText(values.postalCode),
					geocoderResponse: geocoderResponse ?? null,
				},
				addressFieldsOf(address),
				refinedPoint ? geometry : null,
			);
			if (refinedPoint && geometry !== null) {
				seedAddressGeometryCache(queryClient, address.id, geometry);
			}
			await navigate({ to: '/gis/addresses/$id', params: { id: address.id } });
		},
		[address, mutations, navigate, queryClient],
	);

	return (
		<AddressFormPage
			canSubmit={canSubmit}
			defaultValues={defaultsFromAddress(address)}
			header={{
				title: 'Edit Address',
				description: "Update this address's details or location.",
				backTo: '/gis/addresses/$id',
				backParams: { id: address.id },
				backLabel: 'Back to Address',
			}}
			initialGeocoderResponse={address.geocoderResponse ?? null}
			initialGeometry={initialGeometry}
			onSave={onSave}
			submitLabel="Save Changes"
		/>
	);
}

function defaultsFromAddress(address: AddressRecord): AddressFormValues {
	return {
		displayName: address.displayName,
		country: address.country,
		addressLine1: address.addressLine1 ?? '',
		addressLine2: address.addressLine2 ?? '',
		locality: address.locality ?? '',
		region: address.region ?? '',
		postalCode: address.postalCode ?? '',
	};
}

function nullableText(value: string): string | null {
	const text = value.trim();
	return text.length === 0 ? null : text;
}

/** The record as the save compares against, in the write hook's vocabulary. */
function addressFieldsOf(address: AddressRecord): AddressFields {
	return {
		displayName: address.displayName,
		addressLine1: address.addressLine1,
		addressLine2: address.addressLine2,
		locality: address.locality,
		region: address.region,
		postalCode: address.postalCode,
		geocoderResponse: address.geocoderResponse,
	};
}
