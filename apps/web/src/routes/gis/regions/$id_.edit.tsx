import { useQueryClient } from '@tanstack/react-query';
import { createFileRoute, redirect, useNavigate } from '@tanstack/react-router';
import { useCallback } from 'react';
import { EditFormSkeleton, RecordUnavailable } from '../../../components/record';
import { useRegionMutations } from '../../../hooks/mutations/use-region-mutations';
import {
	type RegionFolderListing,
	useRegionFolders,
} from '../../../hooks/queries/use-region-folders';
import { type RegionRecord, useRegionRecord } from '../../../hooks/queries/use-region-record';
import { seedRegionGeometryCache, useRegionGeometry } from '../../../hooks/use-region-geometry';
import { isBelowRole } from '../../../lib/write-access';
import {
	type DrawGeometry,
	isRegionBoundary,
	noRegionFolderValue,
	RegionFormPage,
	type RegionFormValues,
	regionFieldsFrom,
} from './-region-form';

export const Route = createFileRoute('/gis/regions/$id_/edit')({
	beforeLoad: async ({ context, params }) => {
		if (await isBelowRole(context, 'manager')) {
			throw redirect({ params: { id: params.id }, replace: true, to: '/gis/regions/$id' });
		}
	},
	component: EditRegionRoute,
});

function EditRegionRoute() {
	const { id } = Route.useParams();
	const { folders } = useRegionFolders();
	const { region, isReady, isError } = useRegionRecord(id);
	const geometryQuery = useRegionGeometry(id);

	if (isError) {
		return <RecordUnavailable layout="centered" noun="region" reason="error" />;
	}
	if (!isReady || geometryQuery.isLoading) {
		return <EditFormSkeleton rows={['h-9', ['h-9', 'h-9'], 'h-24']} />;
	}
	if (region === undefined) {
		return <RecordUnavailable layout="centered" noun="region" reason="not-found" />;
	}

	const initialGeometry = (geometryQuery.data?.geojson ?? null) as DrawGeometry | null;

	return (
		<EditRegionLoader initialGeometry={initialGeometry} region={region} regionFolders={folders} />
	);
}

function EditRegionLoader({
	region,
	regionFolders,
	initialGeometry,
}: {
	readonly region: RegionRecord;
	readonly regionFolders: readonly RegionFolderListing[];
	readonly initialGeometry: DrawGeometry | null;
}) {
	const navigate = useNavigate();
	const queryClient = useQueryClient();
	const mutations = useRegionMutations();

	const onSave = useCallback(
		async ({
			values,
			geometry,
			geometryChanged,
		}: {
			readonly values: RegionFormValues;
			readonly geometry: DrawGeometry | null;
			readonly geometryChanged: boolean;
		}) => {
			// `null` unless the user actually redrew it: the form holds the boundary it
			// loaded, and sending that back names a command with nothing to change.
			const boundary =
				geometryChanged && geometry !== null && isRegionBoundary(geometry) ? geometry : null;

			// `current` comes back through the same round trip as the edited values, so
			// a field nobody touched compares equal to itself and the save names only
			// the commands it has changed fields for.
			await mutations.save({
				regionId: region.id,
				fields: regionFieldsFrom(values),
				current: regionFieldsFrom(formValuesFrom(region)),
				geometry: boundary,
			});
			if (boundary !== null) {
				seedRegionGeometryCache(queryClient, region.id, boundary);
			}
			await navigate({ to: '/gis/regions/$id', params: { id: region.id } });
		},
		[mutations, navigate, queryClient, region],
	);

	return (
		<RegionFormPage
			canSubmit={mutations.canWrite}
			defaultValues={formValuesFrom(region)}
			header={{
				title: 'Edit Region',
				description: "Update this region's name, folder, boundary, or details.",
				backTo: '/gis/regions/$id',
				backParams: { id: region.id },
				backLabel: 'Back to Region',
			}}
			initialGeometry={initialGeometry}
			mode="edit"
			onSave={onSave}
			regionFolders={regionFolders}
			submitLabel="Save Changes"
		/>
	);
}

function formValuesFrom(region: RegionRecord): RegionFormValues {
	return {
		name: region.name,
		regionFolderId: region.folderId ?? noRegionFolderValue,
		description: region.description ?? '',
		metadata: (region.metadata ?? null) as RegionFormValues['metadata'],
	};
}
