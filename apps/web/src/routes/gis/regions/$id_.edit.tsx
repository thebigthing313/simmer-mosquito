import type { GeoJsonGeometry } from '@simmer-mosquito/mapping';
import type { RegionFolderRow, RegionRow } from '@simmer-mosquito/sync';
import {
	Empty,
	EmptyDescription,
	EmptyHeader,
	EmptyTitle,
} from '@simmer-mosquito/ui-web/components/ui/empty';
import { Skeleton } from '@simmer-mosquito/ui-web/components/ui/skeleton';
import { eq, useLiveQuery } from '@tanstack/react-db';
import { useQueryClient } from '@tanstack/react-query';
import { createFileRoute, redirect, useNavigate } from '@tanstack/react-router';
import { useCallback } from 'react';
import { useCollectionRows } from '../../../hooks/use-collection-rows';
import { useOrganizationWorkspace } from '../../../hooks/use-organization-workspace';
import { seedRegionGeometryCache, useRegionGeometry } from '../../../hooks/use-region-geometry';
import { isWriteBlocked } from '../../../lib/write-access';
import { settleWrite } from '../../../sync/settle-write';
import { webCollections } from '../../../sync/webCollections';
import {
	type DrawGeometry,
	noRegionFolderValue,
	RegionFormPage,
	type RegionFormValues,
} from './-region-form';

export const Route = createFileRoute('/gis/regions/$id_/edit')({
	beforeLoad: async ({ context, params }) => {
		if (await isWriteBlocked(context)) {
			throw redirect({ params: { id: params.id }, replace: true, to: '/gis/regions/$id' });
		}
	},
	component: EditRegionRoute,
});

const regionGcTimeMs = 30_000;

function EditRegionRoute() {
	const { id } = Route.useParams();
	const { auth } = Route.useRouteContext();
	const { organization } = useOrganizationWorkspace(auth.snapshot);
	const { rows: regionFolders } = useCollectionRows<RegionFolderRow>(webCollections.regionFolders);

	// regions is an on-demand collection; status-gated useLiveQuery (not the
	// suspense variant) to avoid the post-unmount hang on on-demand collections.
	const regionResult = useLiveQuery(
		{
			gcTime: regionGcTimeMs,
			query: (query) =>
				query
					.from({ region: webCollections.regions })
					.where(({ region }) => eq(region.id, id))
					.findOne(),
		},
		[id],
	);
	const region = regionResult.data as RegionRow | undefined;
	const geometryQuery = useRegionGeometry(id);

	if (regionResult.isError) {
		return <EditUnavailable description="This region could not be loaded." />;
	}
	if (!regionResult.isReady || geometryQuery.isLoading) {
		return <EditFormSkeleton />;
	}
	if (region === undefined) {
		return (
			<EditUnavailable description="This region could not be found, or you do not have access to it." />
		);
	}

	const actorProfileId =
		auth.snapshot?.authenticated === true ? auth.snapshot.localIdentity.profileId : null;
	const initialGeometry = (geometryQuery.data?.geojson ?? null) as DrawGeometry | null;

	return (
		<EditRegionLoader
			actorProfileId={actorProfileId}
			canSubmit={organization !== null && actorProfileId !== null}
			initialGeometry={initialGeometry}
			region={region}
			regionFolders={regionFolders}
		/>
	);
}

function EditRegionLoader({
	region,
	regionFolders,
	initialGeometry,
	actorProfileId,
	canSubmit,
}: {
	readonly region: RegionRow;
	readonly regionFolders: readonly RegionFolderRow[];
	readonly initialGeometry: DrawGeometry | null;
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
		}: {
			readonly values: RegionFormValues;
			readonly geometry: DrawGeometry | null;
			readonly geometryChanged: boolean;
		}) => {
			const geometryToSend = geometryChanged && geometry !== null ? geometry : undefined;
			const now = new Date().toISOString();
			const applyEdits = (draft: RegionRow) => {
				const writable = draft as { -readonly [K in keyof RegionRow]: RegionRow[K] };
				writable.name = values.name.trim();
				writable.description = nullableText(values.description);
				writable.regionFolderId =
					values.regionFolderId === noRegionFolderValue ? null : values.regionFolderId;
				writable.metadata = values.metadata ?? null;
				if (actorProfileId !== null) {
					writable.updatedByProfileId = actorProfileId;
				}
				writable.updatedAt = now;
			};

			const transaction =
				geometryToSend === undefined
					? webCollections.regions.update(region.id, applyEdits)
					: webCollections.regions.update(
							region.id,
							{ metadata: { geometry: geometryToSend } },
							applyEdits,
						);
			await settleWrite(transaction);
			if (geometryToSend !== undefined) {
				seedRegionGeometryCache(
					queryClient,
					region.id,
					geometryToSend as unknown as GeoJsonGeometry,
				);
			}
			await navigate({ to: '/gis/regions/$id', params: { id: region.id } });
		},
		[region, actorProfileId, navigate, queryClient],
	);

	return (
		<RegionFormPage
			canSubmit={canSubmit}
			defaultValues={defaultsFromRegion(region)}
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

function defaultsFromRegion(region: RegionRow): RegionFormValues {
	return {
		name: region.name,
		regionFolderId: region.regionFolderId ?? noRegionFolderValue,
		description: region.description ?? '',
		metadata: (region.metadata ?? null) as RegionFormValues['metadata'],
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
				<Skeleton className="h-9 w-full" />
				<div className="grid grid-cols-2 gap-4">
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
					<EmptyTitle>Region Unavailable</EmptyTitle>
					<EmptyDescription>{description}</EmptyDescription>
				</EmptyHeader>
			</Empty>
		</div>
	);
}
