import type { GeoJsonGeometry } from '@simmer-mosquito/mapping';
import { backLink } from '@simmer-mosquito/ui-web/components/back-link';
import { pageContainer } from '@simmer-mosquito/ui-web/components/page-container';
import { Button } from '@simmer-mosquito/ui-web/components/ui/button';
import {
	Card,
	CardContent,
	CardHeader,
	CardTitle,
} from '@simmer-mosquito/ui-web/components/ui/card';
import { Skeleton } from '@simmer-mosquito/ui-web/components/ui/skeleton';
import { ArrowLeftIcon, iconRegistry } from '@simmer-mosquito/ui-web/icons/registry';
import { createFileRoute, Link } from '@tanstack/react-router';
import type { ReactNode } from 'react';
import { useBreadcrumbLabel } from '../../../components/app-shell';
import { DangerZoneCard } from '../../../components/danger-zone-card';
import { RecordLocationCard } from '../../../components/map/record-location-card';
import { RecordRegionsBand } from '../../../components/map/record-regions-band';
import { RecordUnavailable } from '../../../components/record';
import { WriteOnly } from '../../../components/write-only';
import { useRegionMutations } from '../../../hooks/mutations/use-region-mutations';
import type { Region } from '../../../hooks/queries/region-view';
import { useRegion } from '../../../hooks/queries/use-region';
import { useRegionGeometry } from '../../../hooks/use-region-geometry';

export const Route = createFileRoute('/gis/regions/$id')({
	component: RouteComponent,
});

const RegionIcon = iconRegistry.entities.region.icon;
const EditIcon = iconRegistry.actions.edit.icon;

function RouteComponent() {
	const { id } = Route.useParams();
	return <RegionDetail regionId={id} />;
}

function RegionDetail({ regionId }: { readonly regionId: string }) {
	// The joined hook rather than `useRegionRecord`: this page names the folder,
	// and the form is the one that needs its id.
	const { region, isReady } = useRegion(regionId);

	return (
		<div className="h-full min-h-0 overflow-y-auto">
			<div className={pageContainer({ gap: 'detail', padding: 'detail' })}>
				<Link className={backLink()} to="/gis/regions">
					<ArrowLeftIcon aria-hidden="true" />
					Back to Regions
				</Link>
				{!isReady ? (
					<RegionDetailSkeleton />
				) : region === undefined ? (
					<RecordUnavailable noun="region" reason="not-found" />
				) : (
					<RegionDetailContent region={region} />
				)}
			</div>
		</div>
	);
}

function RegionDetailContent({ region }: { readonly region: Region }) {
	useBreadcrumbLabel(region.id, region.name);
	const mutations = useRegionMutations();
	const folderName = region.folderName;

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
				<div className="grid content-start gap-3">
					<RegionBoundaryCard
						geojson={geometryQuery.data?.geojson ?? null}
						isLoading={geometryQuery.isLoading}
					/>
					<RecordRegionsBand noun="region" recordId={region.id} recordType="regions" />
				</div>
				<div className="grid content-start gap-5">
					<RegionDetailsCard description={region.description} folderName={folderName} />
					<DangerZoneCard
						name={region.name}
						noun="region"
						onDelete={() => mutations.remove(region.id)}
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
