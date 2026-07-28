import type {
	ControlMethodRow,
	ProfileRow,
	SourceReductionRow,
	UnitRow,
} from '@simmer-mosquito/sync';
import { Button } from '@simmer-mosquito/ui-web/components/ui/button';
import {
	Card,
	CardContent,
	CardDescription,
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
import type { Map as MapboxMap } from 'mapbox-gl';
import { type ReactNode, useCallback, useMemo } from 'react';
import { useBreadcrumbLabel } from '../../../components/app-shell';
import { CommentsSection } from '../../../components/comments-section';
import { CustomFieldsCard } from '../../../components/custom-fields-card';
import { MapCanvas } from '../../../components/map';
import { customSchemaFor } from '../../../forms/field-components';
import { useCollectionRows } from '../../../hooks/use-collection-rows';
import { webCollections } from '../../../sync/webCollections';
import { ContextBadge, formatActionDate, formatAmount } from '../-control-display';
import { useHabitatNames } from '../-overview-data';

export const Route = createFileRoute('/control-operations/source-reduction/$id')({
	component: RouteComponent,
});

const SourceReductionIcon = iconRegistry.entities.sourceReductionAction.icon;
const EditIcon = iconRegistry.actions.edit.icon;

const sourceReductionGcTimeMs = 30_000;

function RouteComponent() {
	const { id } = Route.useParams();
	return <SourceReductionDetail sourceReductionId={id} />;
}

function SourceReductionDetail({ sourceReductionId }: { readonly sourceReductionId: string }) {
	// sourceReductions is on-demand; status-gated useLiveQuery (not suspense) avoids
	// the post-unmount hang.
	const result = useLiveQuery(
		{
			gcTime: sourceReductionGcTimeMs,
			query: (query) =>
				query
					.from({ sourceReduction: webCollections.sourceReductions })
					.where(({ sourceReduction }) => eq(sourceReduction.id, sourceReductionId))
					.findOne(),
		},
		[sourceReductionId],
	);
	const sourceReduction = result.data as SourceReductionRow | undefined;

	return (
		<div className="h-full min-h-0 overflow-y-auto">
			<div className="mx-auto grid w-full max-w-[1200px] content-start gap-5 px-4 py-6 pb-10 md:px-8">
				<Link
					className="inline-flex w-fit items-center gap-1.5 text-muted-foreground text-sm hover:text-foreground"
					to="/control-operations/source-reduction"
				>
					<ArrowLeftIcon aria-hidden="true" />
					Back to source reduction
				</Link>
				{!result.isReady ? (
					<SourceReductionDetailSkeleton />
				) : sourceReduction === undefined ? (
					<SourceReductionUnavailable />
				) : (
					<SourceReductionDetailContent sourceReduction={sourceReduction} />
				)}
			</div>
		</div>
	);
}

function SourceReductionDetailContent({
	sourceReduction,
}: {
	readonly sourceReduction: SourceReductionRow;
}) {
	const { rows: methods } = useCollectionRows<ControlMethodRow>(
		webCollections.sourceReductionMethods,
	);
	const { rows: units } = useCollectionRows<UnitRow>(webCollections.units);
	const { rows: profiles } = useCollectionRows<ProfileRow>(webCollections.profiles);
	// habitats is on-demand; resolve just the linked habitat's name as a subset.
	const habitatIds = useMemo(
		() => (sourceReduction.habitatId === null ? [] : [sourceReduction.habitatId]),
		[sourceReduction.habitatId],
	);
	const habitatNameById = useHabitatNames(habitatIds);

	const methodName =
		methods.find((method) => method.id === sourceReduction.sourceReductionMethodId)?.name ??
		'Unknown method';
	const unit = units.find((row) => row.id === sourceReduction.sourcesEliminatedUnitId);
	const amountLabel = formatAmount(sourceReduction.sourcesEliminatedAmount, unit);
	const technicianName =
		sourceReduction.technicianProfileId === null
			? null
			: (profiles.find((profile) => profile.id === sourceReduction.technicianProfileId)
					?.displayName ?? 'Unknown technician');
	const habitatId = sourceReduction.habitatId;
	const habitatName = habitatId === null ? null : (habitatNameById.get(habitatId) ?? null);

	useBreadcrumbLabel(sourceReduction.id, methodName);

	return (
		<>
			<div className="flex flex-wrap items-start justify-between gap-3">
				<div className="grid gap-1.5">
					<span className="inline-flex items-center gap-1.5 font-medium text-muted-foreground text-xs uppercase tracking-wide">
						<SourceReductionIcon aria-hidden="true" className="size-3.5" />
						Source reduction
					</span>
					<h1 className="m-0 font-semibold text-[1.5rem] text-foreground leading-tight">
						{methodName}
					</h1>
					<p className="m-0 text-[0.95rem] text-muted-foreground">
						{amountLabel} eliminated · {formatActionDate(sourceReduction.sourceReductionDate)}
					</p>
				</div>
				<div className="flex items-center gap-2">
					<ContextBadge
						habitatId={sourceReduction.habitatId}
						inspectionId={sourceReduction.inspectionId}
					/>
					<Button asChild size="sm" variant="outline">
						<Link
							params={{ id: sourceReduction.id }}
							to="/control-operations/source-reduction/$id/edit"
						>
							<EditIcon aria-hidden="true" />
							Edit
						</Link>
					</Button>
				</div>
			</div>

			<div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_22rem]">
				<div className="grid min-w-0 content-start gap-5">
					<SourceReductionLocationCard
						point={{ lat: sourceReduction.lat, lng: sourceReduction.lng }}
					/>
				</div>
				<div className="grid content-start gap-5 xl:sticky xl:top-0 xl:self-start">
					<SourceReductionDetailsCard
						amountLabel={amountLabel}
						habitatId={habitatId}
						habitatName={habitatName}
						methodName={methodName}
						sourceReduction={sourceReduction}
						technicianName={technicianName}
					/>
					<CustomFieldsCard
						metadata={sourceReduction.metadata}
						schema={customSchemaFor(methods, sourceReduction.sourceReductionMethodId)}
					/>
					<CommentsSection
						description="Follow-up, access notes, and anything crews should know about this work."
						target={{ type: 'sourceReduction', id: sourceReduction.id }}
					/>
				</div>
			</div>
		</>
	);
}

function SourceReductionLocationCard({
	point,
}: {
	readonly point: { readonly lat: number; readonly lng: number };
}) {
	const handleMapReady = useCallback(
		(map: MapboxMap) => {
			map.setCenter([point.lng, point.lat]);
			map.setZoom(15);
		},
		[point],
	);

	const geoJson = {
		type: 'Feature',
		properties: {},
		geometry: { type: 'Point', coordinates: [point.lng, point.lat] },
	} as GeoJSON.Feature;

	return (
		<Card className="overflow-hidden" variant="surface">
			<CardHeader className="px-4 py-4">
				<CardTitle>Location</CardTitle>
				<CardDescription>{`${point.lat.toFixed(5)}, ${point.lng.toFixed(5)}`}</CardDescription>
			</CardHeader>
			<CardContent padding="compact">
				<div className="h-[280px] overflow-hidden rounded-md border border-border/40">
					<MapCanvas
						controls={{ search: false, layers: false, geolocate: false }}
						geoJson={geoJson}
						onMapReady={handleMapReady}
					/>
				</div>
			</CardContent>
		</Card>
	);
}

function SourceReductionDetailsCard({
	sourceReduction,
	methodName,
	amountLabel,
	technicianName,
	habitatId,
	habitatName,
}: {
	readonly sourceReduction: SourceReductionRow;
	readonly methodName: string;
	readonly amountLabel: string;
	readonly technicianName: string | null;
	readonly habitatId: string | null;
	readonly habitatName: string | null;
}) {
	return (
		<Card variant="surface">
			<CardHeader className="px-4 py-4">
				<CardTitle>Details</CardTitle>
			</CardHeader>
			<CardContent className="grid gap-4" padding="compact">
				<dl className="grid gap-2.5">
					<DetailRow label="Method">{methodName}</DetailRow>
					<DetailRow label="Eliminated">{amountLabel}</DetailRow>
					<DetailRow label="Date">
						{formatActionDate(sourceReduction.sourceReductionDate)}
					</DetailRow>
					<DetailRow label="Technician">
						{technicianName ?? <span className="text-muted-foreground">Unassigned</span>}
					</DetailRow>
					<DetailRow label="Habitat">
						{habitatId === null ? (
							<span className="text-muted-foreground">No habitat linked</span>
						) : (
							<Link
								className="rounded-sm text-foreground hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
								params={{ id: habitatId }}
								to="/larval-surveillance/habitats/$id"
							>
								{habitatName ?? `Habitat ${habitatId.slice(0, 8)}`}
							</Link>
						)}
					</DetailRow>
				</dl>
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

function SourceReductionDetailSkeleton() {
	return (
		<>
			<div className="grid gap-2">
				<Skeleton className="h-4 w-20" />
				<Skeleton className="h-8 w-64" />
			</div>
			<div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_22rem]">
				<div className="grid content-start gap-5">
					<Skeleton className="h-[360px]" />
				</div>
				<Skeleton className="h-72" />
			</div>
		</>
	);
}

function SourceReductionUnavailable() {
	return (
		<Empty className="min-h-[280px] border border-border/40 bg-muted/30">
			<EmptyHeader>
				<EmptyTitle>Source Reduction Unavailable</EmptyTitle>
				<EmptyDescription>
					This source reduction action could not be found, or you do not have access to it.
				</EmptyDescription>
			</EmptyHeader>
		</Empty>
	);
}
