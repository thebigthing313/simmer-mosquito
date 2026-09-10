import { isOwnedGeometry } from '@simmer-mosquito/domain';
import { useQueryClient } from '@tanstack/react-query';
import { createFileRoute, redirect, useNavigate } from '@tanstack/react-router';
import { EditFormSkeleton, RecordEditFrame } from '../../../components/record';
import { useRegionMutations } from '../../../hooks/mutations/use-region-mutations';
import {
	type RegionFolderListing,
	useRegionFolders,
} from '../../../hooks/queries/use-region-folders';
import { type RegionRecord, useRegionRecord } from '../../../hooks/queries/use-region-record';
import { seedRegionGeometryCache, useRegionGeometry } from '../../../hooks/use-region-geometry';
import { isBelowWriteFloor } from '../../../lib/write-surfaces';
import {
	type DrawGeometry,
	noRegionFolderValue,
	RegionFormPage,
	type RegionFormValues,
	regionFieldsFrom,
} from './-region-form';

export const Route = createFileRoute('/gis/regions/$id_/edit')({
	beforeLoad: async ({ context, params }) => {
		if (await isBelowWriteFloor(context, '/gis/regions/$id/edit')) {
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

	// What reaches here is already one of the shapes a Region may store, checked in
	// `useRegionGeometry`'s fetch (#761). The cast that is left is not a claim about
	// the shape: `DrawGeometry` holds two-element positions and a stored geometry
	// may carry an altitude, which is `toDrawGeometry`'s business and the draw
	// flow's, not this seam's.
	const initialGeometry = (geometryQuery.data?.geojson ?? null) as DrawGeometry | null;
	const skeleton = <EditFormSkeleton rows={['h-9', ['h-9', 'h-9'], 'h-24']} />;

	return (
		<RecordEditFrame
			noun="region"
			reading={{ isError, isReady, record: region }}
			skeleton={skeleton}
		>
			{(record) =>
				geometryQuery.isLoading ? (
					skeleton
				) : (
					<EditRegionLoader
						initialGeometry={initialGeometry}
						region={record}
						regionFolders={folders}
					/>
				)
			}
		</RecordEditFrame>
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

	const onSave = async ({
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
			geometryChanged && geometry !== null && isOwnedGeometry('region', geometry) ? geometry : null;

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
	};

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
