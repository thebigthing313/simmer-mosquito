import type {
	CollectionLureRow,
	CollectionMethodRow,
	SpeciesRow,
	TrapRow,
} from '@simmer-mosquito/sync';
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
import { Input } from '@simmer-mosquito/ui-web/components/ui/input';
import {
	Pagination,
	PaginationContent,
	PaginationItem,
	PaginationNext,
	PaginationPrevious,
} from '@simmer-mosquito/ui-web/components/ui/pagination';
import { Skeleton } from '@simmer-mosquito/ui-web/components/ui/skeleton';
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from '@simmer-mosquito/ui-web/components/ui/table';
import {
	Tabs,
	TabsContent,
	TabsList,
	TabsTrigger,
} from '@simmer-mosquito/ui-web/components/ui/tabs';
import {
	ArrowLeftIcon,
	CheckCircle2Icon,
	CircleIcon,
	iconRegistry,
} from '@simmer-mosquito/ui-web/icons/registry';
import { eq, toArray, useLiveQuery } from '@tanstack/react-db';
import { createFileRoute, Link } from '@tanstack/react-router';
import type { Map as MapboxMap } from 'mapbox-gl';
import { type ReactNode, useCallback, useMemo, useState } from 'react';
import { useBreadcrumbLabel } from '../../../components/app-shell';
import { CommentsSection } from '../../../components/comments-section';
import { MapCanvas } from '../../../components/map';
import { useCollectionRows } from '../../../hooks/use-collection-rows';
import { webCollections } from '../../../sync/webCollections';
import {
	aggregateSpeciesDistribution,
	CollectionFlagBadges,
	collectionEffectiveDate,
	collectionTitle,
	SpeciesDistributionBars,
	trapDisplayName,
} from '../-adult-display';
import { useAddressNames } from '../-overview-data';

export const Route = createFileRoute('/adult-surveillance/traps/$id')({
	component: RouteComponent,
});

const TrapIcon = iconRegistry.entities.trap.icon;
const CollectionIcon = iconRegistry.entities.collection.icon;
const SpeciesIcon = iconRegistry.entities.taxonomy.icon;
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
	readonly collectionDate: string | null;
	readonly hasProblem: boolean;
	readonly isZeroResult: boolean;
	readonly hasBycatch: boolean;
	readonly species: readonly {
		readonly speciesId: string;
		readonly count: number;
		readonly sex: string | null;
	}[];
}

const collectionsPageSize = 10;

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
						collectionDate: collection.collectionDate,
						hasProblem: collection.hasProblem,
						isZeroResult: collection.isZeroResult,
						hasBycatch: collection.hasBycatch,
						species: toArray(
							query
								.from({ collectionSpecies: webCollections.collectionSpecies })
								.where(({ collectionSpecies }) => eq(collectionSpecies.collectionId, collection.id))
								.select(({ collectionSpecies }) => ({
									speciesId: collectionSpecies.speciesId,
									count: collectionSpecies.count,
									sex: collectionSpecies.sex,
								})),
						),
					})),
		},
		[trapId],
	);

	// Re-sort client-side: the query's orderBy is applied before the correlated
	// `toArray` species subquery, and TanStack DB emits the joined result in key
	// order rather than the requested order — so establish most-recent-first here.
	const collections = useMemo(() => {
		const rows = (result.data ?? []) as unknown as readonly TrapCollectionEntry[];
		return [...rows].sort(compareByCollectedDesc);
	}, [result.data]);

	return (
		<Card variant="surface">
			<Tabs defaultValue="collections">
				<CardHeader className="px-4 py-4">
					<div className="flex flex-wrap items-center justify-between gap-3">
						<TabsList>
							<TabsTrigger value="collections">
								<CollectionIcon aria-hidden="true" />
								Collections
							</TabsTrigger>
							<TabsTrigger value="species">
								<SpeciesIcon aria-hidden="true" />
								Species
							</TabsTrigger>
						</TabsList>
						<Button asChild size="sm" variant="outline">
							<Link search={{ trapId }} to="/adult-surveillance/collections/create">
								Record collection
							</Link>
						</Button>
					</div>
				</CardHeader>
				<CardContent padding="compact">
					<TabsContent className="mt-0" value="collections">
						<TrapCollectionsList
							collections={collections}
							isError={result.isError}
							isReady={result.isReady}
							trapId={trapId}
						/>
					</TabsContent>
					<TabsContent className="mt-0" value="species">
						<TrapSpeciesDistribution
							collections={collections}
							isError={result.isError}
							isReady={result.isReady}
						/>
					</TabsContent>
				</CardContent>
			</Tabs>
		</Card>
	);
}

function TrapCollectionsList({
	collections,
	isReady,
	isError,
	trapId,
}: {
	readonly collections: readonly TrapCollectionEntry[];
	readonly isReady: boolean;
	readonly isError: boolean;
	readonly trapId: string;
}) {
	const pageCount = Math.max(1, Math.ceil(collections.length / collectionsPageSize));
	const [page, setPage] = useState(0);
	// Reset to the first page when navigating to a different trap — this card's
	// instance is reused across param changes. (React's adjust-state-in-render pattern.)
	const [pageTrapId, setPageTrapId] = useState(trapId);
	if (pageTrapId !== trapId) {
		setPageTrapId(trapId);
		setPage(0);
	}
	// Clamp back into range when the underlying set shrinks (e.g. a deletion syncs
	// in while sitting on the last page).
	const clampedPage = Math.min(page, pageCount - 1);
	const pageStart = clampedPage * collectionsPageSize;
	const visibleCollections = collections.slice(pageStart, pageStart + collectionsPageSize);

	if (isError) {
		return (
			<CollectionsEmpty
				description="Collection records could not be loaded. Try again shortly."
				title="Collections unavailable"
			/>
		);
	}
	if (!isReady) {
		return (
			<div className="grid gap-2">
				{[0, 1].map((index) => (
					<Skeleton className="h-14 w-full" key={index} />
				))}
			</div>
		);
	}
	if (collections.length === 0) {
		return (
			<CollectionsEmpty
				description="No collections have been recorded for this trap yet."
				title="No collections"
			/>
		);
	}
	return (
		<div className="grid gap-3">
			<p className="text-muted-foreground text-xs">Mosquito count only reflects females.</p>
			<div className="overflow-hidden rounded-md border border-border/40">
				<Table>
					<TableHeader>
						<TableRow className="hover:bg-transparent">
							<TableHead>Date</TableHead>
							<TableHead>Flags</TableHead>
							<TableHead className="text-right">Species</TableHead>
							<TableHead className="text-right">Mosquitoes</TableHead>
						</TableRow>
					</TableHeader>
					<TableBody>
						{visibleCollections.map((collection) => (
							<TableRow key={collection.id}>
								<TableCell>
									<Link
										className="rounded-sm font-medium text-foreground hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
										params={{ id: collection.id }}
										to="/adult-surveillance/collections/$id"
									>
										{collectionTitle(collection)}
									</Link>
								</TableCell>
								<TableCell>
									<CollectionFlagBadges
										className="flex flex-wrap items-center gap-1.5"
										collection={collection}
									/>
								</TableCell>
								<TableCell className="text-right text-muted-foreground tabular-nums">
									{speciesCount(collection)}
								</TableCell>
								<TableCell className="text-right tabular-nums">
									{femaleCount(collection).toLocaleString()}
								</TableCell>
							</TableRow>
						))}
					</TableBody>
				</Table>
			</div>
			{pageCount > 1 ? (
				<CollectionsPagination
					onPageChange={setPage}
					page={clampedPage}
					pageCount={pageCount}
					total={collections.length}
				/>
			) : null}
		</div>
	);
}

function TrapSpeciesDistribution({
	collections,
	isReady,
	isError,
}: {
	readonly collections: readonly TrapCollectionEntry[];
	readonly isReady: boolean;
	readonly isError: boolean;
}) {
	const { rows: species } = useCollectionRows<SpeciesRow>(webCollections.species);
	const nameById = useMemo(
		() => new Map(species.map((row) => [row.id, row.displayName] as const)),
		[species],
	);

	const [from, setFrom] = useState('');
	const [to, setTo] = useState('');
	const hasRange = from !== '' || to !== '';

	const { distribution, matchedCollections } = useMemo(() => {
		const inRange = collections.filter((collection) => {
			const date = collectionEffectiveDate(collection)?.slice(0, 10) ?? null;
			if (from !== '' && (date === null || date < from)) {
				return false;
			}
			if (to !== '' && (date === null || date > to)) {
				return false;
			}
			return true;
		});
		return {
			distribution: aggregateSpeciesDistribution(
				inRange.flatMap((collection) => collection.species),
				nameById,
			),
			matchedCollections: inRange.length,
		};
	}, [collections, nameById, from, to]);

	return (
		<div className="grid gap-4">
			<div className="flex flex-wrap items-end gap-3">
				<div className="grid gap-1">
					<label className="text-muted-foreground text-xs" htmlFor="trap-species-from">
						From
					</label>
					<Input
						className="h-8 w-[9.5rem]"
						id="trap-species-from"
						max={to || undefined}
						onChange={(event) => setFrom(event.target.value)}
						type="date"
						value={from}
					/>
				</div>
				<div className="grid gap-1">
					<label className="text-muted-foreground text-xs" htmlFor="trap-species-to">
						To
					</label>
					<Input
						className="h-8 w-[9.5rem]"
						id="trap-species-to"
						min={from || undefined}
						onChange={(event) => setTo(event.target.value)}
						type="date"
						value={to}
					/>
				</div>
				{hasRange ? (
					<Button
						className="h-8"
						onClick={() => {
							setFrom('');
							setTo('');
						}}
						size="sm"
						variant="ghost"
					>
						Clear
					</Button>
				) : null}
			</div>

			{isError ? (
				<CollectionsEmpty
					description="Collection records could not be loaded. Try again shortly."
					title="Species data unavailable"
				/>
			) : !isReady ? (
				<div className="grid gap-2.5">
					{[0, 1, 2, 3].map((index) => (
						<Skeleton className="h-6 w-full" key={index} />
					))}
				</div>
			) : distribution.grandTotal === 0 ? (
				<CollectionsEmpty
					description={
						hasRange
							? 'No specimens were identified in the selected date range.'
							: 'No specimens have been identified for this trap yet.'
					}
					title="No specimens"
				/>
			) : (
				<>
					<p className="text-muted-foreground text-xs">
						<span className="font-medium text-foreground tabular-nums">
							{distribution.grandTotal.toLocaleString()}
						</span>{' '}
						specimens across{' '}
						<span className="font-medium text-foreground tabular-nums">
							{distribution.speciesCount}
						</span>{' '}
						species · <span className="tabular-nums">{matchedCollections}</span>{' '}
						{matchedCollections === 1 ? 'collection' : 'collections'}
					</p>
					<SpeciesDistributionBars
						className="grid gap-2.5"
						grandTotal={distribution.grandTotal}
						totals={distribution.totals}
					/>
				</>
			)}
		</div>
	);
}

function CollectionsPagination({
	page,
	pageCount,
	total,
	onPageChange,
}: {
	readonly page: number;
	readonly pageCount: number;
	readonly total: number;
	readonly onPageChange: (page: number) => void;
}) {
	const hasPrevious = page > 0;
	const hasNext = page < pageCount - 1;
	const rangeStart = page * collectionsPageSize + 1;
	const rangeEnd = Math.min((page + 1) * collectionsPageSize, total);

	return (
		<div className="flex flex-wrap items-center justify-between gap-2 pt-1">
			<span className="text-muted-foreground text-xs tabular-nums">
				{rangeStart}–{rangeEnd} of {total}
			</span>
			<Pagination className="mx-0 w-auto justify-end">
				<PaginationContent>
					<PaginationItem>
						<PaginationPrevious
							aria-disabled={!hasPrevious}
							className={hasPrevious ? undefined : 'pointer-events-none opacity-50'}
							onClick={(event) => {
								event.preventDefault();
								if (hasPrevious) {
									onPageChange(page - 1);
								}
							}}
							tabIndex={hasPrevious ? undefined : -1}
						/>
					</PaginationItem>
					<PaginationItem>
						<PaginationNext
							aria-disabled={!hasNext}
							className={hasNext ? undefined : 'pointer-events-none opacity-50'}
							onClick={(event) => {
								event.preventDefault();
								if (hasNext) {
									onPageChange(page + 1);
								}
							}}
							tabIndex={hasNext ? undefined : -1}
						/>
					</PaginationItem>
				</PaginationContent>
			</Pagination>
		</div>
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

/**
 * Most-recent-first by effective date (collectedAt, falling back to the
 * scheduled collectionDate for pending collections). Undated rows sort last.
 */
function compareByCollectedDesc(a: TrapCollectionEntry, b: TrapCollectionEntry): number {
	const aDate = collectionEffectiveDate(a);
	const bDate = collectionEffectiveDate(b);
	if (aDate === bDate) {
		return 0;
	}
	if (aDate === null) {
		return 1;
	}
	if (bDate === null) {
		return -1;
	}
	return aDate < bDate ? 1 : -1;
}

/** Total female mosquitoes tallied across the collection's species rows. */
function femaleCount(collection: TrapCollectionEntry): number {
	return collection.species.reduce(
		(sum, entry) => sum + (entry.sex === 'female' ? (entry.count ?? 0) : 0),
		0,
	);
}

/** Distinct species with at least one specimen in the collection. */
function speciesCount(collection: TrapCollectionEntry): number {
	return collection.species.filter((entry) => (entry.count ?? 0) > 0).length;
}
