import type {
	BiocontrolActionRow,
	ControlMethodRow,
	ProfileRow,
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
import { MapCanvas } from '../../../components/map';
import { useCollectionRows } from '../../../hooks/use-collection-rows';
import { webCollections } from '../../../sync/webCollections';
import { ContextBadge, formatActionDate, formatAmount, nameById } from '../-control-display';
import { useHabitatNames } from '../-overview-data';

const BiocontrolIcon = iconRegistry.entities.biocontrolAction.icon;
const EditIcon = iconRegistry.actions.edit.icon;

const biocontrolGcTimeMs = 30_000;

export const Route = createFileRoute('/control-operations/biocontrol/$id')({
	component: RouteComponent,
});

function RouteComponent() {
	const { id } = Route.useParams();
	return <BiocontrolDetail actionId={id} />;
}

function BiocontrolDetail({ actionId }: { readonly actionId: string }) {
	// biocontrolActions is on-demand; status-gated useLiveQuery (not the suspense
	// variant) avoids the post-unmount hang.
	const result = useLiveQuery(
		{
			gcTime: biocontrolGcTimeMs,
			query: (query) =>
				query
					.from({ action: webCollections.biocontrolActions })
					.where(({ action }) => eq(action.id, actionId))
					.findOne(),
		},
		[actionId],
	);
	const action = result.data as BiocontrolActionRow | undefined;

	return (
		<div className="h-full min-h-0 overflow-y-auto">
			<div className="mx-auto grid w-full max-w-[1200px] content-start gap-5 px-4 py-6 pb-10 md:px-8">
				<Link
					className="inline-flex w-fit items-center gap-1.5 text-muted-foreground text-sm hover:text-foreground"
					to="/control-operations/biocontrol"
				>
					<ArrowLeftIcon aria-hidden="true" />
					Back to biocontrol
				</Link>
				{result.isError ? (
					<BiocontrolUnavailable description="This biocontrol action could not be loaded. Try again shortly." />
				) : !result.isReady ? (
					<BiocontrolDetailSkeleton />
				) : action === undefined ? (
					<BiocontrolUnavailable description="This biocontrol action could not be found, or you do not have access to it." />
				) : (
					<BiocontrolDetailContent action={action} />
				)}
			</div>
		</div>
	);
}

function BiocontrolDetailContent({ action }: { readonly action: BiocontrolActionRow }) {
	const { rows: methods } = useCollectionRows<ControlMethodRow>(webCollections.biocontrolMethods);
	const { rows: units } = useCollectionRows<UnitRow>(webCollections.units);
	const { rows: profiles } = useCollectionRows<ProfileRow>(webCollections.profiles);
	// habitats is on-demand; resolve just the linked habitat's name as a subset.
	const habitatIds = useMemo(
		() => (action.habitatId === null ? [] : [action.habitatId]),
		[action.habitatId],
	);
	const habitatNameById = useHabitatNames(habitatIds);

	const methodName =
		methods.find((method) => method.id === action.biocontrolMethodId)?.name ?? 'Unknown method';
	const releaseUnit = units.find((unit) => unit.id === action.releaseUnitId);
	const technicianNameById = useMemo(
		() => nameById(profiles, (profile) => profile.displayName),
		[profiles],
	);

	const technicianName =
		action.technicianProfileId === null
			? null
			: (technicianNameById.get(action.technicianProfileId) ?? 'Unknown technician');
	const habitatName =
		action.habitatId === null ? null : (habitatNameById.get(action.habitatId) ?? 'Unknown habitat');

	useBreadcrumbLabel(action.id, `${methodName} · ${formatActionDate(action.biocontrolDate)}`);

	return (
		<>
			<div className="flex flex-wrap items-start justify-between gap-3">
				<div className="grid gap-1.5">
					<span className="inline-flex items-center gap-1.5 font-medium text-muted-foreground text-xs uppercase tracking-wide">
						<BiocontrolIcon aria-hidden="true" className="size-3.5" />
						Biocontrol
					</span>
					<h1 className="m-0 font-semibold text-[1.5rem] text-foreground leading-tight">
						{methodName}
					</h1>
					<p className="m-0 text-[0.95rem] text-muted-foreground">
						{formatAmount(action.amountReleased, releaseUnit)} released on{' '}
						{formatActionDate(action.biocontrolDate)}
					</p>
				</div>
				<div className="flex items-center gap-2">
					<ContextBadge habitatId={action.habitatId} inspectionId={action.inspectionId} />
					<Button asChild size="sm" variant="outline">
						<Link params={{ id: action.id }} to="/control-operations/biocontrol/$id/edit">
							<EditIcon aria-hidden="true" />
							Edit
						</Link>
					</Button>
				</div>
			</div>

			<div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_22rem]">
				<div className="grid min-w-0 content-start gap-5">
					<ReleaseLocationCard point={{ lat: action.lat, lng: action.lng }} />
				</div>
				<div className="grid content-start gap-5 xl:sticky xl:top-0 xl:self-start">
					<BiocontrolDetailsCard
						action={action}
						habitatName={habitatName}
						methodName={methodName}
						releaseUnit={releaseUnit}
						technicianName={technicianName}
					/>
					<CommentsSection
						description="Follow-up, agent survival, and restocking notes for this release."
						target={{ type: 'biocontrolAction', id: action.id }}
					/>
				</div>
			</div>
		</>
	);
}

function ReleaseLocationCard({
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

function BiocontrolDetailsCard({
	action,
	methodName,
	releaseUnit,
	technicianName,
	habitatName,
}: {
	readonly action: BiocontrolActionRow;
	readonly methodName: string;
	readonly releaseUnit: UnitRow | undefined;
	readonly technicianName: string | null;
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
					<DetailRow label="Released">{formatAmount(action.amountReleased, releaseUnit)}</DetailRow>
					<DetailRow label="Date">{formatActionDate(action.biocontrolDate)}</DetailRow>
					<DetailRow label="Technician">
						{technicianName ?? <span className="text-muted-foreground">Unassigned</span>}
					</DetailRow>
					<DetailRow label="Habitat">
						{action.habitatId === null || habitatName === null ? (
							<span className="text-muted-foreground">No habitat</span>
						) : (
							<Link
								className="rounded-sm text-foreground hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
								params={{ id: action.habitatId }}
								to="/larval-surveillance/habitats/$id"
							>
								{habitatName}
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

function BiocontrolDetailSkeleton() {
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

function BiocontrolUnavailable({ description }: { readonly description: string }) {
	return (
		<Empty className="min-h-[280px] border border-border/40 bg-muted/30">
			<EmptyHeader>
				<EmptyTitle>Biocontrol action unavailable</EmptyTitle>
				<EmptyDescription>{description}</EmptyDescription>
			</EmptyHeader>
		</Empty>
	);
}
