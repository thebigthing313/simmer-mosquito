import { type GeoJsonGeometry, ownedCentroidFromGeoJson } from '@simmer-mosquito/mapping';
import type { CollectionLureRow, CollectionMethodRow, TrapRow } from '@simmer-mosquito/sync';
import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { useCallback } from 'react';
import { useCollectionRows } from '../../../hooks/use-collection-rows';
import { useOrganizationWorkspace } from '../../../hooks/use-organization-workspace';
import { webCollections } from '../../../sync/webCollections';
import {
	type DrawGeometry,
	defaultTrapFormValues,
	noLureValue,
	TrapFormPage,
	type TrapFormValues,
} from './-trap-form';

export const Route = createFileRoute('/adult-surveillance/traps/create')({
	component: CreateTrapRoute,
});

function CreateTrapRoute() {
	const { auth } = Route.useRouteContext();
	const navigate = useNavigate();
	const { organization } = useOrganizationWorkspace(auth.snapshot);
	const { rows: methods } = useCollectionRows<CollectionMethodRow>(
		webCollections.collectionMethods,
	);
	const { rows: lures } = useCollectionRows<CollectionLureRow>(webCollections.collectionLures);

	const actorProfileId =
		auth.snapshot?.authenticated === true ? auth.snapshot.localIdentity.profileId : null;
	const canSubmit = organization !== null && actorProfileId !== null;

	const onSave = useCallback(
		async ({
			values,
			adhocGeometry,
			addressCoord,
		}: {
			readonly values: TrapFormValues;
			readonly adhocGeometry: DrawGeometry | null;
			readonly addressCoord: { readonly lat: number; readonly lng: number } | null;
		}) => {
			if (organization === null) {
				throw new Error('Organization details are still loading.');
			}
			if (actorProfileId === null) {
				throw new Error('Your profile is still loading.');
			}

			const isAddress = values.locationMode === 'address';
			// The server recomputes geometry from the location source; these seed the
			// optimistic row so the map/coordinates show immediately.
			const centroid =
				isAddress && addressCoord !== null
					? { lat: addressCoord.lat, lng: addressCoord.lng, geomType: 'point' }
					: ownedCentroidFromGeoJson(adhocGeometry as unknown as GeoJsonGeometry);
			if (centroid === null) {
				throw new Error('Unable to determine the trap location.');
			}

			const now = new Date().toISOString();
			const row: TrapRow = {
				id: crypto.randomUUID(),
				organizationId: organization.id,
				lat: centroid.lat,
				lng: centroid.lng,
				geomType: centroid.geomType,
				collectionMethodId: values.collectionMethodId,
				addressId: isAddress ? values.addressId : null,
				collectionLureId: values.collectionLureId === noLureValue ? null : values.collectionLureId,
				trapName: nullableText(values.trapName),
				trapCode: nullableText(values.trapCode),
				description: nullableText(values.description),
				isActive: values.isActive,
				createdByProfileId: actorProfileId,
				updatedByProfileId: actorProfileId,
				createdAt: now,
				updatedAt: now,
			};

			const locationSource =
				isAddress && values.addressId !== null
					? ({ kind: 'address', addressId: values.addressId } as const)
					: ({
							kind: 'geometry',
							geometry: adhocGeometry as unknown as GeoJsonGeometry,
						} as const);

			const transaction = webCollections.traps.insert(row, { metadata: { locationSource } });
			await transaction.isPersisted.promise;
			await navigate({ to: '/adult-surveillance/traps/$id', params: { id: row.id } });
		},
		[organization, actorProfileId, navigate],
	);

	return (
		<TrapFormPage
			canSubmit={canSubmit}
			collectionLures={lures}
			collectionMethods={methods}
			defaultValues={defaultTrapFormValues()}
			header={{
				title: 'Add trap',
				description:
					'Register a trap at an address or an ad-hoc field point, with its method and lure.',
				backTo: '/adult-surveillance/traps',
				backLabel: 'Traps',
			}}
			onSave={onSave}
			organizationId={organization?.id ?? ''}
			submitLabel="Add trap"
		/>
	);
}

function nullableText(value: string): string | null {
	const text = value.trim();
	return text.length === 0 ? null : text;
}
