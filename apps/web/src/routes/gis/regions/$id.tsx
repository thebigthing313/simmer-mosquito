import type { GeoJsonGeometry } from '@simmer-mosquito/mapping';
import type { RegionFolderRow, RegionRow } from '@simmer-mosquito/sync';
import { pageContainer } from '@simmer-mosquito/ui-web/components/page-container';
import { Button } from '@simmer-mosquito/ui-web/components/ui/button';
import {
	Card,
	CardContent,
	CardHeader,
	CardTitle,
} from '@simmer-mosquito/ui-web/components/ui/card';
import {
	Empty,
	EmptyDescription,
	EmptyHeader,
	EmptyTitle,
} from '@simmer-mosquito/ui-web/components/ui/empty';
import { Skeleton } from '@simmer-mosquito/ui-web/components/ui/skeleton';
import { ArrowLeftIcon, iconRegistry } from '@simmer-mosquito/ui-web/icons/registry';
import { eq, useLiveQuery } from '@tanstack/react-db';
import { createFileRoute, Link } from '@tanstack/react-router';
import type { ReactNode } from 'react';
import { useBreadcrumbLabel } from '../../../components/app-shell';
import { DangerZoneCard } from '../../../components/danger-zone-card';
import { RecordLocationCard } from '../../../components/map/record-location-card';
import { WriteOnly } from '../../../components/write-only';
import { useCollectionRows } from '../../../hooks/use-collection-rows';
import { useRegionGeometry } from '../../../hooks/use-region-geometry';
import { webCollections } from '../../../sync/webCollections';

export const Route = createFileRoute('/gis/regions/$id')({
	component: RouteComponent,
});

const RegionIcon = iconRegistry.entities.region.icon;
const EditIcon = iconRegistry.actions.edit.icon;

const regionGcTimeMs = 30_000;

function RouteComponent() {
	const { id } = Route.useParams();
	return <RegionDetail regionId={id} />;
}

function RegionDetail({ regionId }: { readonly regionId: string }) {
	// regions is on-demand; status-gated useLiveQuery (not the suspense variant)
	// to avoid the post-unmount hang on on-demand collections.
	const result = useLiveQuery(
		{
			gcTime: regionGcTimeMs,
			query: (query) =>
				query
					.from({ region: webCollections.regions })
					.where(({ region }) => eq(region.id, regionId))
					.findOne(),
		},
		[regionId],
	);
	const region = result.data as RegionRow | undefined;

	return (
		<div className="h-full min-h-0 overflow-y-auto">
			<div className={pageContainer({ gap: 'detail', padding: 'detail' })}>
				<Link
					className="inline-flex w-fit items-center gap-1.5 text-muted-foreground text-sm hover:text-foreground"
					to="/gis/regions"
				>
					<ArrowLeftIcon aria-hidden="true" />
					Back to Regions
				</Link>
				{!result.isReady ? (
					<RegionDetailSkeleton />
				) : region === undefined ? (
					<RegionUnavailable />
				) : (
					<RegionDetailContent region={region} />
				)}
			</div>
		</div>
	);
}

function RegionDetailContent({ region }: { readonly region: RegionRow }) {
	useBreadcrumbLabel(region.id, region.name);
	const { rows: folders } = useCollectionRows<RegionFolderRow>(webCollections.regionFolders);
	const folderName =
		region.regionFolderId === null
			? null
			: (folders.find((folder) => folder.id === region.regionFolderId)?.name ?? 'Unknown folder');

	const geometryQuery = useRegionGeometry(region.id);

	return (
		<>
			<div className="flex flex-wrap items-start justify-between gap-3">
				<div className="grid gap-1.5">
					<span className="inline-flex items-center gap-1.5 font-medium text-muted-foreground text-xs uppercase tracking-wide">
						<RegionIcon aria-hidden="true" className="size-3.5" />
						Region
					</span>
					<h1 className="m-0 font-semibold text-[1.5rem] text-foreground leading-tight">
						{region.name}
					</h1>
					<p className="m-0 text-[0.95rem] text-muted-foreground">{folderName ?? 'Unfiled'}</p>
				</div>
				<WriteOnly minimum="manager">
					<Button asChild size="sm" variant="outline">
						<Link params={{ id: region.id }} to="/gis/regions/$id/edit">
							<EditIcon aria-hidden="true" />
							Edit
						</Link>
					</Button>
				</WriteOnly>
			</div>

			<div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_22rem]">
				<RegionBoundaryCard
					geojson={geometryQuery.data?.geojson ?? null}
					isLoading={geometryQuery.isLoading}
				/>
				<div className="grid content-start gap-5">
					<RegionDetailsCard description={region.description} folderName={folderName} />
					<DangerZoneCard
						name={region.name}
						noun="region"
						onDelete={() => webCollections.regions.delete(region.id)}
						recordId={region.id}
						recordType="region"
						returnTo="/gis/regions"
					/>
				</div>
			</div>
		</>
	);
}

function RegionBoundaryCard({
	geojson,
	isLoading,
}: {
	readonly geojson: GeoJsonGeometry | null;
	readonly isLoading: boolean;
}) {
	return (
		<RecordLocationCard
			description="The region's mapped area."
			emptyDescription="This region has no boundary to display."
			emptyTitle="No Boundary Recorded"
			geojson={geojson}
			geomType={geojson?.type ?? null}
			height="h-[360px]"
			isPending={isLoading}
			title="Boundary"
		/>
	);
}

function RegionDetailsCard({
	description,
	folderName,
}: {
	readonly description: string | null;
	readonly folderName: string | null;
}) {
	return (
		<Card variant="surface">
			<CardHeader className="px-4 py-4">
				<CardTitle>Details</CardTitle>
			</CardHeader>
			<CardContent className="grid gap-4" padding="compact">
				<dl className="grid gap-2.5">
					<DetailRow label="Folder">
						{folderName ?? <span className="text-muted-foreground">Unfiled</span>}
					</DetailRow>
				</dl>
				{description !== null && description.trim().length > 0 ? (
					<div className="grid gap-1">
						<span className="font-semibold text-muted-foreground text-xs uppercase">
							Description
						</span>
						<p className="m-0 text-foreground text-sm">{description}</p>
					</div>
				) : null}
			</CardContent>
		</Card>
	);
}

function DetailRow({ label, children }: { readonly label: string; readonly children: ReactNode }) {
	return (
		<div className="grid grid-cols-[90px_1fr] items-baseline gap-3 text-sm">
			<dt className="truncate text-muted-foreground">{label}</dt>
			<dd className="m-0 min-w-0 text-foreground">{children}</dd>
		</div>
	);
}

function RegionDetailSkeleton() {
	return (
		<>
			<div className="grid gap-2">
				<Skeleton className="h-4 w-20" />
				<Skeleton className="h-8 w-64" />
			</div>
			<div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_22rem]">
				<Skeleton className="h-[420px]" />
				<Skeleton className="h-48" />
			</div>
		</>
	);
}

function RegionUnavailable() {
	return (
		<Empty className="min-h-[280px] border border-border/40 bg-muted/30">
			<EmptyHeader>
				<EmptyTitle>Region Unavailable</EmptyTitle>
				<EmptyDescription>
					This region could not be found, or you do not have access to it.
				</EmptyDescription>
			</EmptyHeader>
		</Empty>
	);
}
