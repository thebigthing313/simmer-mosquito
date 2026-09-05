import type { GeoJsonGeometry } from '@simmer-mosquito/mapping';
import { DetailList, DetailRow } from '@simmer-mosquito/ui-web/components/detail-row';
import { Button } from '@simmer-mosquito/ui-web/components/ui/button';
import {
	Card,
	CardContent,
	CardHeader,
	CardTitle,
} from '@simmer-mosquito/ui-web/components/ui/card';
import { iconRegistry } from '@simmer-mosquito/ui-web/icons/registry';
import { createFileRoute, Link } from '@tanstack/react-router';
import { useBreadcrumbLabel } from '../../../components/app-shell';
import { DangerZoneCard } from '../../../components/danger-zone-card';
import { RecordLocationCard } from '../../../components/map/record-location-card';
import { RecordRegionsBand } from '../../../components/map/record-regions-band';
import {
	RecordDetailColumns,
	RecordDetailHeader,
	type RecordDetailLayout,
	RecordDetailPage,
} from '../../../components/record';
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

const layout: RecordDetailLayout = {
	aside: 'wide',
	mainGap: 'tight',
	skeleton: { eyebrow: 'w-20', main: ['h-[420px]'], aside: ['h-48'] },
};

function RouteComponent() {
	const { id } = Route.useParams();
	// The joined hook rather than `useRegionRecord`: this page names the folder,
	// and the form is the one that needs its id.
	const { region, isReady } = useRegion(id);

	return (
		<RecordDetailPage
			back={{ label: 'Back to Regions', to: '/gis/regions' }}
			layout={layout}
			noun="region"
			reading={{ isReady, record: region }}
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
		<RecordDetailColumns
			aside={
				<>
					<RegionDetailsCard description={region.description} folderName={folderName} />
					<DangerZoneCard
						name={region.name}
						noun="region"
						onDelete={() => mutations.remove(region.id)}
						recordId={region.id}
						recordType="region"
						returnTo="/gis/regions"
					/>
				</>
			}
			header={
				<RecordDetailHeader
					actions={
						<WriteOnly minimum="manager">
							<Button asChild size="sm" variant="outline">
								<Link params={{ id: region.id }} to="/gis/regions/$id/edit">
									<EditIcon aria-hidden="true" />
									Edit
								</Link>
							</Button>
						</WriteOnly>
					}
					eyebrow="Region"
					icon={RegionIcon}
					subtitle={folderName ?? 'Unfiled'}
					title={region.name}
				/>
			}
			layout={layout}
		>
			<RegionBoundaryCard
				geojson={geometryQuery.data?.geojson ?? null}
				isLoading={geometryQuery.isLoading}
			/>
			<RecordRegionsBand noun="region" recordId={region.id} recordType="regions" />
		</RecordDetailColumns>
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
				<DetailList>
					<DetailRow empty="Unfiled" label="Folder">
						{folderName}
					</DetailRow>
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
