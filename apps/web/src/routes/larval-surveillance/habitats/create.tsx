import { type GeoJsonGeometry, ownedCentroidFromGeoJson } from '@simmer-mosquito/mapping';
import type { HabitatRow, HabitatTypeRow } from '@simmer-mosquito/sync';
import { useQueryClient } from '@tanstack/react-query';
import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { useCallback } from 'react';
import { useCollectionRows } from '../../../hooks/use-collection-rows';
import { useOrganizationWorkspace } from '../../../hooks/use-organization-workspace';
import { settleWrite } from '../../../sync/settle-write';
import { webCollections } from '../../../sync/webCollections';
import { seedHabitatGeometryCache } from '../../-habitat-geometry-cache';
import {
	type DrawGeometry,
	defaultHabitatFormValues,
	HabitatFormPage,
	type HabitatFormValues,
	noHabitatTypeValue,
} from './-habitat-form';

export const Route = createFileRoute('/larval-surveillance/habitats/create')({
	component: CreateHabitatRoute,
});

function CreateHabitatRoute() {
	const { auth } = Route.useRouteContext();
	const navigate = useNavigate();
	const queryClient = useQueryClient();
	const { organization } = useOrganizationWorkspace(auth.snapshot);
	const { rows: habitatTypes } = useCollectionRows<HabitatTypeRow>(webCollections.habitatTypes);

	const actorProfileId =
		auth.snapshot?.authenticated === true ? auth.snapshot.localIdentity.profileId : null;
	const canSubmit = organization !== null && actorProfileId !== null;

	const onSave = useCallback(
		async ({
			values,
			geometry,
		}: {
			readonly values: HabitatFormValues;
			readonly geometry: DrawGeometry;
		}) => {
			if (organization === null) {
				throw new Error('Organization details are still loading.');
			}
			if (actorProfileId === null) {
				throw new Error('Your profile is still loading.');
			}

			const centroid = ownedCentroidFromGeoJson(geometry as unknown as GeoJsonGeometry);
			if (centroid === null) {
				throw new Error('Unable to determine the habitat location from the drawn geometry.');
			}

			const now = new Date().toISOString();
			const row: HabitatRow = {
				id: crypto.randomUUID(),
				organizationId: organization.id,
				lat: centroid.lat,
				lng: centroid.lng,
				geomType: centroid.geomType,
				addressId: values.addressId,
				habitatTypeId: values.habitatTypeId === noHabitatTypeValue ? null : values.habitatTypeId,
				habitatName: nullableText(values.habitatName),
				description: values.description.trim(),
				isActive: true,
				isInaccessible: false,
				metadata: values.metadata,
				createdByProfileId: actorProfileId,
				updatedByProfileId: actorProfileId,
				createdAt: now,
				updatedAt: now,
			};

			const transaction = webCollections.habitats.insert(row, {
				metadata: { locationSource: { kind: 'geometry', geometry } },
			});
			await settleWrite(transaction);
			// Prime the detail's geometry cache so it renders the new shape on arrival
			// instead of fetching (and briefly showing an empty state) from scratch.
			seedHabitatGeometryCache(queryClient, row.id, geometry as unknown as GeoJsonGeometry);
			await navigate({ to: '/larval-surveillance/habitats/$id', params: { id: row.id } });
		},
		[organization, actorProfileId, navigate, queryClient],
	);

	return (
		<HabitatFormPage
			mode="create"
			organizationId={organization?.id ?? ''}
			actorProfileId={actorProfileId}
			canSubmit={canSubmit}
			habitatTypes={habitatTypes}
			defaultValues={defaultHabitatFormValues()}
			initialGeometry={null}
			header={{
				title: 'Create Habitat',
				description: 'Add a mapped larval habitat with the core field details crews need.',
				backTo: '/larval-surveillance/habitats',
				backLabel: 'Habitats',
			}}
			submitLabel="Create Habitat"
			onSave={onSave}
		/>
	);
}

function nullableText(value: string): string | null {
	const text = value.trim();
	return text.length === 0 ? null : text;
}
