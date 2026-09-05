import { settleWrite } from '@simmer-mosquito/sync';
import { useQueryClient } from '@tanstack/react-query';
import { createFileRoute, redirect, useNavigate } from '@tanstack/react-router';
import { useCallback, useState } from 'react';
import { newRecordId } from '../../../hooks/mutations/shared';
import { useRegionMutations } from '../../../hooks/mutations/use-region-mutations';
import { useRegionFolders } from '../../../hooks/queries/use-region-folders';
import { useRegionRecord } from '../../../hooks/queries/use-region-record';
import { seedRegionGeometryCache } from '../../../hooks/use-region-geometry';
import { isBelowRole } from '../../../lib/write-access';
import {
	type DrawGeometry,
	defaultRegionFormValues,
	isRegionBoundary,
	RegionFormPage,
	type RegionFormValues,
	regionFieldsFrom,
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
	const navigate = useNavigate();
	const queryClient = useQueryClient();
	const { folders } = useRegionFolders();
	const mutations = useRegionMutations();

	// Minted up front, and queried before it exists: `regions` is on-demand, and a
	// write into a collection nothing is querying waits out a txid confirmation
	// that never arrives — which reads as a frozen save rather than a slow one.
	const [regionId] = useState(() => newRecordId());
	useRegionRecord(regionId);

	const onSave = useCallback(
		async ({
			values,
			geometry,
		}: {
			readonly values: RegionFormValues;
			readonly geometry: DrawGeometry | null;
		}) => {
			if (geometry === null || !isRegionBoundary(geometry)) {
				throw new Error('Draw the region boundary before saving.');
			}

			await settleWrite(mutations.create(regionId, regionFieldsFrom(values), geometry));
			// Prime the detail's geometry cache so it renders the new boundary on arrival
			// instead of fetching (and briefly showing an empty state) from scratch.
			seedRegionGeometryCache(queryClient, regionId, geometry);
			await navigate({ to: '/gis/regions/$id', params: { id: regionId } });
		},
		[mutations, navigate, queryClient, regionId],
	);

	return (
		<RegionFormPage
			canSubmit={mutations.canWrite}
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
			regionFolders={folders}
			submitLabel="Create Region"
		/>
	);
}
