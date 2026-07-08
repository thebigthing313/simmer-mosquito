import type { CollectionLureRow, CollectionMethodRow, TrapRow } from '@simmer-mosquito/sync';
import { Badge } from '@simmer-mosquito/ui-web/components/ui/badge';
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
	EmptyMedia,
	EmptyTitle,
} from '@simmer-mosquito/ui-web/components/ui/empty';
import { Skeleton } from '@simmer-mosquito/ui-web/components/ui/skeleton';
import {
	ArrowLeftIcon,
	CheckCircle2Icon,
	CircleIcon,
	iconRegistry,
} from '@simmer-mosquito/ui-web/icons/registry';
import { eq, toArray, useLiveQuery } from '@tanstack/react-db';
import { createFileRoute, Link } from '@tanstack/react-router';
import type { Map as MapboxMap } from 'mapbox-gl';
import { type ReactNode, useCallback } from 'react';
import { useBreadcrumbLabel } from '../../../components/app-shell';
import { CommentsSection } from '../../../components/comments-section';
import { MapCanvas } from '../../../components/map';
import { useCollectionRows } from '../../../hooks/use-collection-rows';
import { webCollections } from '../../../sync/webCollections';
import { CollectionFlagBadges, trapDisplayName } from '../-adult-display';
import { formatMonthDay, useAddressNames } from '../-overview-data';

export const Route = createFileRoute('/adult-surveillance/traps/$id')({
	component: RouteComponent,
});

const TrapIcon = iconRegistry.entities.trap.icon;
const CollectionIcon = iconRegistry.entities.collection.icon;
const EditIcon = iconRegistry.actions.edit.icon;

const collectionsGcTimeMs = 30_000;

function RouteComponent() {
	const { id } = Route.useParams();
	return <TrapDetail trapId={id} />;
}

function TrapDetail({ trapId }: { readonly trapId: string }) {
	// traps is an eager collection, so this resolves without a fetch.
	const result = useLiveQuery(
		(query) =>
			query
				.from({ trap: webCollections.traps })
				.where(({ trap }) => eq(trap.id, trapId))
				.findOne(),
		[trapId],
	);
	const trap = result.data as TrapRow | undefined;

	return (
		<div className="h-full min-h-0 overflow-y-auto">
			<div className="mx-auto grid w-full max-w-[1200px] content-start gap-5 px-4 py-6 pb-10 md:px-8">
				<Link
					className="inline-flex w-fit items-center gap-1.5 text-muted-foreground text-sm hover:text-foreground"
					to="/adult-surveillance/traps"
				>
					<ArrowLeftIcon aria-hidden="true" />
					Back to traps
				</Link>
				{!result.isReady ? (
					<TrapDetailSkeleton />
				) : trap === undefined ? (
					<TrapUnavailable />
				) : (
					<TrapDetailContent trap={trap} />
				)}
			</div>
		</div>
	);
}

function TrapDetailContent({ trap }: { readonly trap: TrapRow }) {
	useBreadcrumbLabel(trap.id, trapDisplayName(trap));

	const { rows: methods } = useCollectionRows<CollectionMethodRow>(
		webCollections.collectionMethods,
	);
	const { rows: lures } = useCollectionRows<CollectionLureRow>(webCollections.collectionLures);
	const methodName =
		methods.find((method) => method.id === trap.collectionMethodId)?.name ?? 'Unknown method';
	const lureName =
		trap.collectionLureId === null
			? null
			: (lures.find((lure) => lure.id === trap.collectionLureId)?.name ?? 'Unknown lure');

	const addressNameById = useAddressNames(trap.addressId === null ? [] : [trap.addressId]);
	const addressName =
		trap.addressId === null ? null : (addressNameById.get(trap.addressId) ?? null);

	return (
		<>
			<div className="flex flex-wrap items-start justify-between gap-3">
				<div className="grid gap-1.5">
					<span className="inline-flex items-center gap-1.5 font-medium text-muted-foreground text-xs uppercase tracking-wide">
						<TrapIcon aria-hidden="true" className="size-3.5" />
						Trap
					</span>
					<h1 className="m-0 font-semibold text-[1.5rem] text-foreground leading-tight">
						{trapDisplayName(trap)}
					</h1>
					<p className="m-0 text-[0.95rem] text-muted-foreground">{methodName}</p>
				</div>
				<div className="flex items-center gap-2">
					<StatusBadge isActive={trap.isActive} />
					<Button asChild size="sm" variant="outline">
						<Link params={{ id: trap.id }} to="/adult-surveillance/traps/$id/edit">
							<EditIcon aria-hidden="true" />
							Edit
						</Link>
					</Button>
				</div>
			</div>

			<div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_22rem]">
				<div className="grid min-w-0 content-start gap-5">
					<TrapLocationCard point={{ lat: trap.lat, lng: trap.lng }} />
					<TrapCollectionsCard trapId={trap.id} />
				</div>
				<div className="grid content-start gap-5 xl:sticky xl:top-0 xl:self-start">
					<TrapDetailsCard
						address={addressName}
						lureName={lureName}
						methodName={methodName}
						trap={trap}
					/>
					<CommentsSection
						description="Access notes, maintenance, and follow-up for this trap."
						target={{ type: 'trap', id: trap.id }}
					/>
				</div>
			</div>
		</>
	);
}

function TrapLocationCard({
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

interface TrapCollectionEntry {
	readonly id: string;
	readonly collectedAt: string | null;
	readonly hasProblem: boolean;
	readonly isZeroResult: boolean;
	readonly hasBycatch: boolean;
	readonly species: readonly { readonly count: number }[];
}

function TrapCollectionsCard({ trapId }: { readonly trapId: string }) {
	// collections is on-demand; the correlated species include drives its subset.
	// Status-gated useLiveQuery (not the suspense variant) to avoid the post-unmount
	// hang on on-demand collections.
	const result = useLiveQuery(
		{
			gcTime: collectionsGcTimeMs,
			query: (query) =>
				query
					.from({ collection: webCollections.collections })
					.where(({ collection }) => eq(collection.trapId, trapId))
					.orderBy(({ collection }) => collection.collectedAt, 'desc')
					.select(({ collection }) => ({
						id: collection.id,
						collectedAt: collection.collectedAt,
						hasProblem: collection.hasProblem,
						isZeroResult: collection.isZeroResult,
						hasBycatch: collection.hasBycatch,
						species: toArray(
							query
								.from({ collectionSpecies: webCollections.collectionSpecies })
								.where(({ collectionSpecies }) => eq(collectionSpecies.collectionId, collection.id))
								.select(({ collectionSpecies }) => ({ count: collectionSpecies.count })),
						),
					})),
		},
		[trapId],
	);

	const collections = (result.data ?? []) as unknown as readonly TrapCollectionEntry[];

	return (
		<Card variant="surface">
			<CardHeader className="px-4 py-4">
				<div className="flex items-start justify-between gap-3">
					<div className="grid gap-1">
						<CardTitle className="flex items-center gap-2">
							<CollectionIcon aria-hidden="true" className="size-4 text-muted-foreground" />
							Collections
						</CardTitle>
						<CardDescription>Retrievals recorded against this trap.</CardDescription>
					</div>
					<Button asChild size="sm" variant="outline">
						<Link search={{ trapId }} to="/adult-surveillance/collections/create">
							Record collection
						</Link>
					</Button>
				</div>
			</CardHeader>
			<CardContent padding="compact">
				{result.isError ? (
					<CollectionsEmpty
						description="Collection records could not be loaded. Try again shortly."
						title="Collections unavailable"
					/>
				) : !result.isReady ? (
					<div className="grid gap-2">
						{[0, 1].map((index) => (
							<Skeleton className="h-14 w-full" key={index} />
						))}
					</div>
				) : collections.length === 0 ? (
					<CollectionsEmpty
						description="No collections have been recorded for this trap yet."
						title="No collections"
					/>
				) : (
					<ul className="grid gap-2">
						{collections.map((collection) => (
							<li
								className="flex items-center gap-3 rounded-md border border-border/40 bg-background/60 px-3 py-2.5"
								key={collection.id}
							>
								<div className="grid min-w-0 flex-1 gap-0.5">
									<Link
										className="rounded-sm font-medium text-foreground text-sm hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
										params={{ id: collection.id }}
										to="/adult-surveillance/collections/$id"
									>
										{collection.collectedAt === null
											? 'Pending collection'
											: `Collected ${formatMonthDay(collection.collectedAt)}`}
									</Link>
									<CollectionFlagBadges
										className="flex flex-wrap items-center gap-1.5"
										collection={collection}
									/>
								</div>
								<span className="shrink-0 text-muted-foreground text-xs tabular-nums">
									{specimenCount(collection)} specimens
								</span>
							</li>
						))}
					</ul>
				)}
			</CardContent>
		</Card>
	);
}

function TrapDetailsCard({
	trap,
	methodName,
	lureName,
	address,
}: {
	readonly trap: TrapRow;
	readonly methodName: string;
	readonly lureName: string | null;
	readonly address: string | null;
}) {
	return (
		<Card variant="surface">
			<CardHeader className="px-4 py-4">
				<CardTitle>Details</CardTitle>
			</CardHeader>
			<CardContent className="grid gap-4" padding="compact">
				<dl className="grid gap-2.5">
					<DetailRow label="Method">{methodName}</DetailRow>
					<DetailRow label="Lure">
						{lureName ?? <span className="text-muted-foreground">None</span>}
					</DetailRow>
					<DetailRow label="Code">
						{trap.trapCode ?? <span className="text-muted-foreground">Not set</span>}
					</DetailRow>
					<DetailRow label="Address">
						{address ?? <span className="text-muted-foreground">Ad-hoc / no address</span>}
					</DetailRow>
					<DetailRow label="Status">{trap.isActive ? 'Active' : 'Inactive'}</DetailRow>
				</dl>
				{trap.description !== null && trap.description.trim().length > 0 ? (
					<div className="grid gap-1">
						<span className="font-semibold text-muted-foreground text-xs uppercase">
							Description
						</span>
						<p className="m-0 text-foreground text-sm">{trap.description}</p>
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

function StatusBadge({ isActive }: { readonly isActive: boolean }) {
	return isActive ? (
		<Badge tone="success" variant="outline">
			<CheckCircle2Icon aria-hidden="true" />
			Active
		</Badge>
	) : (
		<Badge tone="neutral" variant="outline">
			<CircleIcon aria-hidden="true" />
			Inactive
		</Badge>
	);
}

function CollectionsEmpty({
	title,
	description,
}: {
	readonly title: string;
	readonly description: string;
}) {
	return (
		<Empty className="min-h-[140px] border border-border/40 bg-muted/30">
			<EmptyHeader>
				<EmptyMedia variant="icon">
					<CollectionIcon aria-hidden="true" />
				</EmptyMedia>
				<EmptyTitle>{title}</EmptyTitle>
				<EmptyDescription>{description}</EmptyDescription>
			</EmptyHeader>
		</Empty>
	);
}

function TrapDetailSkeleton() {
	return (
		<>
			<div className="grid gap-2">
				<Skeleton className="h-4 w-20" />
				<Skeleton className="h-8 w-64" />
			</div>
			<div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_22rem]">
				<div className="grid content-start gap-5">
					<Skeleton className="h-[360px]" />
					<Skeleton className="h-48" />
				</div>
				<Skeleton className="h-72" />
			</div>
		</>
	);
}

function TrapUnavailable() {
	return (
		<Empty className="min-h-[280px] border border-border/40 bg-muted/30">
			<EmptyHeader>
				<EmptyTitle>Trap unavailable</EmptyTitle>
				<EmptyDescription>
					This trap could not be found, or you do not have access to it.
				</EmptyDescription>
			</EmptyHeader>
		</Empty>
	);
}

function specimenCount(collection: TrapCollectionEntry): number {
	return collection.species.reduce((sum, entry) => sum + (entry.count ?? 0), 0);
}
