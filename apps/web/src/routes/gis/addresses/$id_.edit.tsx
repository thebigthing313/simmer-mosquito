import type { GeoJsonGeometry } from '@simmer-mosquito/mapping';
import type { AddressRow } from '@simmer-mosquito/sync';
import {
	Empty,
	EmptyDescription,
	EmptyHeader,
	EmptyTitle,
} from '@simmer-mosquito/ui-web/components/ui/empty';
import { Skeleton } from '@simmer-mosquito/ui-web/components/ui/skeleton';
import { eq, useLiveQuery } from '@tanstack/react-db';
import { useQueryClient } from '@tanstack/react-query';
import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { useCallback } from 'react';
import { useOrganizationWorkspace } from '../../../hooks/use-organization-workspace';
import { settleWrite } from '../../../sync/settle-write';
import { webCollections } from '../../../sync/webCollections';
import { seedAddressGeometryCache, useAddressGeometry } from './-address-data';
import {
	AddressFormPage,
	type AddressFormValues,
	type AddressPointGeometry,
} from './-address-form';

export const Route = createFileRoute('/gis/addresses/$id_/edit')({
	component: EditAddressRoute,
});

const addressGcTimeMs = 30_000;

function EditAddressRoute() {
	const { id } = Route.useParams();
	const { auth } = Route.useRouteContext();
	const { organization } = useOrganizationWorkspace(auth.snapshot);

	// addresses is on-demand; status-gated useLiveQuery (not the suspense variant)
	// to avoid the post-unmount hang on on-demand collections.
	const addressResult = useLiveQuery(
		{
			gcTime: addressGcTimeMs,
			query: (query) =>
				query
					.from({ address: webCollections.addresses })
					.where(({ address }) => eq(address.id, id))
					.findOne(),
		},
		[id],
	);
	const address = addressResult.data as AddressRow | undefined;
	const geometryQuery = useAddressGeometry(id);

	if (addressResult.isError) {
		return <EditUnavailable description="This address could not be loaded." />;
	}
	if (!addressResult.isReady || geometryQuery.isLoading) {
		return <EditFormSkeleton />;
	}
	if (address === undefined) {
		return (
			<EditUnavailable description="This address could not be found, or you do not have access to it." />
		);
	}

	const actorProfileId =
		auth.snapshot?.authenticated === true ? auth.snapshot.localIdentity.profileId : null;
	const initialGeometry = (geometryQuery.data?.geojson ?? null) as AddressPointGeometry | null;

	return (
		<EditAddressLoader
			actorProfileId={actorProfileId}
			address={address}
			canSubmit={organization !== null && actorProfileId !== null}
			initialGeometry={initialGeometry}
		/>
	);
}

function EditAddressLoader({
	address,
	initialGeometry,
	actorProfileId,
	canSubmit,
}: {
	readonly address: AddressRow;
	readonly initialGeometry: AddressPointGeometry | null;
	readonly actorProfileId: string | null;
	readonly canSubmit: boolean;
}) {
	const navigate = useNavigate();
	const queryClient = useQueryClient();

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
			const now = new Date().toISOString();
			const refinedPoint = geometryChanged && geometry !== null;
			const applyEdits = (draft: AddressRow) => {
				const writable = draft as { -readonly [K in keyof AddressRow]: AddressRow[K] };
				writable.displayName = values.displayName.trim();
				writable.addressLine1 = nullableText(values.addressLine1);
				writable.addressLine2 = nullableText(values.addressLine2);
				writable.locality = nullableText(values.locality);
				writable.region = nullableText(values.region);
				writable.postalCode = nullableText(values.postalCode);
				writable.geocoderResponse = geocoderResponse ?? null;
				if (refinedPoint && geometry !== null) {
					writable.geojson = geometry;
					writable.lat = geometry.coordinates[1];
					writable.lng = geometry.coordinates[0];
					writable.geomType = geometry.type;
				}
				if (actorProfileId !== null) {
					writable.updatedByProfileId = actorProfileId;
				}
				writable.updatedAt = now;
			};

			const transaction = webCollections.addresses.update(address.id, applyEdits);
			await settleWrite(transaction);
			if (refinedPoint && geometry !== null) {
				seedAddressGeometryCache(queryClient, address.id, geometry as unknown as GeoJsonGeometry);
			}
			await navigate({ to: '/gis/addresses/$id', params: { id: address.id } });
		},
		[address, actorProfileId, navigate, queryClient],
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

function defaultsFromAddress(address: AddressRow): AddressFormValues {
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

function EditFormSkeleton() {
	return (
		<div className="grid h-full min-h-0 w-full grid-cols-[2fr_3fr] overflow-hidden">
			<div className="grid content-start gap-5 overflow-y-auto px-5 py-5">
				<Skeleton className="h-6 w-40" />
				<div className="grid grid-cols-2 gap-4">
					<Skeleton className="h-9 w-full" />
					<Skeleton className="h-9 w-full" />
					<Skeleton className="h-9 w-full" />
					<Skeleton className="h-9 w-full" />
				</div>
				<Skeleton className="h-24 w-full" />
			</div>
			<Skeleton className="h-full w-full rounded-none border-border/40 border-l" />
		</div>
	);
}

function EditUnavailable({ description }: { readonly description: string }) {
	return (
		<div className="flex h-full min-h-0 items-center justify-center p-8">
			<Empty className="max-w-md border border-border/40 bg-muted/30">
				<EmptyHeader>
					<EmptyTitle>Address Unavailable</EmptyTitle>
					<EmptyDescription>{description}</EmptyDescription>
				</EmptyHeader>
			</Empty>
		</div>
	);
}
