import { type GeoJsonGeometry, ownedCentroidFromGeoJson } from '@simmer-mosquito/mapping';
import type { CollectionLureRow, CollectionMethodRow, TrapRow } from '@simmer-mosquito/sync';
import { settleWrite } from '@simmer-mosquito/sync';
import { createFileRoute, redirect, useNavigate } from '@tanstack/react-router';
import { useCallback } from 'react';
import { mapPointSearchSchema, pointFromSearch } from '../../../components/map';
import { useCollectionRows } from '../../../hooks/use-collection-rows';
import { useOrganizationWorkspace } from '../../../hooks/use-organization-workspace';
import { isBelowRole } from '../../../lib/write-access';
import { webCollections } from '../../../sync/webCollections';
import {
	type DrawGeometry,
	defaultTrapFormValues,
	noLureValue,
	TrapFormPage,
	type TrapFormValues,
} from './-trap-form';

export const Route = createFileRoute('/adult-surveillance/traps/create')({
	// Ahead of `beforeLoad`: the options object is read in order, and a guard
	// declared first is typed against a route whose search schema is not known
	// yet — which erases lat/lng from `Route.useSearch()`.
	validateSearch: (search) => mapPointSearchSchema.parse(search),
	beforeLoad: async ({ context }) => {
		if (await isBelowRole(context, 'manager')) {
			throw redirect({ replace: true, to: '/adult-surveillance/traps' });
		}
	},
	component: CreateTrapRoute,
});

function CreateTrapRoute() {
	const { auth } = Route.useRouteContext();
	const initialGeometry = pointFromSearch(Route.useSearch());
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
			geometry,
		}: {
			readonly values: TrapFormValues;
			readonly geometry: DrawGeometry | null;
			readonly geometryChanged: boolean;
		}) => {
			if (organization === null) {
				throw new Error('Organization details are still loading.');
			}
			if (actorProfileId === null) {
				throw new Error('Your profile is still loading.');
			}
			if (geometry === null) {
				throw new Error('Place the trap point on the map.');
			}

			// The point is the trap's authoritative geometry; the address (if any) is
			// reference only. The server recomputes geom from the location source; this
			// centroid seeds the optimistic row so the map/coordinates show immediately.
			const centroid = ownedCentroidFromGeoJson(geometry as unknown as GeoJsonGeometry);
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
				addressId: values.addressId,
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

			const locationSource = {
				kind: 'geometry',
				geometry: geometry as unknown as GeoJsonGeometry,
			} as const;

			const transaction = webCollections.traps.insert(row, { metadata: { locationSource } });
			await settleWrite(transaction);
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
				title: 'Add Trap',
				description:
					'Place the trap point, optionally reference an address, and set its method and lure.',
				backTo: '/adult-surveillance/traps',
				backLabel: 'Traps',
			}}
			initialGeometry={initialGeometry}
			onSave={onSave}
			organizationId={organization?.id ?? ''}
			submitLabel="Add Trap"
		/>
	);
}

function nullableText(value: string): string | null {
	const text = value.trim();
	return text.length === 0 ? null : text;
}
