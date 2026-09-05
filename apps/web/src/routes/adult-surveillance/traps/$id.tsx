import { DetailList, DetailRow } from '@simmer-mosquito/ui-web/components/detail-row';
import { recordLink } from '@simmer-mosquito/ui-web/components/record-link';
import { Badge } from '@simmer-mosquito/ui-web/components/ui/badge';
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
	EmptyMedia,
	EmptyTitle,
} from '@simmer-mosquito/ui-web/components/ui/empty';
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
import { CheckCircle2Icon, CircleIcon, iconRegistry } from '@simmer-mosquito/ui-web/icons/registry';
import { createFileRoute, Link } from '@tanstack/react-router';
import { useCallback, useMemo, useState } from 'react';
import type { AskAcknowledged } from '../../../components/acknowledged-write';
import { useBreadcrumbLabel } from '../../../components/app-shell';
import { CommentsSection } from '../../../components/comments-section';
import { DangerZoneCard } from '../../../components/danger-zone-card';
import {
	activeDatePresetId,
	type DatePreset,
	DateRangeFilter,
	datePresetRange,
} from '../../../components/date-range-filter';
import { LinkedAddressValueById } from '../../../components/linked-address';
import { RecordLocationCard } from '../../../components/map/record-location-card';
import { RecordRegionsBand } from '../../../components/map/record-regions-band';
import {
	RecordDetailColumns,
	RecordDetailHeader,
	type RecordDetailLayout,
	RecordDetailPage,
} from '../../../components/record';
import { WriteOnly } from '../../../components/write-only';
import { useTrapMutations } from '../../../hooks/mutations/use-trap-mutations';
import { compareByCollectionDateDesc } from '../../../hooks/queries/collection-view';
import { type Trap, trapDisplayName } from '../../../hooks/queries/trap-view';
import { useSpeciesCatalog } from '../../../hooks/queries/use-species-catalog';
import { useTrap } from '../../../hooks/queries/use-trap';
import {
	type TrapCollection,
	useTrapCollections,
} from '../../../hooks/queries/use-trap-collections';
import { useOrganizationTimeZone } from '../../../hooks/use-organization-time-zone';
import { TRAP_DELETE_REFUSALS } from '../../../lib/acknowledgement-copy';
import {
	aggregateSpeciesDistribution,
	CollectionFlagBadges,
	collectionEffectiveDate,
	collectionRowDate,
	SpeciesDistributionBars,
} from '../-adult-display';
import { todayInTimeZone } from '../-overview-data';

export const Route = createFileRoute('/adult-surveillance/traps/$id')({
	component: RouteComponent,
});

const TrapIcon = iconRegistry.entities.trap.icon;
const CollectionIcon = iconRegistry.entities.collection.icon;
const SpeciesIcon = iconRegistry.entities.taxonomy.icon;
const EditIcon = iconRegistry.actions.edit.icon;

const layout: RecordDetailLayout = {
	aside: 'wide',
	stickyAside: true,
	skeleton: { eyebrow: 'w-20', main: ['h-[360px]', 'h-48'], aside: ['h-72'] },
};

function RouteComponent() {
	const { id } = Route.useParams();
	// traps is an eager collection, so this resolves without a fetch.
	const { trap, isReady } = useTrap(id);

	return (
		<RecordDetailPage
			back={{ label: 'Back to traps', to: '/adult-surveillance/traps' }}
			deleteRefusals={TRAP_DELETE_REFUSALS}
			layout={layout}
			noun="trap"
			reading={{ isReady, record: trap }}
		>
			{(record, askDelete) => <TrapDetailContent askDelete={askDelete} trap={record} />}
		</RecordDetailPage>
	);
}

function TrapDetailContent({
	trap,
	askDelete,
}: {
	readonly trap: Trap;
	readonly askDelete: AskAcknowledged;
}) {
	useBreadcrumbLabel(trap.id, trapDisplayName(trap));

	const mutations = useTrapMutations();
	// Joined by the read seam rather than looked up against two catalog rosters —
	// same two names, one query instead of three. The lure guard is on the trap's
	// own column, not the joined name: an unbaited trap has no lure, while one
	// whose lure was deleted has a lure nothing can name, and the two read
	// differently.
	const { methodName } = trap;
	const lureName = trap.lureId === null ? null : (trap.lureName ?? 'Unknown lure');

	return (
		<RecordDetailColumns
			aside={
				<>
					<TrapDetailsCard lureName={lureName} methodName={methodName} trap={trap} />
					<CommentsSection
						description="Access notes, maintenance, and follow-up for this trap."
						target={{ type: 'trap', id: trap.id }}
					/>
				</>
			}
			header={
				<RecordDetailHeader
					actions={
						<>
							<StatusBadge isActive={trap.isActive} />
							<WriteOnly minimum="manager">
								<Button asChild size="sm" variant="outline">
									<Link params={{ id: trap.id }} to="/adult-surveillance/traps/$id/edit">
										<EditIcon aria-hidden="true" />
										Edit
									</Link>
								</Button>
							</WriteOnly>
						</>
					}
					eyebrow="Trap"
					icon={TrapIcon}
					subtitle={methodName}
					title={trapDisplayName(trap)}
				/>
			}
			layout={layout}
		>
			<div className="grid content-start gap-3">
				<TrapLocationCard point={{ lat: trap.latitude, lng: trap.longitude }} />
				<RecordRegionsBand noun="trap" recordId={trap.id} recordType="traps" />
			</div>
			<TrapCollectionsCard trapId={trap.id} />
			<DangerZoneCard
				ask={askDelete}
				name={trapDisplayName(trap)}
				noun="trap"
				onDelete={(acknowledgements) => mutations.remove(trap.id, acknowledgements)}
				recordId={trap.id}
				recordType="trap"
				returnTo="/adult-surveillance/traps"
			/>
		</RecordDetailColumns>
	);
}

function TrapLocationCard({
	point,
}: {
	readonly point: { readonly lat: number; readonly lng: number };
}) {
	return (
		<RecordLocationCard
			description={`${point.lat.toFixed(5)}, ${point.lng.toFixed(5)}`}
			emptyDescription="This trap has no location to display."
			geojson={{ type: 'Point', coordinates: [point.lng, point.lat] }}
			geomType="Point"
			height="h-[280px]"
		/>
	);
}

const collectionsPageSize = 10;

function TrapCollectionsCard({ trapId }: { readonly trapId: string }) {
	const timeZone = useOrganizationTimeZone();
	// `seasons: null` — this card is a trap's whole history, and its paging is what
	// keeps that readable. The trap directory windows the same read to three
	// seasons because it is a browsing surface; here the operator arrived by way of
	// one trap and the collection they want may be the oldest one.
	const {
		collections: rows,
		isReady,
		isError,
	} = useTrapCollections(trapId, {
		seasons: null,
		timeZone,
	});

	// Re-sorted here rather than in the query: the two timing modes date a
	// collection from different columns, one a `timestamptz` and the other a
	// `date`, and no single `orderBy` ranks across those types.
	const collections = useMemo(() => [...rows].sort(compareByCollectionDateDesc), [rows]);

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
						<WriteOnly>
							<Button asChild size="sm" variant="outline">
								<Link search={{ trapId }} to="/adult-surveillance/collections/create">
									Record Collection
								</Link>
							</Button>
						</WriteOnly>
					</div>
				</CardHeader>
				<CardContent padding="compact">
					<TabsContent className="mt-0" value="collections">
						<TrapCollectionsList
							collections={collections}
							isError={isError}
							isReady={isReady}
							trapId={trapId}
						/>
					</TabsContent>
					<TabsContent className="mt-0" value="species">
						<TrapSpeciesDistribution
							collections={collections}
							isError={isError}
							isReady={isReady}
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
	readonly collections: readonly TrapCollection[];
	readonly isReady: boolean;
	readonly isError: boolean;
	readonly trapId: string;
}) {
	const timeZone = useOrganizationTimeZone();
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
				title="Collections Unavailable"
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
				title="No Collections"
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
										className={recordLink()}
										params={{ id: collection.id }}
										to="/adult-surveillance/collections/$id"
									>
										{collectionRowDate(collection, timeZone)}
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
	readonly collections: readonly TrapCollection[];
	readonly isReady: boolean;
	readonly isError: boolean;
}) {
	const species = useSpeciesCatalog();
	const nameById = useMemo(
		() => new Map(species.map((row) => [row.id, row.displayName] as const)),
		[species],
	);
	// The catalog carries a placeholder "Unidentified mosquito" species for specimens
	// that were never keyed out; it isn't a real taxon, so keep it out of the
	// species breakdown.
	const unidentifiedSpeciesIds = useMemo(
		() => new Set(species.filter((row) => row.epithet === 'unidentified').map((row) => row.id)),
		[species],
	);

	const timeZone = useOrganizationTimeZone();
	const today = useMemo(() => todayInTimeZone(timeZone), [timeZone]);
	const [from, setFrom] = useState('');
	const [to, setTo] = useState('');
	const hasRange = from !== '' || to !== '';

	// Editing one bound past the other drags the other along, so the range never
	// inverts into an empty window.
	const handleFromChange = useCallback((next: string) => {
		setFrom(next);
		setTo((prev) => (next !== '' && prev !== '' && next > prev ? next : prev));
	}, []);
	const handleToChange = useCallback((next: string) => {
		setTo(next);
		setFrom((prev) => (next !== '' && prev !== '' && next < prev ? next : prev));
	}, []);
	const applyPreset = useCallback(
		(preset: DatePreset) => {
			const range = datePresetRange(preset, today);
			setFrom(range.from);
			setTo(range.to);
		},
		[today],
	);
	const activePresetId = useMemo(() => activeDatePresetId(from, to, today), [from, to, today]);

	const { distribution, matchedCollections } = useMemo(() => {
		const inRange = collections.filter((collection) =>
			withinDateRange(collectionEffectiveDate(collection, timeZone), from, to),
		);
		// Statistics count female mosquitoes only (matching the collections table),
		// and exclude the unidentified placeholder taxon.
		const specimens = inRange.flatMap((collection) =>
			collection.species.filter(
				(entry) => entry.sex === 'female' && !unidentifiedSpeciesIds.has(entry.speciesId),
			),
		);
		return {
			distribution: aggregateSpeciesDistribution(specimens, nameById),
			matchedCollections: inRange.length,
		};
	}, [collections, nameById, from, to, timeZone, unidentifiedSpeciesIds]);

	return (
		<div className="grid gap-4">
			<DateRangeFilter
				activePresetId={activePresetId}
				from={from}
				onApplyPreset={applyPreset}
				onFromChange={handleFromChange}
				onToChange={handleToChange}
				to={to}
				today={today}
			/>

			{isError ? (
				<CollectionsEmpty
					description="Collection records could not be loaded. Try again shortly."
					title="Species Data Unavailable"
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
					title="No Specimens"
				/>
			) : (
				<>
					<p className="text-muted-foreground text-xs">
						<span className="font-medium text-foreground tabular-nums">
							{distribution.grandTotal.toLocaleString()}
						</span>{' '}
						female specimens across{' '}
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
}: {
	readonly trap: Trap;
	readonly methodName: string;
	readonly lureName: string | null;
}) {
	return (
		<Card variant="surface">
			<CardHeader className="px-4 py-4">
				<CardTitle>Details</CardTitle>
			</CardHeader>
			<CardContent className="grid gap-4" padding="compact">
				<DetailList>
					<DetailRow label="Method">{methodName}</DetailRow>
					<DetailRow empty="None" label="Lure">
						{lureName}
					</DetailRow>
					<DetailRow label="Code">{trap.trapCode}</DetailRow>
					<DetailRow label="Address">
						<LinkedAddressValueById addressId={trap.addressId} />
					</DetailRow>
					<DetailRow label="Status">{trap.isActive ? 'Active' : 'Inactive'}</DetailRow>
				</DetailList>
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

/**
 * Inside `[from, to]`, where an empty bound is no bound at all.
 *
 * An undated collection falls outside any bound that is set: a trap still out
 * has no day to be inside a window, and showing it in one would count work that
 * has not happened yet.
 */
function withinDateRange(date: string | null, from: string, to: string): boolean {
	if (from !== '' && (date === null || date < from)) {
		return false;
	}
	return !(to !== '' && (date === null || date > to));
}

/** Total female mosquitoes tallied across the collection's species rows. */
function femaleCount(collection: TrapCollection): number {
	return collection.species.reduce(
		(sum, entry) => sum + (entry.sex === 'female' ? (entry.count ?? 0) : 0),
		0,
	);
}

/** Distinct species with at least one specimen in the collection. */
function speciesCount(collection: TrapCollection): number {
	return collection.species.filter((entry) => (entry.count ?? 0) > 0).length;
}
