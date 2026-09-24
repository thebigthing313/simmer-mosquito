import type { GeoJsonGeometry } from '@simmer-mosquito/mapping';
import { DetailList, DetailRow } from '@simmer-mosquito/ui-web/components/detail-row';
import {
	Card,
	CardContent,
	CardHeader,
	CardTitle,
} from '@simmer-mosquito/ui-web/components/ui/card';
import { iconRegistry } from '@simmer-mosquito/ui-web/icons/registry';
import { createFileRoute } from '@tanstack/react-router';
import { useBreadcrumbLabel } from '../../../components/app-shell';
import { RecordLocationCard } from '../../../components/map/record-location-card';
import { RecordRegionsBand } from '../../../components/map/record-regions-band';
import {
	DetailPageShell,
	type RecordDetailLayout,
	RecordDetailPage,
} from '../../../components/record';
import { useRegionMutations } from '../../../hooks/mutations/use-region-mutations';
import type { Region } from '../../../hooks/queries/region-view';
import { useRegion } from '../../../hooks/queries/use-region';
import { useRegionGeometry } from '../../../hooks/use-region-geometry';

export const Route = createFileRoute('/gis/regions/$id')({
	component: RouteComponent,
});

const RegionIcon = iconRegistry.entities.region.icon;

const layout: RecordDetailLayout = {
	mainGap: 'tight',
	skeleton: { main: [['h-[420px]', 'h-48'], 'h-40'] },
};

function RouteComponent() {
	const { id } = Route.useParams();
	// The joined hook rather than `useRegionRecord`: this page names the folder,
	// and the form is the one that needs its id.
	const { region, isReady, isError } = useRegion(id);

	return (
		<RecordDetailPage
			layout={layout}
			reading={{ isError, isReady, record: region }}
			recordType="region"
		>
			{(record) => <RegionDetailContent region={record} />}
		</RecordDetailPage>
	);
}

function RegionDetailContent({ region }: { readonly region: Region }) {
	useBreadcrumbLabel(region.id, region.name);
	const mutations = useRegionMutations();
	const folderName = region.folderName;

	const geometryQuery = useRegionGeometry(region.id);

	return (
		<DetailPageShell
			facts={<RegionDetailsCard description={region.description} folderName={folderName} />}
			header={{
				edit: { minimum: 'manager', params: { id: region.id }, to: '/gis/regions/$id/edit' },
				icon: RegionIcon,
				recordType: 'region',
				remove: {
					name: region.name,
					onDelete: () => mutations.remove(region.id),
					recordId: region.id,
					returnTo: '/gis/regions',
				},
				subtitle: folderName ?? 'Unfiled',
				tags: { recordId: region.id, recordType: 'region' },
				title: region.name,
			}}
			layout={layout}
			lead={
				<RegionBoundaryCard
					geojson={geometryQuery.data?.geojson ?? null}
					isLoading={geometryQuery.isLoading}
					unsupportedShape={geometryQuery.data?.unsupportedShape ?? null}
				/>
			}
		>
			<RecordRegionsBand recordId={region.id} recordType="regions" />
		</DetailPageShell>
	);
}

function RegionBoundaryCard({
	geojson,
	isLoading,
	unsupportedShape,
}: {
	readonly geojson: GeoJsonGeometry | null;
	readonly isLoading: boolean;
	readonly unsupportedShape: string | null;
}) {
	return (
		<RecordLocationCard
			emptyDescription="This region has no boundary to display."
			emptyTitle="No Boundary Recorded"
			geojson={geojson}
			geomType={geojson?.type ?? null}
			height="h-[360px]"
			isPending={isLoading}
			title="Boundary"
			unsupportedShape={unsupportedShape}
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
			<CardHeader padding="compact">
				<CardTitle>Details</CardTitle>
			</CardHeader>
			<CardContent className="grid gap-4" padding="compact">
				<DetailList>
					<DetailRow label="Folder">{folderName}</DetailRow>
				</DetailList>
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
