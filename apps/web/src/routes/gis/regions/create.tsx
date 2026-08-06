import type { GeoJsonGeometry } from '@simmer-mosquito/mapping';
import type { RegionFolderRow, RegionRow } from '@simmer-mosquito/sync';
import { settleWrite } from '@simmer-mosquito/sync';
import { useQueryClient } from '@tanstack/react-query';
import { createFileRoute, redirect, useNavigate } from '@tanstack/react-router';
import { useCallback } from 'react';
import { useCollectionRows } from '../../../hooks/use-collection-rows';
import { useOrganizationWorkspace } from '../../../hooks/use-organization-workspace';
import { seedRegionGeometryCache } from '../../../hooks/use-region-geometry';
import { isBelowRole } from '../../../lib/write-access';
import { webCollections } from '../../../sync/webCollections';
import {
	type DrawGeometry,
	defaultRegionFormValues,
	noRegionFolderValue,
	RegionFormPage,
	type RegionFormValues,
} from './-region-form';

export const Route = createFileRoute('/gis/regions/create')({
	beforeLoad: async ({ context }) => {
		if (await isBelowRole(context, 'manager')) {
			throw redirect({ replace: true, to: '/gis/regions' });
		}
	},
	component: CreateRegionRoute,
});

function CreateRegionRoute() {
	const { auth } = Route.useRouteContext();
	const navigate = useNavigate();
	const queryClient = useQueryClient();
	const { organization } = useOrganizationWorkspace(auth.snapshot);
	const { rows: regionFolders } = useCollectionRows<RegionFolderRow>(webCollections.regionFolders);

	const actorProfileId =
		auth.snapshot?.authenticated === true ? auth.snapshot.localIdentity.profileId : null;
	const canSubmit = organization !== null && actorProfileId !== null;

	const onSave = useCallback(
		async ({
			values,
			geometry,
		}: {
			readonly values: RegionFormValues;
			readonly geometry: DrawGeometry | null;
		}) => {
			if (organization === null) {
				throw new Error('Organization details are still loading.');
			}
			if (geometry === null) {
				throw new Error('Draw the region boundary before saving.');
			}

			const now = new Date().toISOString();
			const row: RegionRow = {
				id: crypto.randomUUID(),
				organizationId: organization.id,
				regionFolderId:
					values.regionFolderId === noRegionFolderValue ? null : values.regionFolderId,
				name: values.name.trim(),
				description: nullableText(values.description),
				metadata: values.metadata ?? null,
				createdByProfileId: actorProfileId,
				updatedByProfileId: actorProfileId,
				createdAt: now,
				updatedAt: now,
			};

			const transaction = webCollections.regions.insert(row, { metadata: { geometry } });
			await settleWrite(transaction);
			// Prime the detail's geometry cache so it renders the new boundary on arrival
			// instead of fetching (and briefly showing an empty state) from scratch.
			seedRegionGeometryCache(queryClient, row.id, geometry as unknown as GeoJsonGeometry);
			await navigate({ to: '/gis/regions/$id', params: { id: row.id } });
		},
		[organization, actorProfileId, navigate, queryClient],
	);

	return (
		<RegionFormPage
			canSubmit={canSubmit}
			defaultValues={defaultRegionFormValues()}
			header={{
				title: 'Create Region',
				description: 'Draw a region boundary and name it for use across the agency.',
				backTo: '/gis/regions',
				backLabel: 'Regions',
			}}
			initialGeometry={null}
			mode="create"
			onSave={onSave}
			regionFolders={regionFolders}
			submitLabel="Create Region"
		/>
	);
}

function nullableText(value: string): string | null {
	const text = value.trim();
	return text.length === 0 ? null : text;
}
